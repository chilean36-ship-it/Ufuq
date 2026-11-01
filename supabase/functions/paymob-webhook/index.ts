// Ufuq — paymob-webhook (Paymob "transaction processed callback"), v2 (hardened).
// Trusts nothing until the HMAC (SHA-512, PAYMOB_HMAC_SECRET) matches. Then calls finalize_order_paid(), which re-checks
// amount + currency against the order, is idempotent (Paymob retries), logs every outcome to payment_events and alerts the
// admins when money arrived that could not be matched (amount mismatch, duplicate payment, closed order, unknown order).
// Deployed WITHOUT JWT verification: it authenticates by HMAC only.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
const MAX_BODY = 64 * 1024;

// The 20 values Paymob concatenates, in this exact order (docs: "HMAC Transaction Callback").
function hmacString(o: any): string {
  const v = (x: unknown) => (x === undefined || x === null ? "" : String(x));
  return [
    o.amount_cents, o.created_at, o.currency, o.error_occured, o.has_parent_transaction, o.id, o.integration_id,
    o.is_3d_secure, o.is_auth, o.is_capture, o.is_refunded, o.is_standalone_payment, o.is_voided, o.order?.id, o.owner,
    o.pending, o.source_data?.pan, o.source_data?.sub_type, o.source_data?.type, o.success,
  ].map(v).join("");
}

async function sha512hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
  return Array.from(sig).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const isTrue = (x: unknown) => x === true || x === "true";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST expected" }, 405);
  const HMAC_SECRET = Deno.env.get("PAYMOB_HMAC_SECRET");
  if (!HMAC_SECRET) return json({ error: "PAYMENTS_NOT_CONFIGURED" }, 503);

  const given = (new URL(req.url).searchParams.get("hmac") || "").toLowerCase();
  if (!/^[0-9a-f]{128}$/.test(given)) return json({ error: "bad signature" }, 401);
  if (Number(req.headers.get("content-length") || 0) > MAX_BODY) return json({ error: "too large" }, 413);

  let body: any;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY) return json({ error: "too large" }, 413);
    body = JSON.parse(raw);
  } catch { return json({ error: "bad json" }, 400); }
  if (body?.type && body.type !== "TRANSACTION") return json({ ok: true, ignored: body.type });
  const o = body?.obj;
  if (!o || typeof o !== "object") return json({ error: "bad payload" }, 400);

  const expected = await sha512hex(HMAC_SECRET, hmacString(o));
  if (!safeEqual(expected, given)) { console.error("paymob webhook: bad HMAC"); return json({ error: "bad signature" }, 401); }

  // ---- from here on the message is authentic (signed by Paymob) ----
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const txn = String(o.id ?? "");
  const log = (order: string | null, kind: string, detail: Record<string, unknown>, alert = false) =>
    db.rpc("log_payment_event", { p_order: order, p_txn: txn, p_kind: kind, p_detail: detail, p_alert: alert });

  const orderId = String(o.order?.merchant_order_id || "");
  const validRef = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
  const pending = isTrue(o.pending);
  const success = isTrue(o.success) && !isTrue(o.error_occured);

  // the callback must come from OUR card integration
  const INTEGRATION = Deno.env.get("PAYMOB_INTEGRATION_ID");
  if (INTEGRATION && String(o.integration_id) !== String(INTEGRATION)) {
    console.error("paymob webhook: foreign integration", o.integration_id);
    if (success) await log(validRef ? orderId : null, "wrong_integration", { integration_id: o.integration_id, amount_cents: o.amount_cents, currency: o.currency }, true);
    return json({ ok: true, ignored: "other integration" });
  }

  if (!validRef) {
    console.error("paymob webhook: no merchant_order_id", o.order?.id);
    if (success) await log(null, "no_reference", { paymob_order: o.order?.id ?? null, amount_cents: o.amount_cents, currency: o.currency }, true);
    return json({ ok: true, ignored: "no reference" });
  }

  if (pending) return json({ ok: true, pending: true });
  if (isTrue(o.is_refunded) || isTrue(o.is_voided)) {
    await log(orderId, "refund_or_void", { refunded: isTrue(o.is_refunded), voided: isTrue(o.is_voided), amount_cents: o.amount_cents }, true);
    return json({ ok: true, ignored: "refund/void is recorded by an admin" });
  }
  // an authorisation that was never captured is not money
  if (isTrue(o.is_auth) && !isTrue(o.is_capture)) {
    await log(orderId, "auth_only", { amount_cents: o.amount_cents }, false);
    return json({ ok: true, ignored: "authorisation only" });
  }

  if (success) {
    const amount = Number(o.amount_cents);
    if (!Number.isSafeInteger(amount) || amount <= 0 || typeof o.currency !== "string") {
      await log(orderId, "bad_amount", { amount_cents: o.amount_cents, currency: o.currency }, true);
      return json({ ok: false, error: "BAD_AMOUNT" });
    }
    const { data, error } = await db.rpc("finalize_order_paid", {
      p_order: orderId, p_txn: txn, p_provider_order: String(o.order?.id ?? ""), p_amount_cents: amount, p_currency: String(o.currency),
    });
    if (error) {
      console.error("paymob webhook db error (will be retried):", String(error.message || ""));
      return json({ error: "temporary" }, 500);   // Paymob retries
    }
    if (data && data.ok === false) {
      console.error("paymob webhook REJECTED:", data.reason, orderId);
      return json({ ok: false, error: data.reason });   // already logged + admins alerted inside the database
    }
    return json({ ok: true, result: data });
  }

  await db.rpc("mark_order_failed", { p_order: orderId, p_txn: txn });
  await log(orderId, "failed", { amount_cents: o.amount_cents }, false);
  return json({ ok: true, failed: true });
});
