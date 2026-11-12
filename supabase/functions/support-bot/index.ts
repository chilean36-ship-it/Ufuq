// Ufuq — support-bot: students write to the bot, staff answer from a Telegram forum group.
//
// How it works
// - Every student gets their own topic in the staff group (SUPPORT_GROUP_ID, a supergroup with Topics turned on,
//   the bot an admin with "Manage topics"). The first post in the topic is a pinned card with the student's details.
// - Anything the student sends (text, photo, video, voice, round video, file, sticker, location, contact, album…) is
//   copied into their topic. Anything staff write in the topic is copied back to the student, from the bot's name.
// - Edits are synced both ways, and replies to a specific message stay replies on the other side.
// - Staff messages starting with "//" are internal notes: they stay in the group and are never sent.
// - Topic commands: /info, /ban, /unban, /close. General topic: /stats, /help. Anywhere: /id (shows the chat id).
//
// Security: trusts nothing until X-Telegram-Bot-Api-Secret-Token matches the webhook secret (SUPPORT_WEBHOOK_SECRET,
// or by default a SHA-256 derived from the bot token, so no extra secret is needed). Always answers Telegram with 200
// after that check, so a failing update is not retried forever. Never logs message text or tokens.
// Setup without new secrets:
// - token: SUPPORT_BOT_TOKEN, else TELEGRAM_BOT_TOKEN (the former admin bot).
// - staff group: an owner/admin (OWNER_CHAT_ID / ADMIN_CHAT_IDS) types /setup in the forum group; stored in the DB.
//   SUPPORT_GROUP_ID, if set, wins.
// - webhook: GET ?setup=<one-time nonce from support.settings> makes the function register its own webhook.
// - DB: SUPPORT_DB_URL (role support_bot) if set, else the built-in SUPABASE_DB_URL. Only support.rpc_* are called.
// Deployed WITHOUT JWT verification (see config.toml).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.5";

// ───────────── Texts (edit freely) ─────────────
const T = {
  welcome: (name: string) =>
    `Assalomu alaykum, <b>${esc(name)}</b>! 👋\n\n` +
    `Bu <b>Ufuq</b> markazining yordam boti. Savolingizni shu yerga yozing — ` +
    `matn, rasm, ovozli xabar, video yoki fayl yuborishingiz mumkin.\n\n` +
    `Ustozlarimiz tez orada shu yerning o'zida javob berishadi. ✍️`,
  received: "✅ Xabaringiz qabul qilindi. Tez orada javob beramiz.",
  flood: "⏳ Juda ko'p xabar yubordingiz. Bir daqiqadan so'ng qayta urinib ko'ring.",
  unsupported: "Bu turdagi xabarni yuborib bo'lmadi. Iltimos, matn, rasm yoki fayl yuboring.",
  error: "❗ Xatolik yuz berdi. Birozdan so'ng qayta urinib ko'ring.",
};

const GROUP_HELP = [
  "🤖 <b>Yordam boti — qo'llanma</b>",
  "",
  "Har bir talaba alohida mavzuda (topic). Mavzu ichida yozgan har qanday xabaringiz talabaga bot nomidan boradi.",
  "✅ 👍 belgisi — xabar yetkazildi.",
  "",
  "<b>Mavzu ichida:</b>",
  "<code>// matn</code> — ichki izoh, talabaga bormaydi",
  "/info — talaba haqida",
  "/ban — bloklash (xabarlari kelmaydi)",
  "/unban — blokdan chiqarish",
  "/close — mavzuni yopish (talaba yozsa o'zi ochiladi)",
  "",
  "<b>General mavzuda:</b>",
  "/stats — statistika",
  "/help — shu qo'llanma",
  "",
  "Xabarni tahrirlasangiz — talabadagi nusxa ham o'zgaradi. Biror xabarga «reply» qilsangiz — talabada ham reply bo'ladi.",
].join("\n");

// ───────────── Plumbing ─────────────
const MAX_BODY = 256 * 1024;
const ok = () => new Response("ok");
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const TOKEN = Deno.env.get("SUPPORT_BOT_TOKEN") || Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
// Staff group id: env override, else stored in support.settings by /setup (loaded once per isolate).
let GROUP_ID = Number(Deno.env.get("SUPPORT_GROUP_ID") || 0);
let groupLoaded = GROUP_ID !== 0;
async function loadGroup() {
  if (groupLoaded && GROUP_ID) return; // until /setup has run, check again on every update (other isolates)
  const [{ g }] = await db()`select support.rpc_get_group() as g`;
  GROUP_ID = Number(g || 0);
  groupLoaded = true;
}

