import { supabase } from './supabaseClient';

/* Payments — client side. The browser never decides a price: it asks the server to create an order (create_order),
   the server computes the amount, and a card payment then happens on Paymob's own page. */

/* ---------- country → currency (display only; Paymob charges the "charge currency" set by the admin) ---------- */
const EURO = ['AT','BE','CY','EE','FI','FR','DE','GR','IE','IT','LV','LT','LU','MT','NL','PT','SK','SI','ES','HR'];
const CCY = {
  UZ: 'UZS', EG: 'EGP', RU: 'RUB', KZ: 'KZT', KG: 'KGS', TJ: 'TJS', TR: 'TRY', SA: 'SAR', AE: 'AED', QA: 'QAR', KW: 'KWD', JO: 'JOD',
  MA: 'MAD', DZ: 'DZD', TN: 'TND', NG: 'NGN', PK: 'PKR', IN: 'INR', ID: 'IDR', MY: 'MYR', CA: 'CAD', AU: 'AUD', GB: 'GBP', US: 'USD',
};
EURO.forEach((c) => { CCY[c] = 'EUR'; });
export const currencyForCountry = (iso2) => CCY[String(iso2 || '').toUpperCase()] || 'USD';

/* Best guess of where the visitor is, with no tracking and no network call: time zone first, then the browser's region. */
const ZONES = {
  'Asia/Tashkent': 'UZ', 'Asia/Samarkand': 'UZ', 'Africa/Cairo': 'EG', 'Europe/Moscow': 'RU', 'Europe/Samara': 'RU', 'Asia/Yekaterinburg': 'RU',
  'Asia/Novosibirsk': 'RU', 'Asia/Vladivostok': 'RU', 'Asia/Almaty': 'KZ', 'Asia/Aqtobe': 'KZ', 'Asia/Aqtau': 'KZ', 'Asia/Bishkek': 'KG',
  'Asia/Dushanbe': 'TJ', 'Europe/Istanbul': 'TR', 'Asia/Riyadh': 'SA', 'Asia/Dubai': 'AE', 'Asia/Qatar': 'QA', 'Asia/Kuwait': 'KW', 'Asia/Amman': 'JO',
  'Africa/Casablanca': 'MA', 'Africa/Algiers': 'DZ', 'Africa/Tunis': 'TN', 'Africa/Lagos': 'NG', 'Asia/Karachi': 'PK', 'Asia/Kolkata': 'IN',
  'Asia/Calcutta': 'IN', 'Asia/Jakarta': 'ID', 'Asia/Kuala_Lumpur': 'MY', 'Europe/London': 'GB', 'America/Toronto': 'CA', 'America/Vancouver': 'CA',
  'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Los_Angeles': 'US',
  'Europe/Berlin': 'DE', 'Europe/Paris': 'FR', 'Europe/Madrid': 'ES', 'Europe/Rome': 'IT', 'Europe/Amsterdam': 'NL', 'Europe/Vienna': 'AT',
};
export function detectCountry() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && ZONES[tz]) return ZONES[tz];
  } catch (e) { /* ignore */ }
  try {
    const langs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]) || [];
    for (const l of langs) { const m = /-([A-Za-z]{2})\b/.exec(l || ''); if (m) return m[1].toUpperCase(); }
  } catch (e) { /* ignore */ }
  return 'US';
}

/* ISO-2 codes with the English names used by the checkout country list (via Intl, so no 250-line table to maintain). */
export function countryOptions(locale = 'en') {
  let dn = null;
  try { dn = new Intl.DisplayNames([locale], { type: 'region' }); } catch (e) { /* old browser */ }
  const out = [];
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (const a of A) for (const b of A) {
    const code = a + b;
    let name = null;
    try { name = dn ? dn.of(code) : null; } catch (e) { name = null; }
    if (name && name !== code) out.push({ code, name });
  }
  return out.sort((x, y) => x.name.localeCompare(y.name, locale));
}

/* ---------- money ---------- */
export function formatMoney(amount, currency, locale = 'en') {
  const n = Number(amount) || 0;
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: n >= 100 || currency === 'UZS' ? 0 : 2 }).format(n);
  } catch (e) { return `${currency} ${n}`; }
}
/** Same formula as the server's create_order(): usd cents → amount in `currency`. */
export function displayAmount(usdCents, fx, currency) {
  const rate = Number(fx && fx[currency]);
  if (!rate) return { amount: usdCents / 100, currency: 'USD' };
  const raw = (usdCents / 100) * rate;
  return { amount: rate >= 100 ? Math.round(raw) : Math.round(raw * 100) / 100, currency };
}
export const minorToMajor = (cents, currency) => Number(cents) / 100; // EGP, USD … all have 2 decimals

