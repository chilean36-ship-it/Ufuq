// ufuq-media — Cloudflare Worker: teacher video/audio uploads + PROTECTED playback from the R2 bucket "ufuq-media".
//
// R2 layout (groups never mix):
//   groups/<group_code>/<video|audio>/<YYYY-MM>/<id>-<slug>.<ext>   -> exactly ONE group
//   shared/<teacher_id>/<video|audio>/<YYYY-MM>/<id>-<slug>.<ext>   -> several groups at once
//
// Security model
//  * Files are NOT public. Playback needs a short-lived, HMAC-signed link that is only issued to a signed-in user
//    who may see that file (Supabase RLS decides). A copied/forwarded link stops working after TOKEN_TTL.
//  * Browsers must come from ALLOWED_ORIGINS (Origin/Referer check) — blocks hot-linking from other sites.
//  * Uploads need a teacher/admin Supabase session; each multipart upload is bound to its creator by a signed ticket.
//  * Only whitelisted video/audio extensions; responses are always served with a fixed media Content-Type,
//    `nosniff` and a sandbox CSP, so an uploaded .html can never run on this origin.
//
// Endpoints (all need `Authorization: Bearer <supabase access token>` except GET /f/…?t=…)
//   POST /upload/init  PUT /upload/part  POST /upload/complete  POST /upload/abort
//   GET  /sign?id=<group_media.id>    -> { url }   (RLS-checked, 3 h link)
//   DELETE /file?id=<group_media.id>
//   GET  /f/<key>?t=<token>           streaming with Range support

const PART_SIZE = 10 * 1024 * 1024;
const MAX_PART = 16 * 1024 * 1024;
const MAX_BYTES = 4 * 1024 * 1024 * 1024;
const TOKEN_TTL = 3 * 3600;                 // seconds
const KINDS = ['video', 'audio'];
const MIME_BY_EXT = {
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', aac: 'audio/aac', opus: 'audio/ogg', flac: 'audio/flac',
};
const EXT_KIND = { mp4: 'video', m4v: 'video', webm: 'video', mov: 'video', mkv: 'video', mp3: 'audio', m4a: 'audio', wav: 'audio', ogg: 'audio', aac: 'audio', opus: 'audio', flac: 'audio' };
const authCache = new Map();

const enc = new TextEncoder();
const origins = (env) => String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hmac(env, msg) {
  if (!env.SIGNING_SECRET) throw new Error('SIGNING_SECRET is not configured on the worker.');
  const key = await crypto.subtle.importKey('raw', enc.encode(env.SIGNING_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}
function same(a, b) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }

function corsFor(request, env) {
  const o = (request.headers.get('Origin') || '').replace(/\/$/, '');
  const h = {
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Range',
    'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length',
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin',
  };
  if (o && origins(env).includes(o)) h['Access-Control-Allow-Origin'] = o;
  return h;
}
/** Browser requests must originate from our own site (Origin for fetch/XHR, Referer for <video>/<audio>). */
function originOk(request, env) {
  const list = origins(env);
  const raw = request.headers.get('Origin') || request.headers.get('Referer') || '';
  if (!raw) return false;
  let o; try { o = new URL(raw).origin; } catch (e) { return false; }
  return list.includes(o);
}

const slug = (s) => String(s || 'file').toLowerCase().replace(/\.[^.]+$/, '').normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'file';
const safeCode = (c) => String(c).replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 64);
const extOf = (filename) => { const m = String(filename || '').match(/\.([a-zA-Z0-9]{2,5})$/); return m ? m[1].toLowerCase() : ''; };