function adminIds(): string[] {
  const raw = `${Deno.env.get("OWNER_CHAT_ID") ?? ""},${Deno.env.get("ADMIN_CHAT_IDS") ?? ""}`;
  return [...new Set(raw.split(",").map((s) => s.trim()).filter((s) => /^\d+$/.test(s)))];
}

async function webhookSecret(): Promise<string> {
  const own = Deno.env.get("SUPPORT_WEBHOOK_SECRET");
  if (own) return own;
  if (!TOKEN) return "";
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`ufuq-support-webhook:${TOKEN}`));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

let sql: ReturnType<typeof postgres> | null = null;
function db() {
  if (!sql) {
    const url = Deno.env.get("SUPPORT_DB_URL") || Deno.env.get("SUPABASE_DB_URL");
    if (!url) throw new Error("DB url missing");
    sql = postgres(url, { prepare: false, max: 1, idle_timeout: 20, connect_timeout: 10 });
  }
  return sql;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

type TgRes = { ok: boolean; result?: any; description?: string; error_code?: number };

async function tg(method: string, body: Record<string, unknown>): Promise<TgRes> {
  const token = TOKEN;
  if (!token) { console.error("support-bot: bot token missing"); return { ok: false }; }
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await r.json().catch(() => ({ ok: false }))) as TgRes;
    if (!j.ok) console.error(`tg ${method}: ${j.error_code ?? r.status} ${String(j.description ?? "").slice(0, 120)}`);
    return j;
  } catch {
    console.error(`tg ${method}: network error`);
    return { ok: false };
  }
}

const send = (chat: number, text: string, extra: Record<string, unknown> = {}) =>
  tg("sendMessage", { chat_id: chat, text, parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...extra });

const sendTopic = (topic: number, text: string, extra: Record<string, unknown> = {}) =>
  send(GROUP_ID, text, { message_thread_id: topic, ...extra });

const react = (chat: number, msgId: number, emoji: string) =>
  tg("setMessageReaction", { chat_id: chat, message_id: msgId, reaction: [{ type: "emoji", emoji }] });

const topicGone = (r: TgRes) => /thread not found|TOPIC_DELETED|TOPIC_ID_INVALID/i.test(r.description ?? "");
const topicClosed = (r: TgRes) => /TOPIC_CLOSED/i.test(r.description ?? "");
const blockedByUser = (r: TgRes) => r.error_code === 403;

const fullName = (u: any) => [u?.first_name, u?.last_name].filter(Boolean).join(" ").trim() || "Talaba";
const tashkent = (d: Date | string) =>
  new Date(d).toLocaleString("sv-SE", { timeZone: "Asia/Tashkent" }).slice(0, 16);

// Messages that copyMessage cannot copy (service messages, etc.).
const COPYABLE = ["text", "photo", "video", "voice", "video_note", "audio", "document", "sticker", "animation",
  "location", "venue", "contact", "poll", "dice", "story"];
const isCopyable = (m: any) => COPYABLE.some((k) => m[k] !== undefined);

function parseCmd(text: string): { cmd: string; arg: string } {
  const [head, ...rest] = text.trim().split(/\s+/);
  return { cmd: head.toLowerCase().replace(/@.*$/, ""), arg: rest.join(" ").trim() };
}

// ───────────── Topics ─────────────
async function createTopic(user: any): Promise<number | null> {
  const name = `${fullName(user)}${user.username ? ` · @${user.username}` : ""}`.slice(0, 120);
  const r = await tg("createForumTopic", { chat_id: GROUP_ID, name, icon_color: 0x6FB9F0 });
  if (!r.ok) return null;
  const topic = Number(r.result.message_thread_id);

  const [{ rpc_set_topic: won }] = await db()`select support.rpc_set_topic(${user.id}, ${topic})`;
  if (won !== topic) {
    // Another message from the same student created a topic at the same moment; keep theirs.
    await tg("deleteForumTopic", { chat_id: GROUP_ID, message_thread_id: topic });
    return won;
  }
  await postCard(topic, user.id);
  return topic;
}

