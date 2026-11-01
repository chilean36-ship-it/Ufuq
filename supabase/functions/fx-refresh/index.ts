// ============================================================
// Ufuq — fx-refresh: an admin presses "Update rates" and every currency already in fx_rates is refreshed from a free daily
// rate feed (open.er-api.com). Rates are for DISPLAY and for converting the USD price to the charge currency; the amount
// the student pays is fixed in the order when it is created. Admin-only.
// ============================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

import { withCors } from "../_shared/cors.ts";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(withCors(async (req: Request) => {
  const URL_ = Deno.env.get("SUPABASE_URL")!;
  const asUser = createClient(URL_, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
  const { data: u } = await asUser.auth.getUser();
  if (!u?.user) return json({ error: "Unauthorized" }, 401);
  const db = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: p } = await db.from("profiles").select("role, admin_tier").eq("id", u.user.id).maybeSingle();
  if (!p || p.role !== "admin" || (p.admin_tier || "super") !== "super") return json({ error: "Only the main admin" }, 403);

  const res = await fetch("https://open.er-api.com/v6/latest/USD");
  const feed = await res.json().catch(() => null);
  if (!res.ok || !feed?.rates) return json({ error: "RATE_FEED_UNAVAILABLE" }, 502);

  const { data: cur } = await db.from("fx_rates").select("currency");
  let n = 0;
  for (const { currency } of cur || []) {
    const rate = Number(feed.rates[currency]);
    if (currency === "USD" || !(rate > 0)) continue;
    const { error } = await db.from("fx_rates").update({ per_usd: rate, source: "open.er-api.com", updated_at: new Date().toISOString() }).eq("currency", currency);
    if (!error) n++;
  }
  return json({ ok: true, updated: n });
}));
