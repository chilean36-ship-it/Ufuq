// ============================================================
// Ufuq — shared AI caller for every edge function (grade-exam, ai-chat, ...).
//
// Order: Claude Haiku 5.5 first (cheap, fast), Gemini 3.1 Flash-Lite as the backup. Each provider has its own
// quota, so when one is busy or down the other answers and the exam day keeps going.
//
// Secrets:  ANTHROPIC_API_KEY (primary), GEMINI_API_KEY (backup)
// Optional: CLAUDE_MODEL (default claude-haiku-5-5), GEMINI_MODEL (default gemini-3.1-flash-lite),
//           LLM_ORDER (default "claude,gemini"; use "gemini,claude" to flip)
//
// Behaviour:
//  - A provider that returns 401/403/404 (bad key, model removed) is remembered as dead for 30 minutes, per instance.
//  - 429 / 5xx / overloaded / timeouts move on to the next provider at once.
//  - Only when every provider refused do we wait (back-off + jitter, honouring Retry-After) and try again until the deadline.
//  - At most GEMINI/CLAUDE concurrency per instance is in flight (a burst queues instead of hitting rate limits).
// ============================================================

export type Msg = { role: "user" | "assistant"; content: string };
export type LLMRequest = {
  system: string;
  messages: Msg[];
  maxTokens: number;
  temperature?: number;      // Gemini only: Claude Haiku 5.5 does not accept sampling parameters
  effort?: "low" | "medium" | "high";  // Claude only: output_config.effort (low = cheapest)
  thinkingBudget?: number;   // Gemini only
  json?: boolean;            // Gemini: forces JSON output; Claude: the prompt must ask for JSON
  deadline: number;          // epoch ms: give up after this
  timeoutMs?: number;        // per-request cap (default 45 s); long jobs such as grading a whole paper use more
};
export type LLMResult = { ok: true; text: string; provider: string } | { ok: false; status: number; err: string };

type Attempt =
  | { ok: true; text: string }
  | { ok: false; retry: boolean; dead?: boolean; noThink?: boolean; waitMs?: number; status: number; err: string };

const CLAUDE_MODEL = () => Deno.env.get("CLAUDE_MODEL") || "claude-haiku-5-5";
const GEMINI_MODEL = () => Deno.env.get("GEMINI_MODEL") || Deno.env.get("GEMINI_CHAT_MODEL") || "gemini-3.1-flash-lite";
const ORDER = () => (Deno.env.get("LLM_ORDER") || "claude,gemini").split(",").map((s) => s.trim()).filter(Boolean);
const DEAD_FOR_MS = 30 * 60 * 1000;

// A key pasted into the Supabase secrets box often carries a line break or space: fetch() then throws "Invalid header value"
// and the provider silently never works. Every key is stripped of ALL whitespace before use.
const cleanKey = (name: string) => (Deno.env.get(name) || "").replace(/\s+/g, "");
/** Error text that is safe to log: never prints an API key or the header value that contained it. */
function safeErr(e: unknown): string {
  const msg = String(e);
  if (/header/i.test(msg)) return "invalid header value (the API key secret contains illegal characters - re-set it on ONE line)";
  return msg.replace(/sk-ant-[A-Za-z0-9_\-]+/g, "sk-ant-***").replace(/AIza[A-Za-z0-9_\-]+/g, "AIza***");
}

export const llmConfigured = () => !!(cleanKey("ANTHROPIC_API_KEY") || cleanKey("GEMINI_API_KEY"));

const deadUntil = new Map<string, number>();   // "claude" | "gemini" -> epoch ms
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Concurrency gate: at most `max` requests in flight per function instance. */
class Gate {
  private active = 0;
  private queue: Array<() => void> = [];
  private max: number;
  constructor(max: number) { this.max = max; }
  async run<T>(fn: () => Promise<T>, deadline: number): Promise<T> {
    if (this.active >= this.max) {
      await new Promise<void>((resolve, reject) => {
        const go = () => { clearTimeout(t); resolve(); };
        const t = setTimeout(() => { this.queue = this.queue.filter((q) => q !== go); reject(new Error("queue timeout")); }, Math.max(0, deadline - Date.now()));
        this.queue.push(go);
      });
    }
    this.active++;
    try { return await fn(); }
    finally { this.active--; const next = this.queue.shift(); if (next) next(); }
  }
}
const gate = new Gate(6);

/** Claude needs the conversation to open with a user turn; drop any leading assistant turns. */
function firstUser(msgs: Msg[]): Msg[] {
  const i = msgs.findIndex((m) => m.role === "user");
  return i <= 0 ? msgs : msgs.slice(i);
}