async function authenticate(request, env) {
  const m = (request.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const token = m[1];
  const hit = authCache.get(token);
  if (hit && hit.exp > Date.now()) return hit.auth;
  const h = { apikey: env.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token };
  const u = await fetch(env.SUPABASE_URL + '/auth/v1/user', { headers: h });
  if (!u.ok) return null;
  const user = await u.json();
  const p = await fetch(env.SUPABASE_URL + '/rest/v1/profiles?select=role&id=eq.' + user.id, { headers: h });
  const rows = p.ok ? await p.json() : [];
  const auth = { uid: user.id, role: rows[0] && rows[0].role, token };
  authCache.set(token, { exp: Date.now() + 60_000, auth });
  if (authCache.size > 300) authCache.clear();
  return auth;
}
const isStaff = (a) => a && (a.role === 'teacher' || a.role === 'admin');

async function allowedGroups(env, auth, codes) {
  if (auth.role === 'admin') return true;
  const list = codes.map((c) => '"' + c.replace(/["\\]/g, '') + '"').join(',');
  const r = await fetch(env.SUPABASE_URL + '/rest/v1/teacher_groups?select=group_code&teacher_id=eq.' + auth.uid + '&group_code=in.(' + encodeURIComponent(list) + ')', {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + auth.token },
  });
  if (!r.ok) return false;
  return new Set((await r.json()).map((x) => x.group_code)).size === new Set(codes).size;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsFor(request, env);
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors } });
    const fail = (status, error) => json({ ok: false, error }, status);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname.startsWith('/f/')) {
        return await serveFile(request, env, url, cors);
      }
      if (!originOk(request, env)) return fail(403, 'Origin not allowed.');
      const auth = await authenticate(request, env);
      if (!auth) return fail(401, 'Please sign in again.');

      if (request.method === 'GET' && url.pathname === '/sign') return sign(env, auth, url, json, fail);
      if (!isStaff(auth)) return fail(403, 'Teachers only.');
      if (request.method === 'POST' && url.pathname === '/upload/init') return initUpload(request, env, auth, json, fail);
      if (request.method === 'PUT' && url.pathname === '/upload/part') return uploadPart(request, env, auth, url, json, fail);
      if (request.method === 'POST' && url.pathname === '/upload/complete') return completeUpload(request, env, auth, json, fail);
      if (request.method === 'POST' && url.pathname === '/upload/abort') return abortUpload(request, env, auth, json, fail);
      if (request.method === 'DELETE' && url.pathname === '/file') return deleteFile(env, auth, url, json, fail);
      return fail(404, 'Not found');
    } catch (err) {
      return fail(500, 'Server error.'); // never leak internals
    }
  },
};

/* ---- playback ---- */
async function sign(env, auth, url, json, fail) {
  const id = url.searchParams.get('id') || '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(400, 'Bad id.');
  // Row-level security with the CALLER's token decides whether this person may watch this file.
  const r = await fetch(env.SUPABASE_URL + '/rest/v1/group_media?select=r2_key&id=eq.' + id, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + auth.token } });
  const rows = r.ok ? await r.json() : [];
  if (!rows.length) return fail(404, 'Not available.');
  const key = rows[0].r2_key;
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL;
  const tok = exp + '.' + (await hmac(env, 'f|' + key + '|' + exp));
  return json({ ok: true, url: new URL(url).origin + '/f/' + key.split('/').map(encodeURIComponent).join('/') + '?t=' + tok, expiresIn: TOKEN_TTL });
}

async function serveFile(request, env, url, cors) {
  const deny = (s) => new Response('Forbidden', { status: s, headers: { 'Cache-Control': 'no-store', ...cors } });
  if (!originOk(request, env)) return deny(403);
  const key = decodeURIComponent(url.pathname.slice(3));
  const [expStr, mac] = (url.searchParams.get('t') || '').split('.');
  const exp = parseInt(expStr, 10);
  if (!exp || !mac || exp < Date.now() / 1000) return deny(403);
  if (!same(mac, await hmac(env, 'f|' + key + '|' + exp))) return deny(403);
  const mime = MIME_BY_EXT[extOf(key)];
  if (!mime) return deny(403);

  const obj = await env.BUCKET.get(key, { range: request.headers, onlyIf: request.headers });
  if (!obj) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store', ...cors } });
  const h = new Headers(cors);
  h.set('Content-Type', mime);                                   // never trust stored metadata
  h.set('Content-Disposition', 'inline');
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Content-Security-Policy', "sandbox; default-src 'none'");
  h.set('Cross-Origin-Resource-Policy', 'cross-origin');
  h.set('Referrer-Policy', 'no-referrer');
  h.set('Cache-Control', 'private, max-age=600');
  h.set('Accept-Ranges', 'bytes');
  h.set('ETag', obj.httpEtag);
  if (!('body' in obj)) return new Response(null, { status: 304, headers: h });
  let status = 200;
  const r = obj.range;
  if (r && request.headers.get('Range')) {
    // R2 may expose every key of the range object (offset/length/suffix) with the unused ones undefined,
    // so test the VALUE (not `'suffix' in r`) — otherwise start becomes NaN and browsers reject the 206.
    let start = 0, end = obj.size - 1;
    if (typeof r.suffix === 'number') start = Math.max(0, obj.size - r.suffix);
    else {
      start = Number(r.offset) || 0;
      if (typeof r.length === 'number') end = Math.min(obj.size - 1, start + r.length - 1);
    }
    h.set('Content-Range', 'bytes ' + start + '-' + end + '/' + obj.size);
    h.set('Content-Length', String(end - start + 1));
    status = 206;
  } else h.set('Content-Length', String(obj.size));
  return new Response(request.method === 'HEAD' ? null : obj.body, { status, headers: h });
}

