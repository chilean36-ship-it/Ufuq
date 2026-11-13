// "Install app" support (PWA). Chrome / Edge / Android fire `beforeinstallprompt` once, early - possibly before React has
// mounted - so the event is captured here (imported from main.jsx) and kept until the install banner asks for it.
import { isNativeApp } from './nativeApp';

let deferred = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => { try { fn(); } catch (e) { /* ignore */ } });

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; notify(); });
  window.addEventListener('appinstalled', () => { deferred = null; try { localStorage.setItem('ufuq-pwa-installed', '1'); } catch (e) { /* ignore */ } notify(); });
}

export const canPromptInstall = () => !!deferred;
export const onInstallChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

/** True when the site is already running as an installed app (home-screen icon / app window). */
export function isStandalone() {
  try {
    if (isNativeApp()) return true; // already inside the Android app: never offer "install"
    return (window.matchMedia && (window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: minimal-ui)').matches))
      || window.navigator.standalone === true;
  } catch (e) { return false; }
}

/** iPhone / iPad (iPadOS reports itself as a Mac with a touch screen). They have no install event: the user adds it from the Share menu. */
export function isIOS() {
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** Opens the browser's own install dialog. Resolves 'accepted' | 'dismissed' | 'unavailable'. */
export async function promptInstall() {
  if (!deferred) return 'unavailable';
  const ev = deferred; deferred = null; notify();
  try { await ev.prompt(); const r = await ev.userChoice; return r && r.outcome === 'accepted' ? 'accepted' : 'dismissed'; } catch (e) { return 'dismissed'; }
}