async function askClaude(req: LLMRequest): Promise<Attempt> {
  const key = cleanKey("ANTHROPIC_API_KEY");
  if (!key) return { ok: false, retry: false, dead: true, status: 401, err: "ANTHROPIC_API_KEY not set" };
  try {
    const timeout = Math.max(5_000, Math.min(req.timeoutMs ?? 45_000, req.deadline - Date.now()));
    const send = (withEffort: boolean) => gate.run(() => fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: CLAUDE_MODEL(),
        max_tokens: req.maxTokens,
        // cache_control: the long, unchanging instructions are billed at the cheap cached rate on repeat calls
        // (ignored by the API when the prompt is below the model's minimum cacheable size)
        system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
        messages: firstUser(req.messages),
        ...(withEffort && req.effort ? { output_config: { effort: req.effort } } : {}),
      }),
      signal: AbortSignal.timeout(timeout),
    }), req.deadline);
    let res = await send(true);
    // If the model rejects the optional "effort" setting, ask again without it instead of giving up on Claude.
    if (res.status === 400 && req.effort) {
      const peek = (await res.clone().text()).toLowerCase();
      if (peek.includes("effort") || peek.includes("output_config")) res = await send(false);
    }
    if (res.ok) {
      const data = await res.json();
      const text = (data?.content || []).filter((b: { type?: string }) => b.type === "text").map((b: { text?: string }) => b.text || "").join("");
      if (!text.trim()) return { ok: false, retry: true, status: 502, err: "empty answer" };
      if (data?.stop_reason === "max_tokens") console.error("llm: claude answer was cut at max_tokens - raise maxTokens for this call");
      return { ok: true, text };
    }
    const body = (await res.text()).slice(0, 300);
    const err = `claude HTTP ${res.status}: ${body}`;
    if (res.status === 401 || res.status === 403 || res.status === 404) return { ok: false, retry: false, dead: true, status: res.status, err };
    if (res.status === 400) return { ok: false, retry: false, status: 400, err };          // a bad request: this provider is skipped for this call only
    const ra = Number(res.headers.get("retry-after"));
    return { ok: false, retry: true, status: res.status, waitMs: Number.isFinite(ra) && ra > 0 ? Math.min(10_000, ra * 1000) : undefined, err };
  } catch (e) {
    return { ok: false, retry: true, status: 502, err: "claude " + safeErr(e) };
  }
}

async function askGemini(req: LLMRequest, withThinking: boolean): Promise<Attempt> {
  const key = cleanKey("GEMINI_API_KEY");
  if (!key) return { ok: false, retry: false, dead: true, status: 401, err: "GEMINI_API_KEY not set" };
  const model = GEMINI_MODEL();
  try {
    const timeout = Math.max(5_000, Math.min(req.timeoutMs ?? 45_000, req.deadline - Date.now()));
    const gc: Record<string, unknown> = {
      temperature: req.temperature ?? 0.2,
      maxOutputTokens: req.maxTokens,
      ...(req.json ? { responseMimeType: "application/json" } : {}),
      ...(withThinking && req.thinkingBudget !== undefined ? { thinkingConfig: { thinkingBudget: req.thinkingBudget } } : {}),
    };
    const res = await gate.run(() => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: req.system }] },
        contents: req.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
        generationConfig: gc,
      }),
      signal: AbortSignal.timeout(timeout),
    }), req.deadline);
    if (res.ok) {
      const data = await res.json();
      const text = (data?.candidates?.[0]?.content?.parts || []).filter((p: { thought?: boolean }) => !p.thought).map((p: { text?: string }) => p.text || "").join("");
      if (!text.trim()) return { ok: false, retry: true, status: 502, err: "gemini empty answer" };
      return { ok: true, text };
    }
    const body = (await res.text()).slice(0, 300);
    const err = `gemini ${model} HTTP ${res.status}: ${body}`;
    if (res.status === 400 && withThinking) return { ok: false, retry: true, noThink: true, status: 400, err };
    if (res.status === 404 || res.status === 401 || res.status === 403) return { ok: false, retry: false, dead: true, status: res.status, err };
    if (res.status === 400) return { ok: false, retry: false, status: 400, err };
    const ra = Number(res.headers.get("retry-after"));
    return { ok: false, retry: true, status: res.status, waitMs: Number.isFinite(ra) && ra > 0 ? Math.min(10_000, ra * 1000) : undefined, err };
  } catch (e) {
    return { ok: false, retry: true, status: 502, err: "gemini " + safeErr(e) };
  }
}

/** One provider, one attempt (Gemini may retry once without thinking when the model refuses that setting). */
async function tryProvider(name: string, req: LLMRequest): Promise<Attempt> {
  if (name === "claude") return askClaude(req);
  if (name === "gemini") {
    let r = await askGemini(req, req.thinkingBudget !== undefined);
    if (!r.ok && r.noThink) r = await askGemini(req, false);
    return r;
  }
  return { ok: false, retry: false, status: 500, err: "unknown provider " + name };
}

/**
 * Asks the providers in order (Claude → Gemini by default). Returns the answer text and which provider gave it.
 * Never throws: { ok:false, status, err } when nothing answered before the deadline.
 */
export async function callLLM(req: LLMRequest): Promise<LLMResult> {
  const order = ORDER();
  let lastStatus = 502, lastErr = "";
  for (let round = 0; ; round++) {
    let hint = 0, anyAlive = false;
    for (const name of order) {
      if ((deadUntil.get(name) ?? 0) > Date.now()) continue;
      if (Date.now() > req.deadline - 2_000) return { ok: false, status: lastStatus, err: lastErr || "deadline reached" };
      anyAlive = true;
      const r = await tryProvider(name, req);
      if (r.ok) return { ok: true, text: r.text, provider: name };
      lastStatus = r.status; lastErr = r.err;
      console.error(`llm: ${name} (round ${round + 1}) —`, r.err);
      if (r.dead) deadUntil.set(name, Date.now() + DEAD_FOR_MS);
      if (r.waitMs) hint = Math.max(hint, r.waitMs);
    }
    if (!anyAlive) return { ok: false, status: 503, err: lastErr || "no AI provider available" };
    if (!order.some((n) => (deadUntil.get(n) ?? 0) <= Date.now())) return { ok: false, status: lastStatus, err: lastErr };
    const wait = Math.max(hint, Math.min(8_000, 1_500 * 2 ** round)) + Math.random() * 1_200;
    if (Date.now() + wait > req.deadline - 4_000) return { ok: false, status: lastStatus, err: lastErr || "deadline reached" };
    await sleep(wait);
  }
}

/** Pulls a JSON object out of a model answer (tolerates ```json fences and stray text). */
export function parseJsonAnswer(raw: string): unknown {
  let text = (raw || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s !== -1 && e !== -1) text = text.slice(s, e + 1);
  return JSON.parse(text);
}