async function postCard(topic: number, userId: number) {
  const rows = await db()`select * from support.rpc_user_by_topic(${topic})`;
  const u = rows[0];
  if (!u) return;
  const text = [
    `👤 <b><a href="tg://user?id=${userId}">${esc(u.first_name || "Talaba")}</a></b>`,
    u.username ? `🔗 @${esc(u.username)}` : "🔗 username yo'q",
    `🆔 <code>${userId}</code>`,
    `🌐 Til: ${esc(u.lang || "—")}`,
    `📅 Birinchi xabar: ${tashkent(u.created_at)}`,
    u.banned ? "⛔ <b>Bloklangan</b>" : "",
    "",
    "Shu mavzuda yozgan xabaringiz talabaga boradi. <code>//</code> bilan boshlansa — ichki izoh.",
  ].filter((l) => l !== "").join("\n");
  const r = await sendTopic(topic, text);
  if (r.ok) await tg("pinChatMessage", { chat_id: GROUP_ID, message_id: r.result.message_id, disable_notification: true });
}

// ───────────── Student → group ─────────────
async function fromStudent(msg: any) {
  const user = msg.from;
  const text = String(msg.text ?? "");

  if (text.startsWith("/start")) {
    await send(msg.chat.id, T.welcome(fullName(user)));
    // still register the student so staff see they opened the bot
  }

  const [st] = await db()`select * from support.rpc_touch(${user.id}, ${fullName(user)}, ${user.username ?? null}, ${user.language_code ?? null})`;
  if (st.banned) return;
  if (st.flood) return send(msg.chat.id, T.flood);
  if (!GROUP_ID) return send(msg.chat.id, T.received); // staff group not connected yet (/setup)
  if (text.startsWith("/start")) {
    // Show the /start in the topic as a short note instead of copying the command.
    let topic: number | null = st.topic_id ?? (await createTopic(user));
    if (topic) {
      const r = await sendTopic(topic, "▶️ Talaba botni ishga tushirdi (/start)");
      if (!r.ok && topicGone(r)) {
        await db()`select support.rpc_reset_topic(${user.id}, ${topic})`;
        topic = await createTopic(user);
      }
    }
    return;
  }
  if (!isCopyable(msg)) return send(msg.chat.id, T.unsupported);

  let topic: number | null = st.topic_id ?? (await createTopic(user));
  if (!topic) return send(msg.chat.id, T.error);
  if (st.new_conv && st.topic_id) await tg("reopenForumTopic", { chat_id: GROUP_ID, message_thread_id: topic });

  // Keep the student's reply as a reply on the staff side.
  let replyTo: number | null = null;
  if (msg.reply_to_message) {
    const [{ rpc_map_to_group: g }] = await db()`select support.rpc_map_to_group(${user.id}, ${msg.reply_to_message.message_id})`;
    replyTo = g ?? null;
  }

  const copy = (t: number) => tg("copyMessage", {
    chat_id: GROUP_ID, message_thread_id: t, from_chat_id: msg.chat.id, message_id: msg.message_id,
    ...(replyTo ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } } : {}),
  });

  let r = await copy(topic);
  if (!r.ok && topicClosed(r)) {
    await tg("reopenForumTopic", { chat_id: GROUP_ID, message_thread_id: topic });
    r = await copy(topic);
  }
  if (!r.ok && topicGone(r)) {
    await db()`select support.rpc_reset_topic(${user.id}, ${topic})`;
    topic = await createTopic(user);
    if (topic) r = await copy(topic);
  }
  if (!r.ok) return send(msg.chat.id, T.error);

  await db()`select support.rpc_map_add(${user.id}, ${msg.message_id}, ${r.result.message_id})`;
  if (st.new_conv) await send(msg.chat.id, T.received);
}

async function editFromStudent(msg: any) {
  const [{ rpc_map_to_group: g }] = await db()`select support.rpc_map_to_group(${msg.from.id}, ${msg.message_id})`;
  if (!g) return;
  await syncEdit(GROUP_ID, g, msg);
}

// Text → editMessageText, media caption → editMessageCaption. Replacing the media itself is not synced.
function syncEdit(chat: number, msgId: number, src: any) {
  if (src.text !== undefined) {
    return tg("editMessageText", { chat_id: chat, message_id: msgId, text: src.text, entities: src.entities ?? [] });
  }
  if (src.caption !== undefined) {
    return tg("editMessageCaption", { chat_id: chat, message_id: msgId, caption: src.caption, caption_entities: src.caption_entities ?? [] });
  }
}

