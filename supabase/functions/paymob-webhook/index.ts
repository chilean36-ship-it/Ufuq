// ============================================================
// Ufuq — paymob-webhook   (Paymob "transaction processed callback")
// Paymob POSTs the result of every payment here. We trust nothing until the HMAC (SHA-512, your HMAC secret) matches,
// then call finalize_order_paid(), which re-checks amount + currency against the order and is idempotent (Paymob retries).
// MUST be deployed WITHOUT JWT verification:  supabase functions deploy paymob-webhook --no-verify-jwt
// Secret: PAYMOB_HMAC_SECRET (Paymob dashboard → Settings → Account info → HMAC)
// In Paymob set "Transaction processed callback" to  https://<project>.supabase.co/functions/v1/paymob-webhook
// ============================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

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

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST expected" }, 405);
  const HMAC_SECRET = Deno.env.get("PAYMOB_HMAC_SECRET");
  if (!HMAC_SECRET) return json({ error: "PAYMENTS_NOT_CONFIGURED" }, 503);

  const given = (new URL(req.url).searchParams.get("hmac") || "").toLowerCase();
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  if (body?.type && body.type !== "TRANSACTION") return json({ ok: true, ignored: body.type });
  const o = body?.obj;
  if (!o || !given) return json({ error: "bad payload" }, 400);

  const expected = await sha512hex(HMAC_SECRET, hmacString(o));
  if (!safeEqual(expected, given)) { console.error("paymob webhook: bad HMAC"); return json({ error: "bad signature" }, 401); }

  const orderId = String(o.order?.merchant_order_id || "");
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) { console.error("paymob webhook: no merchant_order_id", o.order?.id); return json({ ok: true, ignored: "no reference" }); }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  const pending = o.pending === true || o.pending === "true";
  const success = o.success === true || o.success === "true";
  if (pending) return json({ ok: true, pending: true });
  if (o.is_refunded === true || o.is_voided === true) return json({ ok: true, ignored: "refund/void is recorded by an admin" });

  if (success && !(o.error_occured === true)) {
    const { data, error } = await db.rpc("finalize_order_paid", {
      p_order: orderId, p_txn: String(o.id), p_provider_order: String(o.order?.id ?? ""), p_amount_cents: Number(o.amount_cents), p_currency: String(o.currency),
    });
    if (error) {
      const msg = String(error.message || "");
      // data problems will never fix themselves: answer 200 so Paymob stops retrying, but leave a loud trace
      if (/AMOUNT_MISMATCH|WRONG_METHOD|ORDER_NOT_FOUND|ORDER_CLOSED|USER_GONE/.test(msg)) { console.error("paymob webhook REJECTED:", msg, orderId, o.amount_cents, o.currency); return json({ ok: false, error: msg }); }
      console.error("paymob webhook db error (will be retried):", msg);
      return json({ error: "temporary" }, 500);
    }
    return json({ ok: true, result: data });
  }

  await db.rpc("mark_order_failed", { p_order: orderId, p_txn: String(o.id) });
  return json({ ok: true, failed: true });
});
