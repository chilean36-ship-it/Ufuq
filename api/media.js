/* global Response, URL, fetch, Headers */
// Same-origin download of a lesson audio file, so the app can save it for offline use.
// The audio lives on a public Cloudflare R2 address that does not allow our site to read it from JavaScript (no CORS); this
// function fetches it server-side and streams it back from our own address.
//
//   GET /api/media?u=<https://pub-<32 hex>.r2.dev/<file>.mp3>
//
// Safety: only GET; only that one kind of host (public R2 buckets) and only audio file names — it can never be pointed at other
// servers (no SSRF); the browser must say the request comes from our own site (Sec-Fetch-Site) so other sites cannot use it.
export const config = { runtime: 'edge' };

const OK = /^https:\/\/pub-[0-9a-f]{32}\.r2\.dev\/[A-Za-z0-9._~%-]{1,160}\.(mp3|m4a|wav|ogg|aac|opus|flac)$/i;

const text = (status, msg) => new Response(msg, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });

export default async function handler(request) {
  if (request.method !== 'GET') return text(405, 'Method not allowed');
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return text(403, 'Forbidden');
  const target = new URL(request.url).searchParams.get('u') || '';
  if (!OK.test(target)) return text(400, 'Bad address');

  let up;
  try { up = await fetch(target, { redirect: 'error' }); } catch { return text(502, 'Upstream unreachable'); }
  if (!up.ok || !up.body) return text(up.status === 404 ? 404 : 502, 'Not available');

  const h = new Headers();
  h.set('content-type', up.headers.get('content-type') || 'application/octet-stream');
  const len = up.headers.get('content-length');
  if (len) h.set('content-length', len);
  h.set('cache-control', 'private, no-store');
  h.set('x-content-type-options', 'nosniff');
  return new Response(up.body, { status: 200, headers: h });
}