// ───────────── Group → student ─────────────
async function fromGroup(msg: any) {
  const text = String(msg.text ?? "");
  const topic: number | undefined = msg.is_topic_message ? msg.message_thread_id : undefined;
  const { cmd } = parseCmd(text);

  if (!topic) {
    // General topic: only commands.
    if (cmd === "/stats") {
      const [{ s }] = await db()`select support.rpc_stats() as s`;
      return send(GROUP_ID, [
        "📊 <b>Statistika</b>",
        "",
        `👥 Jami talabalar: <b>${s.jami}</b>`,
        `💬 Oxirgi 24 soatda yozgan: ${s.bugun}`,
        `📅 Oxirgi 7 kunda yozgan: ${s.hafta}`,
        `🆕 Yangi (7 kun): ${s.yangi_hafta}`,
        `⛔ Bloklangan: ${s.bloklangan}`,
      ].join("\n"));
    }
    if (cmd === "/help" || cmd === "/start") return send(GROUP_ID, GROUP_HELP);
    return;
  }

  if (msg.forum_topic_created || msg.forum_topic_closed || msg.forum_topic_reopened || msg.forum_topic_edited) return;
  // (anonymous admins arrive as the GroupAnonymousBot user; they are staff too, so is_bot is not filtered)

  const rows = await db()`select * from support.rpc_user_by_topic(${topic})`;
  const u = rows[0];
  if (!u) return; // a topic the bot did not create

  switch (cmd) {
    case "/info": return postCard(topic, Number(u.user_id));
    case "/ban":
      await db()`select support.rpc_set_ban(${topic}, true)`;
      return sendTopic(topic, "⛔ Talaba bloklandi. Uning xabarlari endi kelmaydi. /unban — qaytarish.");
    case "/unban":
      await db()`select support.rpc_set_ban(${topic}, false)`;
      return sendTopic(topic, "✅ Talaba blokdan chiqarildi.");
    case "/close":
      await sendTopic(topic, "🔒 Mavzu yopildi. Talaba yana yozsa, o'zi ochiladi.");
      return tg("closeForumTopic", { chat_id: GROUP_ID, message_thread_id: topic });
    case "/help": return sendTopic(topic, GROUP_HELP);
  }
  if (text.startsWith("/")) return; // unknown command: never forward to the student
  if (text.startsWith("//") || String(msg.caption ?? "").startsWith("//")) return react(GROUP_ID, msg.message_id, "✍");
  if (!isCopyable(msg)) return;

  const userId = Number(u.user_id);
  // A reply to a specific message (not the topic itself) stays a reply on the student's side.
  let replyTo: number | null = null;
  const rt = msg.reply_to_message;
  if (rt && rt.message_id !== topic) {
    const m = await db()`select * from support.rpc_map_to_user(${rt.message_id})`;
    if (m[0] && Number(m[0].user_id) === userId) replyTo = m[0].user_msg_id;
  }

  const r = await tg("copyMessage", {
    chat_id: userId, from_chat_id: GROUP_ID, message_id: msg.message_id,
    ...(replyTo ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } } : {}),
  });
  if (!r.ok) {
    const why = blockedByUser(r) ? "talaba botni bloklagan yoki o'chirgan" : esc(r.description ?? "noma'lum xato");
    return sendTopic(topic, `❌ Yetkazilmadi: ${why}`, { reply_parameters: { message_id: msg.message_id } });
  }
  await db()`select support.rpc_map_add(${userId}, ${r.result.message_id}, ${msg.message_id})`;
  await react(GROUP_ID, msg.message_id, "👍");
}

async function editFromGroup(msg: any) {
  const m = await db()`select * from support.rpc_map_to_user(${msg.message_id})`;
  if (!m[0]) return;
  await syncEdit(Number(m[0].user_id), m[0].user_msg_id, msg);
}

