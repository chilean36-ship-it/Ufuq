// ufuq-audio-uploader (HARDENED) — same API as before (POST /upload?group=a..g, GET /list?group=a..g),
// but now: needs a teacher/admin Supabase session, CORS limited to ALLOWED_ORIGINS, audio-only whitelist, 200 MB cap.
const VALID_GROUPS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];   // old lettered groups
// lvl01..lvl14 keys are only kept for files uploaded while groups were named "Level-N"; new uploads use the group letter.
const LEVEL_KEY = /^lvl(0[1-9]|1[0-4])$/;
const validKey = (k) => VALID_GROUPS.includes(k) || LEVEL_KEY.test(k);
const MAX_BYTES = 200 * 1024 * 1024;
const EXT = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg', 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac' };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
    const origin = (request.headers.get('Origin') || '').replace(/\/$/, '');
    const cors = { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Vary': 'Origin' };
    if (origin && allowed.includes(origin)) cors['Access-Control-Allow-Origin'] = origin;
    const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors } });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!origin || !allowed.includes(origin)) return json({ ok: false, error: 'Origin not allowed.' }, 403);

    const m = (request.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i);
    if (!m) return json({ ok: false, error: 'Please sign in again.' }, 401);
    const h = { apikey: env.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + m[1] };
    const u = await fetch(env.SUPABASE_URL + '/auth/v1/user', { headers: h });
    if (!u.ok) return json({ ok: false, error: 'Please sign in again.' }, 401);
    const user = await u.json();
    const p = await fetch(env.SUPABASE_URL + '/rest/v1/profiles?select=role,admin_tier&id=eq.' + user.id, { headers: h });
    const prof = p.ok ? ((await p.json())[0] || {}) : {};
    const role = prof.role;
    if (role !== 'teacher' && role !== 'admin') return json({ ok: false, error: 'Teachers only.' }, 403);

    const group = (url.searchParams.get('group') || '').trim().toLowerCase();
    if (!validKey(group)) return json({ ok: false, error: 'Invalid group. Allowed: ' + VALID_GROUPS.join(', ') + ', lvl01..lvl14' }, 400);

    // Ordinary (standard) admins may upload only for the group(s) linked to them in teacher_groups.
    // Main admins and teachers keep the previous behaviour. Fails closed: if the lookup breaks, nothing is allowed.
    if (role === 'admin' && prof.admin_tier === 'standard') {
      const mine = await linkedLetters(env, h, user.id);
      if (!mine.includes(group)) return json({ ok: false, error: 'Bu guruh sizga biriktirilmagan.' }, 403);
    }

    if (request.method === 'POST' && url.pathname === '/upload') return upload(request, env, group, json);
    if (request.method === 'GET' && url.pathname === '/list') return list(env, group, json);
    return json({ ok: false, error: 'Not found' }, 404);
  },
};

/* Audio key of a group: its permanent letter ("Group A8" -> a). Same rule as groupLetterFor in the app. */
function letterOf(name, letter) {
  const l0 = String(letter || '').toLowerCase();
  if (VALID_GROUPS.includes(l0)) return l0;
  const t = String(name || '').trim();
  const m = t.match(/^(?:group|guruh)[ _-]*([A-Za-z])\d*$/i) || t.match(/([A-Za-z])\s*$/);
  if (!m) return null;
  const l = m[1].toLowerCase();
  return VALID_GROUPS.includes(l) ? l : null;
}

async function linkedLetters(env, h, uid) {
  try {
    const tg = await fetch(env.SUPABASE_URL + '/rest/v1/teacher_groups?select=group_code&teacher_id=eq.' + encodeURIComponent(uid), { headers: h });
    if (!tg.ok) return [];
    const codes = ((await tg.json()) || []).map((r) => r.group_code).filter(Boolean);
    if (!codes.length) return [];
    const list = codes.map((c) => encodeURIComponent(c)).join(',');
    const gr = await fetch(env.SUPABASE_URL + '/rest/v1/groups?select=code,name,letter&code=in.(' + list + ')', { headers: h });
    if (!gr.ok) return [];
    return ((await gr.json()) || []).map((g) => letterOf(g.name, g.letter)).filter(Boolean);
  } catch (e) {
    return [];
  }
}

async function nextNumber(env, group) {
  const re = new RegExp('^audio' + group + '(\\d+)\\.', 'i');
  let max = 0, cursor;
  do {
    const l = await env.AUDIO_BUCKET.list({ prefix: 'audio' + group, cursor });
    for (const o of l.objects) { const x = o.key.match(re); if (x) max = Math.max(max, parseInt(x[1], 10)); }
    cursor = l.truncated ? l.cursor : undefined;
  } while (cursor);
  return max + 1;
}

async function upload(request, env, group, json) {
  const type = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  const ext = EXT[type];
  if (!ext) return json({ ok: false, error: 'Only audio files are allowed.' }, 415);
  const length = parseInt(request.headers.get('Content-Length'), 10) || 0;
  if (length <= 0) return json({ ok: false, error: 'Content-Length is required.' }, 411);
  if (length > MAX_BYTES) return json({ ok: false, error: 'File too large (max 200 MB).' }, 413);
  if (!request.body) return json({ ok: false, error: 'Empty upload.' }, 400);
  const n = await nextNumber(env, group);
  const name = 'audio' + group + n, key = name + '.' + ext;
  // Streamed straight into R2 (a known length is required by R2 for streams); nothing is buffered in Worker memory.
  await env.AUDIO_BUCKET.put(key, request.body, { httpMetadata: { contentType: type } });
  const base = env.PUBLIC_BASE_URL ? env.PUBLIC_BASE_URL.replace(/\/$/, '') : null;
  return json({ ok: true, key, name, group, number: n, url: base ? base + '/' + key : null });
}

async function list(env, group, json) {
  const re = new RegExp('^audio' + group + '(\\d+)\\.', 'i');
  const l = await env.AUDIO_BUCKET.list({ prefix: 'audio' + group });
  const base = env.PUBLIC_BASE_URL ? env.PUBLIC_BASE_URL.replace(/\/$/, '') : null;
  const items = l.objects.map((o) => { const x = o.key.match(re); return { key: o.key, number: x ? parseInt(x[1], 10) : null, uploaded: o.uploaded, size: o.size, url: base ? base + '/' + o.key : null }; }).sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
  return json({ group, items });
}
