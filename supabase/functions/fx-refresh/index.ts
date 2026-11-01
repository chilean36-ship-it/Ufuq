// Ufuq — fx-refresh, v2 (hardened): main admin presses "Update rates"; every currency already in fx_rates is refreshed from a
// free daily feed (open.er-api.com). v2: a rate that jumps by more than 40% versus the stored one is NOT applied (a broken
// feed must never be able to set a 1-dollar price), and the response lists what was skipped.
// v3: CORS limited to the site's own origins (_shared/cors.ts) instead of "*".
// Deployed automatically by .github/workflows/deploy-functions.yml on every push to main.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { withCors } from "../_shared/cors.ts";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
const MAX_JUMP = 0.4;

Deno.serve(withCors(async (req: Request) => {
  const URL_ = Deno.env.get("SUPABASE_URL")!;
  const asUser = createClient(URL_, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
  const { data: u } = await asUser.auth.getUser();
  if (!u?.user) return json({ error: "Unauthorized" }, 401);
  const db = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: p } = await db.from("profiles").select("role, admin_tier").eq("id", u.user.id).maybeSingle();
  if (!p || p.role !== "admin" || (p.admin_tier || "super") !== "super") return json({ error: "Only the main admin" }, 403);

  let feed: any = null;
  let ok = false;
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(15_000) });
    ok = res.ok;
    feed = await res.json().catch(() => null);
  } catch { /* handled below */ }
  if (!ok || !feed?.rates) return json({ error: "RATE_FEED_UNAVAILABLE" }, 502);

  const { data: cur } = await db.from("fx_rates").select("currency, per_usd");
  let n = 0;
  const skipped: { currency: string; old: number; feed: number }[] = [];
  for (const { currency, per_usd } of cur || []) {
    const rate = Number(feed.rates[currency]);
    if (currency === "USD" || !(rate > 0) || !Number.isFinite(rate)) continue;
    const old = Number(per_usd);
    if (old > 0 && Math.abs(rate - old) / old > MAX_JUMP) { skipped.push({ currency, old, feed: rate }); continue; }
    const { error } = await db.from("fx_rates").update({ per_usd: rate, source: "open.er-api.com", updated_at: new Date().toISOString() }).eq("currency", currency);
    if (!error) n++;
  }
  return json({ ok: true, updated: n, skipped });
}));