// /setup in a forum group by an owner/admin: makes it the staff group.
async function setupGroup(msg: any) {
  const reply = (t: string) => send(msg.chat.id, t, msg.is_topic_message ? { message_thread_id: msg.message_thread_id } : {});
  if (!adminIds().includes(String(msg.from.id))) return reply("⛔ Faqat bot egasi /setup qila oladi.");
  if (!msg.chat.is_forum) return reply("❗ Avval guruh sozlamalarida <b>Topics (Mavzular)</b> ni yoqing, keyin /setup yozing.");
  const me = await tg("getMe", {});
  const cm = await tg("getChatMember", { chat_id: msg.chat.id, user_id: me.result?.id });
  if (cm.result?.status !== "administrator" || !cm.result?.can_manage_topics) {
    return reply("❗ Botni guruhda <b>admin</b> qiling va <b>Manage topics</b> (Mavzularni boshqarish) ruxsatini bering, keyin /setup yozing.");
  }
  await db()`select support.rpc_set_group(${msg.chat.id})`;
  GROUP_ID = msg.chat.id;
  groupLoaded = true;
  await reply("✅ Guruh ulandi! Endi talabalar botga yozsa, har biri shu yerda alohida mavzu bo'lib chiqadi.");
  return send(GROUP_ID, GROUP_HELP);
}

// One-time webhook registration: the nonce is put in support.settings by the owner (SQL), used once here.
async function setupWebhook(req: Request): Promise<Response> {
  const nonce = new URL(req.url).searchParams.get("setup") || "";
  if (nonce.length < 32) return new Response("bad request", { status: 400 });
  const [{ ok: valid }] = await db()`select support.rpc_take_nonce(${nonce}) as ok`;
  if (!valid) return new Response("Unauthorized", { status: 401 });
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/support-bot`;
  const r = await tg("setWebhook", {
    url, secret_token: await webhookSecret(), allowed_updates: ["message", "edited_message"], drop_pending_updates: false,
  });
  // Command menus: students see only /start (this replaces the old admin bot's /student, /risk, /today menu);
  // groups see the staff commands.
  const menuPrivate = await tg("setMyCommands", { commands: [{ command: "start", description: "Boshlash" }] });
  const menuGroup = await tg("setMyCommands", {
    scope: { type: "all_group_chats" },
    commands: [
      { command: "help", description: "Qo'llanma" },
      { command: "stats", description: "Statistika (General)" },
      { command: "info", description: "Talaba haqida (mavzuda)" },
      { command: "close", description: "Mavzuni yopish" },
      { command: "ban", description: "Talabani bloklash" },
      { command: "unban", description: "Blokdan chiqarish" },
    ],
  });
  for (const id of adminIds()) await tg("deleteMyCommands", { scope: { type: "chat", chat_id: Number(id) } });
  const me = await tg("getMe", {});
  return Response.json({
    webhook: r.ok, description: r.description ?? null, menu: menuPrivate.ok && menuGroup.ok, bot: me.result?.username ?? null,
  });
}

// ───────────── Entry ─────────────
Deno.serve(async (req: Request) => {
  if (req.method === "GET" && new URL(req.url).searchParams.has("setup")) {
    try { return await setupWebhook(req); } catch { return new Response("error", { status: 500 }); }
  }
  if (req.method !== "POST") return new Response("POST expected", { status: 405 });
  const secret = await webhookSecret();
  const given = req.headers.get("x-telegram-bot-api-secret-token") || "";
  if (!secret || !given || !safeEqual(secret, given)) return new Response("Unauthorized", { status: 401 });

  let update: any;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY) return new Response("too large", { status: 413 });
    update = JSON.parse(raw);
  } catch { return ok(); }

  const msg = update.message ?? update.edited_message;
  if (!msg?.chat || !msg.from) return ok();
  const edited = !!update.edited_message;
  const chatType = msg.chat.type;

  try {
    await loadGroup();
    const cmd = edited ? "" : parseCmd(String(msg.text ?? "")).cmd;
    if (chatType !== "private" && cmd === "/setup") { await setupGroup(msg); return ok(); }
    if (chatType !== "private" && cmd === "/id") {
      await send(msg.chat.id, `Chat ID: <code>${msg.chat.id}</code>`, msg.is_topic_message ? { message_thread_id: msg.message_thread_id } : {});
      return ok();
    }
    if (chatType === "private") {
      if (edited) await editFromStudent(msg); else await fromStudent(msg);
    } else if (GROUP_ID && msg.chat.id === GROUP_ID) {
      if (edited) await editFromGroup(msg); else await fromGroup(msg);
    }
    // any other group or channel: ignored
  } catch (e) {
    console.error(`support-bot: error ${String((e as { code?: string })?.code ?? (e as Error)?.name ?? "unknown")}`);
    if (chatType === "private" && !edited) await send(msg.chat.id, T.error);
  }
  return ok();
});
