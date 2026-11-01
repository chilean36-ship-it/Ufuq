import { supabase } from './supabaseClient';

/* Teacher "Media" uploads → Cloudflare R2 bucket "ufuq-media" through the `ufuq-media` Worker (workers/ufuq-media).
   Big videos are cut into 10 MB parts (3 in flight, each retried), so there is no single-request size limit
   and the progress bar is real. */
export const MEDIA_WORKER_URL = 'https://ufuq-media.ufuq-edu.workers.dev';

async function authHeaders() {
  const { data } = await supabase.auth.getSession(); // refreshes an expired token for us
  const token = data && data.session && data.session.access_token;
  if (!token) throw new Error('Session expired — please sign in again.');
  return { Authorization: 'Bearer ' + token };
}

async function call(path, method, body) {
  const headers = await authHeaders();
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(MEDIA_WORKER_URL + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.ok === false) throw new Error((data && data.error) || 'HTTP ' + res.status);
  return data;
}

function putPart(url, headers, blob, onBytes, signal) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    Object.keys(headers).forEach((k) => xhr.setRequestHeader(k, headers[k]));
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onBytes(e.loaded); };
    xhr.onload = () => {
      let data = null; try { data = JSON.parse(xhr.responseText); } catch (e) { /* not json */ }
      if (xhr.status >= 200 && xhr.status < 300 && data && data.ok) resolve(data);
      else reject(new Error((data && data.error) || 'HTTP ' + xhr.status));
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.onabort = () => reject(new Error('Cancelled'));
    if (signal) signal.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(blob);
  });
}

/**
 * Uploads one file. `groups` = the group codes it is published to (1 → groups/<code>/…, several → shared/<teacher>/…).
 * Resolves { ok:true, url, key, size } or { ok:false, error } — never throws.
 */
export async function uploadMedia({ file, kind, groups, contentType, onProgress, signal }) {
  let init = null;
  try {
    init = await call('/upload/init', 'POST', { kind, groups, filename: file.name, contentType: contentType || file.type, size: file.size });
    const total = Math.ceil(file.size / init.partSize);
    const sent = new Array(total).fill(0);
    const parts = new Array(total);
    const report = () => { if (onProgress) onProgress(Math.min(1, sent.reduce((a, b) => a + b, 0) / file.size)); };
    let next = 0;

    async function worker() {
      while (next < total) {
        const i = next++;
        const blob = file.slice(i * init.partSize, Math.min(file.size, (i + 1) * init.partSize));
        const qs = '?key=' + encodeURIComponent(init.key) + '&uploadId=' + encodeURIComponent(init.uploadId) + '&ticket=' + encodeURIComponent(init.ticket) + '&part=' + (i + 1);
        let lastErr = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          if (signal && signal.aborted) throw new Error('Cancelled');
          try {
            const headers = await authHeaders();
            const r = await putPart(MEDIA_WORKER_URL + '/upload/part' + qs, headers, blob, (loaded) => { sent[i] = loaded; report(); }, signal);
            parts[i] = { partNumber: r.partNumber, etag: r.etag };
            sent[i] = blob.size; report();
            lastErr = null; break;
          } catch (e) {
            lastErr = e; sent[i] = 0; report();
            if (e.message === 'Cancelled') throw e;
            await new Promise((ok) => setTimeout(ok, 800 * (attempt + 1)));
          }
        }
        if (lastErr) throw lastErr;
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, total) }, worker));
    const done = await call('/upload/complete', 'POST', { key: init.key, uploadId: init.uploadId, ticket: init.ticket, parts });
    return { ok: true, key: done.key, size: done.size };
  } catch (err) {
    if (init) { try { await call('/upload/abort', 'POST', { key: init.key, uploadId: init.uploadId, ticket: init.ticket }); } catch (e) { /* ignore */ } }
    return { ok: false, error: (err && err.message) || String(err) };
  }
}

/* Files are private: the worker hands out a signed link that lasts 3 h and is only issued to someone RLS lets see the file. */
const linkCache = new Map();
export async function signMedia(id) {
  const hit = linkCache.get(id);
  if (hit && hit.exp > Date.now()) return { ok: true, url: hit.url };
  try {
    const d = await call('/sign?id=' + encodeURIComponent(id), 'GET');
    linkCache.set(id, { url: d.url, exp: Date.now() + (d.expiresIn - 300) * 1000 });
    return { ok: true, url: d.url };
  } catch (err) { return { ok: false, error: (err && err.message) || String(err) }; }
}

/** Removes the DB row (RLS-checked) and then the R2 object — done by the worker so the two never drift apart. */
export async function deleteMedia(id) {
  try { await call('/file?id=' + encodeURIComponent(id), 'DELETE'); return { ok: true }; }
  catch (err) { return { ok: false, error: (err && err.message) || String(err) }; }
}

/** Length of a local audio/video file in seconds (0 when the browser can't tell). */
export function probeDuration(file, kind) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement(kind === 'video' ? 'video' : 'audio');
    el.preload = 'metadata';
    const done = (v) => { clearTimeout(timer); URL.revokeObjectURL(url); el.removeAttribute('src'); resolve(v); };
    const timer = setTimeout(() => done(0), 8000);
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? Math.round(el.duration) : 0);
    el.onerror = () => done(0);
    el.src = url;
  });
}

export function fmtBytes(n) {
  const v = Number(n) || 0;
  if (v < 1024 * 1024) return Math.max(1, Math.round(v / 1024)) + ' KB';
  if (v < 1024 * 1024 * 1024) return (v / 1024 / 1024).toFixed(v < 10 * 1024 * 1024 ? 1 : 0) + ' MB';
  return (v / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}
export function fmtClock(sec) {
  const s = Math.max(0, parseInt(sec, 10) || 0), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(r).padStart(2, '0');
}
