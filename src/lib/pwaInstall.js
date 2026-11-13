// Install-to-home-screen support shared by the website button and the app's "Me" tab.
// Chrome / Edge / Android fire `beforeinstallprompt` (we keep it and show it from our own button);
// iOS Safari has no such event, so the button explains Share -> "Add to Home Screen" instead.
let deferred = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => { try { fn(); } catch (e) { /* ignore */ } });

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; notify(); });
  window.addEventListener('appinstalled', () => { deferred = null; try { localStorage.setItem('ufuq-app-installed', '1'); } catch (x) { /* ignore */ } notify(); });
}

export function isStandalone() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: minimal-ui)').matches || window.navigator.standalone === true;
  } catch (e) { return false; }
}
export function isIos() {
  const ua = navigator.userAgent || '';
  return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}
export function canPromptInstall() { return !!deferred; }
export function wasInstalled() { try { return localStorage.getItem('ufuq-app-installed') === '1'; } catch (e) { return false; } }

/** Opens the browser's own install dialog. Resolves 'accepted' | 'dismissed' | 'unavailable'. */
export async function promptInstall() {
  if (!deferred) return 'unavailable';
  const ev = deferred; deferred = null; notify();
  try { await ev.prompt(); const c = await ev.userChoice; return c && c.outcome === 'accepted' ? 'accepted' : 'dismissed'; } catch (e) { return 'unavailable'; }
}
export function subscribeInstall(fn) { listeners.add(fn); return () => listeners.delete(fn); }
