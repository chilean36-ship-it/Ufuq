// Ufuq — resource-usage: Admin → Administration → Resources (main admin only).
// Reports how full Supabase (database + file storage), Cloudflare R2  are.
// Everything optional: a part whose secret is missing answers { configured:false } and the page shows how to switch it on.
//   Supabase  : nothing to set (limits default to the Free plan; override with SUPABASE_DB_LIMIT_MB / SUPABASE_STORAGE_LIMIT_MB)
//   Cloudflare: CF_API_TOKEN (R2 read) + the existing R2_ACCOUNT_ID, R2_BUCKET_NAME; limit R2_LIMIT_GB (default 10)
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
  const token = key("CF_API_TOKEN"), acc = key("R2_ACCOUNT_ID");
  if (!token || !acc) return { configured: false, need: ["CF_API_TOKEN", "R2_ACCOUNT_ID"].filter((k) => !key(k)) };
  const base = `https://api.cloudflare.com/client/v4/accounts/${acc}/r2/buckets`;
  const get = async (url: string) => {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12_000) });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.success) throw new Error(j?.errors?.[0]?.message || `HTTP ${r.status}`);
    return j.result || {};
  };
  try {
    // every bucket of the account, not just one
    const list = await get(base);
    const names: string[] = (list.buckets || []).map((b: { name: string }) => b.name);
    const buckets = await Promise.all(names.map(async (name) => {
      const u = await get(`${base}/${encodeURIComponent(name)}/usage`);
      return { name, bytes: Number(u.payloadSize || 0) + Number(u.metadataSize || 0), objects: Number(u.objectCount || 0) };
    }));
    buckets.sort((a, b) => b.bytes - a.bytes);
    return {
      configured: true,
      r2: { used: buckets.reduce((s, b) => s + b.bytes, 0), limit: num("R2_LIMIT_GB", 10) * GB,
            objects: buckets.reduce((s, b) => s + b.objects, 0), buckets },
    };
  } catch (e) { return { configured: true, error: String((e as Error).message || e) }; }
}

Deno.serve(withCors(async (req: Request) => {
  const URL_ = Deno.env.get("SUPABASE_URL")!;
  const asUser = createClient(URL_, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
  const { data: u } = await asUser.auth.getUser();
  if (!u?.user) return json({ error: "Unauthorized" }, 401);
  const db = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: p } = await db.from("profiles").select("role, admin_tier").eq("id", u.user.id).maybeSingle();
  if (!p || p.role !== "admin" || (p.admin_tier || "super") !== "super") return json({ error: "Only the main admin" }, 403);

  const [supabase, cloudflare] = await Promise.all([supabaseUsage(db), cloudflareUsage()]);
  return json({ ok: true, at: new Date().toISOString(), supabase, cloudflare });
}));
