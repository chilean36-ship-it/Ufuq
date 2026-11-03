// Ufuq — tg-webhook: admin-only Telegram bot (English). No AI anywhere: plain commands answered from bot.rpc_* functions.
// Trusts nothing until X-Telegram-Bot-Api-Secret-Token matches TG_WEBHOOK_SECRET (set via setWebhook secret_token).
// Answers only the admins (OWNER_CHAT_ID + ADMIN_CHAT_IDS) in a private chat, each in their own chat. Anyone else gets
// silence and the admins get a short "stranger" notice (at most 3 per 10 minutes, counted in SQL).
// Rate limit (20 calls/min, shared) is enforced in SQL (error code UB429).
// Always returns 200 to Telegram after the secret check, so failed updates are not retried endlessly.
// Deployed WITHOUT JWT verification: it authenticates by the webhook secret only.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { adminIds, db, errCode, esc, isRateLimited, reportText, riskText, safeEqual, send, sendAdmins, tashkent, tg } from "../_shared/bot.ts";

const MAX_BODY = 64 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ok = () => new Response("ok");

const HELP = [
  "🤖 <b>Ufuq bot</b>",
  "",
  "/student &lt;name or ID&gt; — find a student",
  "/risk — students at risk",
  "/today — daily report",
  "/help — this help",
  "",
  "The daily report arrives every day at 08:00 (Tashkent).",
].join("\n");

const EXAM_STATE: Record<string, string> = {
  baholangan: "✅ graded",
  topshirilgan: "📝 submitted",
  muddati_otgan: "⏰ missed",
  kutilmoqda: "⌛ open",
};

const STATUS: Record<string, string> = { active: "active", unpaid: "unpaid", blocked: "blocked" };

async function cmdStudent(chat: number, q: string) {
  if (q.length < 2) return send(chat, "Type at least 2 letters: /student Ali");
  const rows = await db()`select * from bot.rpc_talaba_qidir(${q.slice(0, 64)})`;
  if (!rows.length) return send(chat, "No student found.");
  const text = rows
    .map((r, i) => `${i + 1}. <b>${esc(r.full_name)}</b> · ${esc(r.student_id ?? "—")} · level ${r.level ?? "—"}\n   ${esc(r.guruhlar ?? "no group")}`)
    .join("\n");
  const keyboard = rows.map((r, i) => [{ text: `${i + 1}. ${String(r.full_name ?? "").slice(0, 40)}`, callback_data: `k:${r.id}` }]);
  return send(chat, `🔎 Found: ${rows.length}\n\n${text}`, { reply_markup: { inline_keyboard: keyboard } });
}

async function cmdCard(chat: number, id: string) {
  const [{ k }] = await db()`select bot.rpc_talaba_karta(${id}::uuid) as k`;
  if (!k) return send(chat, "Student not found.");
  const o = k.oxirgi_otish;
  const d = k.davomat_30k;
  const lines = [
    `👤 <b>${esc(k.ism)}</b> · ${esc(k.student_id ?? "—")}`,
    `Status: ${esc(STATUS[k.holat] ?? k.holat)} · Level: <b>${k.daraja ?? "—"}</b>`,
    `Groups: ${esc((k.guruhlar ?? []).join(", ") || "—")}`,
    `Last login: ${tashkent(k.oxirgi_kirish)}`,
    o ? `Last level change: ${o.dan} → ${o.ga} (${o.natija === "passed" ? "passed" : "failed"}, ${tashkent(o.sana).slice(0, 10)})` : "Last level change: —",
    `Attendance (30 days): ${d?.jami ? `${d.bor}/${d.jami}` : "—"}`,
    "",
    "<b>Exams</b>",
    ...((k.imtihonlar ?? []).length
      ? k.imtihonlar.map((e: any) =>
          `• ${esc(e.nomi)} — ${EXAM_STATE[e.holat] ?? esc(e.holat)}${e.ball != null ? `, ${e.ball} pts` : ""}${e.muddat ? ` (due ${tashkent(e.muddat).slice(0, 10)})` : ""}`)
      : ["—"]),
  ];
  return send(chat, lines.join("\n"));
}

async function cmdRisk(chat: number) {
  const rows = await db()`select * from bot.rpc_xavf_royxati()`;
  return send(chat, riskText(
    "⚠️ <b>Students at risk</b>",
    rows.map((r) => ({ sabab: r.sabab, line: `${esc(r.student_id ?? "—")} ${esc(r.full_name)} — ${esc(r.izoh)}` })),
  ));
}

async function cmdToday(chat: number) {
  const [{ r }] = await db()`select bot.rpc_kunlik_hisobot() as r`;
  return send(chat, reportText(r));
}

async function handleAdmin(chat: number, update: any) {
  const cb = update.callback_query;
  if (cb) {
    await tg("answerCallbackQuery", { callback_query_id: cb.id });
    const m = /^k:(.+)$/.exec(String(cb.data ?? ""));
    if (m && UUID.test(m[1])) await cmdCard(chat, m[1]);
    return;
  }
  const text = String(update.message?.text ?? "").trim();
  const [head, ...rest] = text.split(/\s+/);
  const cmd = head.toLowerCase().replace(/@.*$/, "");
  const arg = rest.join(" ").trim();
  switch (cmd) {
    case "/student": case "/talaba": return cmdStudent(chat, arg);
    case "/risk": case "/xavf": return cmdRisk(chat);
    case "/today": case "/bugun": return cmdToday(chat);
    default: return send(chat, HELP);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("POST expected", { status: 405 });
  const secret = Deno.env.get("TG_WEBHOOK_SECRET") || "";
  const given = req.headers.get("x-telegram-bot-api-secret-token") || "";
  if (!secret || !given || !safeEqual(secret, given)) return new Response("Unauthorized", { status: 401 });
  if (Number(req.headers.get("content-length") || 0) > MAX_BODY) return new Response("too large", { status: 413 });

  let update: any;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY) return new Response("too large", { status: 413 });
    update = JSON.parse(raw);
  } catch { return ok(); }

  const msg = update.message ?? update.callback_query?.message;
  const from = update.message?.from ?? update.callback_query?.from;
  if (!msg || !from) return ok(); // edited messages, channel posts etc. are ignored

  const admins = adminIds();
  const isAdmin = msg.chat?.type === "private" && String(msg.chat.id) === String(from.id) && admins.includes(String(from.id));

  try {
    if (!isAdmin) {
      const [{ notify }] = await db()`select bot.rpc_begona_urinish() as notify`;
      if (notify) await sendAdmins(`🚫 Stranger attempt: Telegram ID <code>${Number(from.id) || 0}</code> wrote to the bot.`);
      return ok(); // the stranger gets no answer at all
    }
    await handleAdmin(msg.chat.id, update);
  } catch (e) {
    if (isRateLimited(e)) await send(msg.chat.id, "⏳ Too many requests (20 per minute). Try again in a minute.");
    else {
      console.error(`tg-webhook: db error ${errCode(e)}`);
      if (isAdmin) await send(msg.chat.id, "❗ Something went wrong. Check the Edge Function logs.");
    }
  }
  return ok();
});
