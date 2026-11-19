/**
 * Offline data: every successful READ from the database is remembered on this device (Cache Storage, per signed-in user); when the
 * network is not there the last remembered answer is returned instead, so the app opens and shows what the student saw before.
 *
 *  - only reads are remembered: GET /rest/v1/… and a short allow-list of read-only RPCs (never a write, never a payment / exam action);
 *  - the answer of a request is used only when the request itself FAILS (no network) or the browser reports "offline";
 *  - everything is keyed by user id and wiped on sign-out;
 *  - passed to the Supabase client as its `fetch`.
 */
const CACHE = 'ufuq-data-v1';
const FAKE = 'https://offline.ufuq.invalid/';
const UID_KEY = 'ufuq-last-uid';
const SLOW_MS = 3500; // a remembered answer replaces a network answer that has not arrived by then

// read-only RPCs the student side calls
const READ_RPC = new Set([
  'my_access', 'my_attendance_lock', 'my_certificates', 'my_level_results', 'my_level_exams', 'my_closed_groups', 'my_group_join_code',
  'ufuq_series_codes_for', 'payments_public_config', 'group_chat_avatars', 'group_written_ranking', 'exam_days', 'is_super_admin',
]);

const say = (name) => { try { window.dispatchEvent(new Event(name)); } catch (e) { /* ignore */ } };   // 'ufuq-stale' = an answer came from the device, 'ufuq-fresh' = the network answered
const hasCaches = () => typeof caches !== 'undefined';
const safeGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const safeSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } };

/** user id from a user JWT ("a.b.c" with a `sub`); null for the anon key or garbage */
function uidFromAuth(h) {
  const m = /^Bearer\s+(.+)$/i.exec(h || '');
  if (!m || m[1].split('.').length !== 3) return null;
  try {
    const b = m[1].split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const j = JSON.parse(atob(b + '==='.slice((b.length + 3) % 4)));
    return j && j.sub ? String(j.sub) : null;
  } catch (e) { return null; }
}

async function sha(text) {
  try {
    const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((x) => x.toString(16).padStart(2, '0')).join('');
  } catch (e) { return String(text.length) + ':' + text.slice(0, 80); }
}

export async function offlineFetch(input, init) {
  let req;
  try { req = new Request(input, init); } catch (e) { return fetch(input, init); }
  let url;
  try { url = new URL(req.url); } catch (e) { return fetch(input, init); }
  const isRest = url.pathname.startsWith('/rest/v1/');
  const rpc = url.pathname.startsWith('/rest/v1/rpc/') ? url.pathname.split('/').pop() : null;
  const cacheable = hasCaches() && isRest && (req.method === 'GET' || (req.method === 'POST' && rpc && READ_RPC.has(rpc)));
  if (!cacheable) return fetch(req);

  const jwtUid = uidFromAuth(req.headers.get('Authorization'));
  if (jwtUid) safeSet(UID_KEY, jwtUid);
  const uid = jwtUid || safeGet(UID_KEY) || 'anon';
  const body = req.method === 'POST' ? await req.clone().text() : '';
  const key = new Request(FAKE + encodeURIComponent(uid) + '/' + req.method + '/' + (body ? (await sha(body)) + '/' : '') + encodeURIComponent(url.pathname + url.search));

  const fromCache = async () => {
    try {
      const c = await caches.open(CACHE);
      const hit = await c.match(key);
      if (!hit) return null;
      const res = new Response(await hit.blob(), { status: 200, headers: hit.headers });
      res.headers.set('x-ufuq-offline', '1');
      return res;
    } catch (e) { return null; }
  };

  // the browser itself says there is no network: answer from the device at once
  const offlineNow = typeof navigator !== 'undefined' && navigator.onLine === false;
  const cachedP = fromCache();
  if (offlineNow) {
    const hit = await cachedP;
    if (hit) { say('ufuq-stale'); return hit; }
  }
  const net = fetch(req).then((res) => {
    say('ufuq-fresh');
    if (res && res.ok && res.status === 200) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(key, copy)).catch(() => { /* quota / private mode: just not remembered */ });
    }
    return res;
  });
  const hit = await cachedP;
  if (!hit) return net;                       // nothing remembered: the network decides
  // something is remembered: use the network answer when it comes quickly, otherwise (slow / unreachable network) the remembered one
  net.catch(() => {});                        // a late failure must not surface
  return new Promise((resolve) => {
    const timer = setTimeout(() => { say('ufuq-stale'); resolve(hit); }, SLOW_MS);
    net.then((res) => { clearTimeout(timer); resolve(res); }, () => { clearTimeout(timer); say('ufuq-stale'); resolve(hit); });
  });
}

/** The last signed-in user stored by supabase-js (used when the token is expired and cannot be refreshed offline). */
export function readStoredUser() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /^sb-.+-auth-token$/.test(k)) {
        const j = JSON.parse(localStorage.getItem(k) || 'null');
        if (j && j.user && j.user.id) return j.user;
      }
    }
  } catch (e) { /* ignore */ }
  return null;
}

/** Everything remembered on this device (data + saved media) — called on sign-out. */
export async function clearOfflineData() {
  try { localStorage.removeItem(UID_KEY); } catch (e) { /* ignore */ }
  if (!hasCaches()) return;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k === CACHE || k.startsWith('ufuq-offline-')).map((k) => caches.delete(k)));
  } catch (e) { /* ignore */ }
}
