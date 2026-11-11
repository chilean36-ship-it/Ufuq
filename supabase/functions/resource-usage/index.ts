// Ufuq — resource-usage: Admin → Administration → Resources (main admin only).
// Reports how full Supabase (database + file storage), Cloudflare R2 and the Claude API budget are.
// Everything optional: a part whose secret is missing answers { configured:false } and the page shows how to switch it on.
//   Supabase  : nothing to set (limits default to the Free plan; override with SUPABASE_DB_LIMIT_MB / SUPABASE_STORAGE_LIMIT_MB)
//   Cloudflare: CF_API_TOKEN (R2 read) + the existing R2_ACCOUNT_ID, R2_BUCKET_NAME; limit R2_LIMIT_GB (default 10)
//   Claude    : ANTHROPIC_ADMIN_KEY (organization Admin API key) for this month's spend + CLAUDE_MONTHLY_BUDGET_USD;
//               ANTHROPIC_API_KEY is used for the live rate-limit headroom.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { withCors } from "../_shared/cors.ts";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
const num = (k: string, d: number) => { const v = Number(Deno.env.get(k)); return Number.isFinite(v) && v > 0 ? v : d; };
const key = (k: string) => (Deno.env.get(k) || "").trim();
const MB = 1024 * 1024, GB = 1024 * MB;

async function supabaseUsage(db: ReturnType<typeof createClient>) {
  const { data, error } = await db.rpc("admin_resource_usage");
  if (error || !data) return { configured: true, error: error?.message || "no data" };
  return {
    configured: true,
    db: { used: Number(data.db_bytes), limit: num("SUPABASE_DB_LIMIT_MB", 500) * MB },
    storage: { used: Number(data.storage_bytes), limit: num("SUPABASE_STORAGE_LIMIT_MB", 1024) * MB, buckets: data.buckets || [] },
  };
}

async function cloudflareUsage() {
  const token = key("CF_API_TOKEN"), acc = key("R2_ACCOUNT_ID"), bucket = key("R2_BUCKET_NAME");
  if (!token || !acc || !bucket) return { configured: false, need: ["CF_API_TOKEN", "R2_ACCOUNT_ID", "R2_BUCKET_NAME"].filter((k) => !key(k)) };
  try {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acc}/r2/buckets/${bucket}/usage`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12_000),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.success) return { configured: true, error: j?.errors?.[0]?.message || `HTTP ${r.status}` };
    const res = j.result || {};
    return {
      configured: true,
      r2: { used: Number(res.payloadSize || 0) + Number(res.metadataSize || 0), limit: num("R2_LIMIT_GB", 10) * GB, objects: Number(res.objectCount || 0) },
    };
  } catch (e) { return { configured: true, error: String((e as Error).message || e) }; }
}

async function claudeUsage() {
  const admin = key("ANTHROPIC_ADMIN_KEY"), api = key("ANTHROPIC_API_KEY");
  const out: Record<string, unknown> = { configured: !!(admin || api) };
  if (!admin && !api) return { configured: false, need: ["ANTHROPIC_ADMIN_KEY", "ANTHROPIC_API_KEY"] };

  if (admin) {
    const now = new Date();
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    try {
      const r = await fetch(`https://api.anthropic.com/v1/organizations/cost_report?starting_at=${encodeURIComponent(from)}&bucket_width=1d&limit=31`, {
        headers: { "x-api-key": admin, "anthropic-version": "2023-06-01" }, signal: AbortSignal.timeout(12_000),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) out.spendError = j?.error?.message || `HTTP ${r.status}`;
      else {
        let cents = 0;
        for (const b of j?.data || []) for (const x of b.results || []) cents += Number(x.amount) || 0;
        out.spent = cents / 100;
        out.budget = num("CLAUDE_MONTHLY_BUDGET_USD", 0) || null;
      }
    } catch (e) { out.spendError = String((e as Error).message || e); }
  } else out.spendNeed = "ANTHROPIC_ADMIN_KEY";

  if (api) {
    try {
      // count_tokens is free; its response still carries the live rate-limit headers of the key.
      const r = await fetch("https://api.anthropic.com/v1/messages/count_tokens", {
        method: "POST", signal: AbortSignal.timeout(12_000),
        headers: { "x-api-key": api, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: Deno.env.get("CLAUDE_MODEL") || "claude-haiku-5-5", messages: [{ role: "user", content: "ping" }] }),
      });
      const h = (n: string) => { const v = Number(r.headers.get(n)); return Number.isFinite(v) && r.headers.get(n) !== null ? v : null; };
      out.rate = {
        requests: { limit: h("anthropic-ratelimit-requests-limit"), remaining: h("anthropic-ratelimit-requests-remaining") },
        tokens: { limit: h("anthropic-ratelimit-tokens-limit"), remaining: h("anthropic-ratelimit-tokens-remaining") },
        keyOk: r.ok,
      };
    } catch { /* leave rate out */ }
  }
  return out;
}

Deno.serve(withCors(async (req: Request) => {
  const URL_ = Deno.env.get("SUPABASE_URL")!;
  const asUser = createClient(URL_, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
  const { data: u } = await asUser.auth.getUser();
  if (!u?.user) return json({ error: "Unauthorized" }, 401);
  const db = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: p } = await db.from("profiles").select("role, admin_tier").eq("id", u.user.id).maybeSingle();
  if (!p || p.role !== "admin" || (p.admin_tier || "super") !== "super") return json({ error: "Only the main admin" }, 403);

  const [supabase, cloudflare, claude] = await Promise.all([supabaseUsage(db), cloudflareUsage(), claudeUsage()]);
  return json({ ok: true, at: new Date().toISOString(), supabase, cloudflare, claude });
}));
