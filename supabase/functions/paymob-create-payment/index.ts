// Ufuq — paymob-create-payment, v2 (hardened): turns a pending card order into a Paymob payment intention and returns the
// hosted-checkout URL. The browser sends only { order_id }; the price comes from the order row the server itself computed.
// Card data never reaches Ufuq. v2: card method must be enabled, orders expire after 24 h, at most 5 attempts per order.
// v3: CORS limited to the site's own origins (_shared/cors.ts) instead of "*".
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { withCors } from "../_shared/cors.ts";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
const ORDER_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;

Deno.serve(withCors(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST expected" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SECRET = Deno.env.get("PAYMOB_SECRET_KEY");
  const PUBLIC = Deno.env.get("PAYMOB_PUBLIC_KEY");
  const INTEGRATION = Deno.env.get("PAYMOB_INTEGRATION_ID");
  const SITE = (Deno.env.get("SITE_URL") || "").replace(/\/+$/, "");
  if (!SECRET || !PUBLIC || !INTEGRATION || !SITE) return json({ error: "PAYMENTS_NOT_CONFIGURED" }, 503);
  const API_HOST = Deno.env.get("PAYMOB_API_HOST") || "accept.paymob.com";
  const CHECKOUT_HOST = Deno.env.get("PAYMOB_CHECKOUT_HOST") || "eg.checkout.paymob.com";

  let orderId = "", phone = "";
  try { const b = await req.json(); orderId = String(b?.order_id || ""); phone = String(b?.phone || "").replace(/[^\d+]/g, "").slice(0, 20); } catch { return json({ error: "Invalid JSON body" }, 400); }
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return json({ error: "order_id required" }, 400);

  const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
  const { data: u } = await asUser.auth.getUser();
  const caller = u?.user;
  if (!caller) return json({ error: "Unauthorized" }, 401);

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: settings } = await db.from("payment_settings").select("paymob_enabled").eq("id", 1).maybeSingle();
  if (!settings?.paymob_enabled) return json({ error: "METHOD_UNAVAILABLE" }, 503);

  const { data: order } = await db.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (!order || order.user_id !== caller.id) return json({ error: "ORDER_NOT_FOUND" }, 404);
  if (order.method !== "paymob" || order.status !== "pending") return json({ error: "ORDER_NOT_PAYABLE" }, 409);
  if (Date.now() - Date.parse(order.created_at) > ORDER_TTL_MS) return json({ error: "ORDER_EXPIRED" }, 409);   // the exchange rate is only honoured for 24 h

  const { count: attempts } = await db.from("payment_events").select("id", { count: "exact", head: true }).eq("order_id", order.id).eq("kind", "intent_created");
  if ((attempts ?? 0) >= MAX_ATTEMPTS) return json({ error: "TOO_MANY_ATTEMPTS" }, 429);

  const { data: plan } = await db.from("plans").select("title").eq("id", order.plan_id).maybeSingle();
  const parts = String(order.buyer_name).trim().split(/\s+/);
  const first = parts[0] || "NA";
  const last = parts.slice(1).join(" ") || "NA";

  const body = {
    amount: Number(order.charge_cents),
    currency: order.charge_currency,
    payment_methods: [Number(INTEGRATION)],
    items: [{ name: `Ufuq — ${plan?.title || order.plan_id} (${order.months} mo)`.slice(0, 50), amount: Number(order.charge_cents), description: `Access for ${order.months} month(s)`, quantity: 1 }],
    billing_data: {
      first_name: first, last_name: last, email: order.buyer_email,
      phone_number: phone || Deno.env.get("PAYMOB_DEFAULT_PHONE") || "NA",
      country: order.buyer_country || "NA", city: "NA", street: "NA", building: "NA", floor: "NA", apartment: "NA", state: "NA",
    },
    customer: { first_name: first, last_name: last, email: order.buyer_email, extras: { user_id: caller.id } },
    special_reference: order.id,
    extras: { order_id: order.id },
    notification_url: `${SUPABASE_URL}/functions/v1/paymob-webhook`,
    redirection_url: `${SITE}/checkout/result?order=${order.id}`,
  };

  let res: Response;
  try {
    res = await fetch(`https://${API_HOST}/v1/intention/`, {
      method: "POST",
      headers: { Authorization: `Token ${SECRET}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    console.error("paymob unreachable", e);
    return json({ error: "PROVIDER_UNREACHABLE" }, 502);
  }
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out?.client_secret) {
    console.error("paymob intention failed", res.status, JSON.stringify(out).slice(0, 500));
    return json({ error: "PROVIDER_ERROR", status: res.status }, 502);
  }
  await db.rpc("set_order_provider", { p_order: order.id, p_ref: String(out.id || out.intention_order_id || "") });
  await db.rpc("log_payment_event", { p_order: order.id, p_txn: null, p_kind: "intent_created", p_detail: { provider_ref: String(out.id || out.intention_order_id || "") }, p_alert: false });
  const url = `https://${CHECKOUT_HOST}/?publicKey=${encodeURIComponent(PUBLIC)}&clientSecret=${encodeURIComponent(out.client_secret)}`;
  return json({ ok: true, url });
}));
