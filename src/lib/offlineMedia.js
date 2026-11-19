import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Media (audio lessons, board photos) saved on THIS device so they open without internet.
 * Files are stored whole in Cache Storage (not streamed), keyed by their address, and played from a local blob link.
 * Saving needs the file host to allow our site (CORS); when it does not, saveMedia() reports `cors` and nothing breaks.
 */
const CACHE = 'ufuq-offline-media-v1';
const hasCaches = () => typeof caches !== 'undefined';
const blobUrls = new Map(); // address -> blob: link already made in this page
const listeners = new Set();
const notify = () => listeners.forEach((fn) => { try { fn(); } catch (e) { /* ignore */ } });

async function open() { return caches.open(CACHE); }

export async function isSaved(url) {
  if (!hasCaches() || !url) return false;
  try { return !!(await (await open()).match(url)); } catch (e) { return false; }
}

/** blob: link of a saved file, or null when it is not on the device. */
export async function getBlobUrl(url) {
  if (!hasCaches() || !url) return null;
  if (blobUrls.has(url)) return blobUrls.get(url);
  try {
    const hit = await (await open()).match(url);
    if (!hit) return null;
    const u = URL.createObjectURL(await hit.blob());
    blobUrls.set(url, u);
    return u;
  } catch (e) { return null; }
}

export async function removeMedia(url) {
  if (!hasCaches()) return;
  try { await (await open()).delete(url); } catch (e) { /* ignore */ }
  const u = blobUrls.get(url);
  if (u) { try { URL.revokeObjectURL(u); } catch (e) { /* ignore */ } blobUrls.delete(url); }
  notify();
}

export async function savedCount() {
  if (!hasCaches()) return 0;
  try { return (await (await open()).keys()).length; } catch (e) { return 0; }
}

/**
 * Downloads `url` into the device. Resolves { ok:true } or { ok:false, reason:'cors'|'network'|'space'|'unsupported'|'aborted'|'bad' }.
 * onProgress(0..1) is called while the file arrives.
 */
export async function saveMedia(url, onProgress, signal) {
  if (!hasCaches() || !url) return { ok: false, reason: 'unsupported' };
  let res;
  try {
    res = await fetch(url, { mode: 'cors', credentials: 'omit', signal });
  } catch (e) {
    if (e && e.name === 'AbortError') return { ok: false, reason: 'aborted' };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, reason: 'network' };
    // the file host does not allow our site (CORS): the R2 bucket needs a CORS rule for https://ufuqtaleem.com
    return { ok: false, reason: 'cors' };
  }
  if (!res.ok) return { ok: false, reason: 'bad' };
  const total = parseInt(res.headers.get('content-length') || '0', 10) || 0;
  try {
    if (total && navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      if (est && est.quota && est.usage != null && est.quota - est.usage < total * 1.2) { if (res.body) res.body.cancel(); return { ok: false, reason: 'space' }; }
    }
  } catch (e) { /* estimate not available: try anyway */ }
  try {
    const chunks = []; let got = 0;
    if (res.body && res.body.getReader) {
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value); got += value.length;
        if (onProgress && total) onProgress(Math.min(1, got / total));
      }
    } else { chunks.push(new Uint8Array(await res.arrayBuffer())); }
    const type = res.headers.get('content-type') || 'application/octet-stream';
    const blob = new Blob(chunks, { type });
    if (!blob.size) return { ok: false, reason: 'bad' };
    await (await open()).put(url, new Response(blob, { status: 200, headers: { 'content-type': type, 'content-length': String(blob.size) } }));
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* best effort */ }
    if (onProgress) onProgress(1);
    notify();
    return { ok: true };
  } catch (e) {
    if (e && e.name === 'AbortError') return { ok: false, reason: 'aborted' };
    return { ok: false, reason: e && /quota/i.test(String(e.name || e.message)) ? 'space' : 'network' };
  }
}

/** State + actions of one file: { saved, busy, pct, error, save(), remove() }. */
export function useOfflineFile(url) {
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [error, setError] = useState('');
  const ctl = useRef(null);
  useEffect(() => {
    let off = false;
    const check = () => isSaved(url).then((v) => { if (!off) setSaved(v); });
    check(); setError(''); setBusy(false); setPct(0);
    listeners.add(check);
    return () => { off = true; listeners.delete(check); if (ctl.current) ctl.current.abort(); };
  }, [url]);
  const save = useCallback(async () => {
    if (busy) return;
    setBusy(true); setError(''); setPct(0);
    ctl.current = new AbortController();
    const r = await saveMedia(url, setPct, ctl.current.signal);
    ctl.current = null;
    setBusy(false);
    if (r.ok) setSaved(true); else if (r.reason !== 'aborted') setError(r.reason);
  }, [url, busy]);
  const remove = useCallback(async () => { await removeMedia(url); setSaved(false); }, [url]);
  const cancel = useCallback(() => { if (ctl.current) ctl.current.abort(); }, []);
  return { saved, busy, pct, error, save, remove, cancel };
}

/** `src` to put on an <img>: the saved copy when there is one, otherwise the original address. */
export function useOfflineSrc(url) {
  const [src, setSrc] = useState(url);
  useEffect(() => {
    let off = false;
    setSrc(url);
    getBlobUrl(url).then((u) => { if (!off && u) setSrc(u); });
    return () => { off = true; };
  }, [url]);
  return src;
}
