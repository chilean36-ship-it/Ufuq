// Shared helpers for the admin-only Telegram bot (tg-webhook, cron-monitor). All bot text is English.
// The DB connection uses the `bot_reader` role (BOT_DB_URL secret), which can only EXECUTE bot.rpc_* functions.
// Admins = OWNER_CHAT_ID plus the comma-separated ADMIN_CHAT_IDS (numeric Telegram user IDs).
// Nothing here logs message text, student data, tokens or URLs that contain the token.
import postgres from "npm:postgres@3.4.5";

let sql: ReturnType<typeof postgres> | null = null;
export function db() {
  if (!sql) {
    const url = Deno.env.get("BOT_DB_URL");
    if (!url) throw new Error("BOT_DB_URL missing");
    sql = postgres(url, { prepare: false, max: 1, idle_timeout: 20, connect_timeout: 10 });
  }
  return sql;
}

export function adminIds(): string[] {
  const raw = `${Deno.env.get("OWNER_CHAT_ID") ?? ""},${Deno.env.get("ADMIN_CHAT_IDS") ?? ""}`;
  return [...new Set(raw.split(",").map((s) => s.trim()).filter((s) => /^\d+$/.test(s)))];
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// Postgres error code only — the message can contain query values.
export const errCode = (e: unknown) => String((e as { code?: string })?.code ?? "unknown");
export const isRateLimited = (e: unknown) => errCode(e) === "UB429";

export async function tg(method: string, body: Record<string, unknown>): Promise<boolean> {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) { console.error("tg: TELEGRAM_BOT_TOKEN missing"); return false; }
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) console.error(`tg ${method}: HTTP ${r.status}`);
    return r.ok;
  } catch {
    console.error(`tg ${method}: network error`);
    return false;
  }
}

// Read-only Bot API call that returns `result` (or null).
export async function tgGet(method: string): Promise<any> {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) return null;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`);
    return r.ok ? (await r.json()).result : null;
  } catch {
    return null;
  }
}

export const send = (chatId: string | number, text: string, extra: Record<string, unknown> = {}) =>
  tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra });

// Daily report, new risks and stranger notices go to every admin.
export async function sendAdmins(text: string) {
  for (const id of adminIds()) await send(id, text);
}

export const COMMANDS = [
  { command: "student", description: "Find a student: /student <name or ID>" },
  { command: "risk", description: "Students at risk" },
  { command: "today", description: "Daily report" },
  { command: "help", description: "Help" },
];

export const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// "2026-11-03 08:00" in Tashkent time.
export function tashkent(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("sv-SE", { timeZone: "Asia/Tashkent" }).slice(0, 16);
}

export const RULE: Record<string, string> = {
  daraja_tushdi: "📉 Level drop / failed",
  kirmagan: "💤 Inactive",
  imtihon_otdi: "⏰ Missed exam",
};

// Groups lines under their rule, caps the total so one message stays well under Telegram's 4096 chars.
export function riskText(title: string, rows: { sabab: string; line: string }[], max = 30): string {
  if (!rows.length) return `${title}\n\nNo students at risk ✅`;
  const out = [title];
  let shown = 0;
  for (const key of Object.keys(RULE)) {
    const part = rows.filter((r) => r.sabab === key);
    if (!part.length || shown >= max) continue;
    out.push("", `<b>${RULE[key]}</b> (${part.length})`);
    for (const r of part) {
      if (shown >= max) break;
      out.push(`• ${r.line}`);
      shown++;
    }
  }
  if (rows.length > shown) out.push("", `… and ${rows.length - shown} more (/risk)`);
  return out.join("\n");
}

type Report = Record<string, number | string>;
export function reportText(r: Report): string {
  return [
    `📊 <b>Daily report</b> — ${esc(r.sana)}`,
    "",
    `👥 Active students: <b>${r.faol}</b> · unpaid ${r.tolanmagan} · blocked ${r.bloklangan}`,
    "",
    `<b>Last 24 hours</b>`,
    `• New sign-ups: ${r.yangi_24s}`,
    `• Students who logged in: ${r.kirgan_24s}`,
    `• Exams submitted: ${r.topshirilgan_24s}`,
    `• Level exams passed / failed: ${r.otdi_24s} / ${r.otmadi_24s}`,
    "",
    `⏳ Exam deadlines in the next 48 h: <b>${r.muddat_48s}</b>`,
    "",
    `⚠️ <b>At risk: ${r.xavfdagi}</b>`,
    `• Level drop / failed: ${r.xavf_daraja ?? 0}`,
    `• Inactive 7+ days: ${r.xavf_kirmagan ?? r.kirmagan_7k}`,
    `• Missed exam: ${r.xavf_imtihon ?? 0}`,
    "",
    `Details: /risk`,
  ].join("\n");
}
