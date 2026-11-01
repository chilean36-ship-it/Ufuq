/* "I want to pay" intent: remembered while a visitor signs up / signs in, so they land on the checkout instead of the
   empty cabinet. sessionStorage survives the Google OAuth round trip (same tab) and is cleared as soon as it is used. */
const KEY = 'ufuq-pay-intent';

export function setPayIntent(plan) {
  try { sessionStorage.setItem(KEY, plan === 'yearly' ? 'yearly' : 'monthly'); } catch (e) { /* storage blocked */ }
}
export function peekPayIntent() {
  try { const v = sessionStorage.getItem(KEY); return v === 'yearly' || v === 'monthly' ? v : null; } catch (e) { return null; }
}
export function clearPayIntent() {
  try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ }
}
/** Where a student should go right after signing in: the checkout if they came from a "pay" button, otherwise `fallback`. */
export function afterAuthDestination(role, fallback) {
  if (role && role !== 'student') { clearPayIntent(); return fallback; }
  const plan = peekPayIntent();
  if (!plan) return fallback;
  clearPayIntent();
  return `/checkout?plan=${plan}`;
}