/* ---- upload ---- */
const ticketOf = (env, auth, key, uploadId) => hmac(env, 'u|' + auth.uid + '|' + key + '|' + uploadId);
async function checkTicket(env, auth, key, uploadId, ticket) {
  return !!(key && uploadId && ticket) && same(ticket, await ticketOf(env, auth, key, uploadId));
}

async function initUpload(request, env, auth, json, fail) {
  const b = await request.json().catch(() => null);
  if (!b || !KINDS.includes(b.kind)) return fail(400, 'kind must be video or audio.');
  const groups = Array.isArray(b.groups) ? [...new Set(b.groups.map(String))].filter(Boolean) : [];
  if (groups.length === 0 || groups.length > 60) return fail(400, 'Pick 1–60 groups.');
  const ext = extOf(b.filename);
  if (!EXT_KIND[ext] || EXT_KIND[ext] !== b.kind) return fail(400, 'Unsupported file type.');
  const size = Number(b.size) || 0;
  if (size <= 0 || size > MAX_BYTES) return fail(400, 'File is empty or larger than 4 GB.');
  if (!(await allowedGroups(env, auth, groups))) return fail(403, 'You are not assigned to one of the selected groups.');

  const now = new Date();
  const month = now.getUTCFullYear() + '-' + String(now.getUTCMonth() + 1).padStart(2, '0');
  const folder = groups.length === 1 ? 'groups/' + safeCode(groups[0]) : 'shared/' + auth.uid;
  const key = folder + '/' + b.kind + '/' + month + '/' + crypto.randomUUID().replace(/-/g, '').slice(0, 16) + '-' + slug(b.filename) + '.' + ext;
  const mp = await env.BUCKET.createMultipartUpload(key, { httpMetadata: { contentType: MIME_BY_EXT[ext] }, customMetadata: { uploadedBy: auth.uid } });
  return json({ ok: true, key, uploadId: mp.uploadId, partSize: PART_SIZE, ticket: await ticketOf(env, auth, key, mp.uploadId) });
}

async function uploadPart(request, env, auth, url, json, fail) {
  const key = url.searchParams.get('key') || '', uploadId = url.searchParams.get('uploadId') || '', n = parseInt(url.searchParams.get('part'), 10);
  if (!(n >= 1 && n <= 10000)) return fail(400, 'Bad part.');
  if (!(await checkTicket(env, auth, key, uploadId, url.searchParams.get('ticket')))) return fail(403, 'Forbidden.');
  if ((parseInt(request.headers.get('Content-Length'), 10) || 0) > MAX_PART) return fail(413, 'Part too large.');
  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_PART) return fail(413, 'Part too large.');
  const part = await env.BUCKET.resumeMultipartUpload(key, uploadId).uploadPart(n, body);
  return json({ ok: true, partNumber: part.partNumber, etag: part.etag });
}

async function completeUpload(request, env, auth, json, fail) {
  const b = await request.json().catch(() => null);
  if (!b || !Array.isArray(b.parts) || !(await checkTicket(env, auth, b.key, b.uploadId, b.ticket))) return fail(403, 'Forbidden.');
  const obj = await env.BUCKET.resumeMultipartUpload(b.key, b.uploadId).complete(b.parts.map((p) => ({ partNumber: p.partNumber, etag: p.etag })));
  if (obj.size > MAX_BYTES) { await env.BUCKET.delete(b.key); return fail(413, 'Too large.'); }
  return json({ ok: true, key: b.key, size: obj.size });
}

async function abortUpload(request, env, auth, json, fail) {
  const b = await request.json().catch(() => null);
  if (!b || !(await checkTicket(env, auth, b.key, b.uploadId, b.ticket))) return fail(403, 'Forbidden.');
  try { await env.BUCKET.resumeMultipartUpload(b.key, b.uploadId).abort(); } catch (e) { /* already gone */ }
  return json({ ok: true });
}

/** DB row first (RLS with the caller's JWT), then the R2 object — the two never drift apart. */
async function deleteFile(env, auth, url, json, fail) {
  const id = url.searchParams.get('id') || '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(400, 'Bad id.');
  const r = await fetch(env.SUPABASE_URL + '/rest/v1/group_media?id=eq.' + id, {
    method: 'DELETE', headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + auth.token, Prefer: 'return=representation' },
  });
  if (!r.ok) return fail(r.status === 403 ? 403 : 400, 'Could not delete.');
  const rows = await r.json();
  if (!rows.length) return fail(403, 'Not found or not yours.');
  await env.BUCKET.delete(rows[0].r2_key);
  return json({ ok: true });
}