/* ---------- server calls ---------- */
const MESSAGES = {
  NOT_AUTHENTICATED: 'Please sign in again.',
  PLAN_NOT_FOUND: 'This plan is not available any more. Reload the page.',
  METHOD_UNAVAILABLE: 'This payment method is not available yet.',
  PAYMENTS_NOT_CONFIGURED: 'Card payments are not available yet. Please use bank transfer or come back soon.',
  PROVIDER_ERROR: 'The payment provider did not accept the request. Please try again in a minute.',
  PROVIDER_UNREACHABLE: 'The payment provider is not reachable right now. Please try again in a minute.',
  ORDER_NOT_PAYABLE: 'This order can no longer be paid. Start a new one.',
  BAD_BUYER: 'Please enter your full name and a valid email.',
  TERMS_REQUIRED: 'Please accept the terms to continue.',
  NO_RATE: 'Prices are being updated. Please try again shortly.',
};
export function friendlyPayError(err) {
  const raw = String((err && (err.message || err.error || err.details)) || err || '');
  const key = Object.keys(MESSAGES).find((k) => raw.includes(k));
  return key ? MESSAGES[key] : 'Something went wrong. Please try again.';
}

export async function getPaymentsConfig() {
  const { data, error } = await supabase.rpc('payments_public_config');
  if (error) throw error;
  return data;
}
export async function getMyAccess() {
  const { data, error } = await supabase.rpc('my_access');
  if (error) throw error;
  return data;
}
export async function createOrder({ plan, method, country, name, email, displayCurrency, termsVersion }) {
  const { data, error } = await supabase.rpc('create_order', {
    p_plan: plan, p_method: method, p_country: country, p_name: name, p_email: email, p_display_currency: displayCurrency, p_terms_version: termsVersion,
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}
/** Card: returns the Paymob hosted-checkout URL to send the browser to. */
export async function startCardPayment(orderId, phone) {
  const res = await supabase.functions.invoke('paymob-create-payment', { body: { order_id: orderId, phone: phone || '' } });
  let payload = res.data;
  if (res.error) {
    try { payload = await res.error.context.json(); } catch (e) { payload = { error: res.error.message }; }
    throw new Error((payload && payload.error) || 'PROVIDER_ERROR');
  }
  if (!payload || !payload.url) throw new Error((payload && payload.error) || 'PROVIDER_ERROR');
  return payload.url;
}
export async function uploadTransferProof(userId, orderId, file) {
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
  const path = `${userId}/${orderId}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('payment-proofs').upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return path;
}
export async function submitTransferProof(orderId, path, note) {
  const { error } = await supabase.rpc('submit_transfer_proof', { p_order: orderId, p_path: path, p_note: note || '' });
  if (error) throw error;
}
export async function cancelOrder(orderId) {
  const { error } = await supabase.rpc('cancel_my_order', { p_order: orderId });
  if (error) throw error;
}
export async function fetchMyOrders() {
  const base = 'id, invoice_no, status, method, plan_id, months, usd_cents, display_currency, display_amount, charge_currency, charge_cents, paid_at, starts_at, ends_at, created_at, refund_cents, review_note, reviewed_at';
  // cancelled_at / expires_at exist once the payment-policy migration is applied; until then fall back to the old column list.
  let res = await supabase.from('orders').select(base + ', cancelled_at, expires_at').order('created_at', { ascending: false }).limit(50);
  if (res.error) res = await supabase.from('orders').select(base).order('created_at', { ascending: false }).limit(50);
  if (res.error) throw res.error;
  return res.data || [];
}
export async function fetchOrder(id) {
  const { data, error } = await supabase.from('orders')
    .select('id, invoice_no, status, method, plan_id, months, charge_currency, charge_cents, display_currency, display_amount, paid_at, starts_at, ends_at')
    .eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}
export async function getInvoice(orderId) {
  const { data, error } = await supabase.rpc('get_invoice', { p_order: orderId });
  if (error) throw error;
  return data;
}

/* ---------- small helpers for the site pages ---------- */
/** "{n} months" + {n: 3} → "3 months" */
export const fill = (str, vars) => String(str || '').replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] !== undefined ? vars[k] : m));
/** Error → translation key under pay.err.* (falls back to GENERIC). */
export function payErrKey(err) {
  const raw = String((err && (err.message || err.error || err.details)) || err || '');
  const key = ['NOT_AUTHENTICATED', 'PLAN_NOT_FOUND', 'METHOD_UNAVAILABLE', 'PAYMENTS_NOT_CONFIGURED', 'PROVIDER_ERROR', 'PROVIDER_UNREACHABLE', 'ORDER_NOT_PAYABLE', 'BAD_BUYER', 'TERMS_REQUIRED', 'NO_RATE']
    .find((k) => raw.includes(k));
  return `pay.err.${key || 'GENERIC'}`;
}
