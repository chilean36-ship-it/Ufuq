// Ufuq — cron-monitor: the bot's daily 08:00 (Asia/Tashkent) report, called only by pg_cron (job ufuq-bot-daily).
// Proves the caller with the x-cron-secret header (BOT_CRON_SECRET; the same value sits in Vault as bot_cron_secret).
// Sends every admin the day's key numbers plus risks not alerted before (bot.rpc_yangi_xavflar records them in
// alert_sent, so nothing is repeated). Alert lines are student ID + short summary only: no names, phones or scores.
// Deployed WITHOUT JWT verification.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { COMMANDS, db, errCode, esc, reportText, riskText, safeEqual, sendAdmins, tg, tgGet } from "../_shared/bot.ts";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST expected" }, 405);
  const secret = Deno.env.get("BOT_CRON_SECRET") || "";
  const given = req.headers.get("x-cron-secret") || "";
  if (!secret || !given || !safeEqual(secret, given)) return json({ error: "Unauthorized" }, 401);

  // Maintenance, same secret: (re)register the Telegram webhook and the command menu without the token or webhook
  // secret ever leaving Supabase Secrets. Body {"action":"set_webhook"} or {"action":"webhook_info"}.
  const body = await req.json().catch(() => ({}));
  if (body?.action === "set_webhook") {
    const hook = await tg("setWebhook", {
      url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/tg-webhook`,
      secret_token: Deno.env.get("TG_WEBHOOK_SECRET"),
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: true,
    });
    const menu = await tg("setMyCommands", { commands: COMMANDS });
    return json({ ok: hook && menu });
  }
  if (body?.action === "webhook_info") {
    const info = await tgGet("getWebhookInfo");
    return json({ url: info?.url, pending: info?.pending_update_count, last_error: info?.last_error_message ?? null });
  }

  try {
    const [{ r }] = await db()`select bot.rpc_kunlik_hisobot() as r`;
    await sendAdmins(reportText(r));

    const rows = await db()`select * from bot.rpc_yangi_xavflar()`;
    if (rows.length) {
      await sendAdmins(riskText(
        `🆕 <b>New risks</b> (${rows.length})`,
        rows.map((x) => ({ sabab: x.sabab, line: `${esc(x.student_id ?? "—")} — ${esc(x.izoh)}` })),
      ));
    }
    console.log(`cron-monitor: ok, new alerts ${rows.length}`);
    return json({ ok: true, alerts: rows.length });
  } catch (e) {
    console.error(`cron-monitor: db error ${errCode(e)}`);
    await sendAdmins("❗ The daily report could not be built. Check the cron-monitor logs.");
    return json({ ok: false }, 500);
  }
});
