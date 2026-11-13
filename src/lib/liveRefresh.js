import { useEffect, useRef } from 'react';

/*
 * Silent live refresh. Every few seconds the page that is currently open re-runs its own data loader with
 * { silent: true } — loaders must then (a) not show a loading state, (b) not toast errors. The screen never flashes,
 * scroll position and typed text are untouched, and the refresh is skipped whenever it could disturb the person:
 * hidden tab, a dialog open, a field focused, an exam running or a recording in progress.
 *
 * Load protection (many students are online at once): the next run is scheduled with random jitter (so thousands of
 * devices never hit the server in the same second), it slows down 4x when the person has not touched the screen for
 * 90 seconds, and it backs off (up to 60 s) while the loader keeps failing.
 */
export const LIVE_REFRESH_MS = 5000;

let lastTouch = Date.now();
if (typeof window !== 'undefined') {
  const touch = () => { lastTouch = Date.now(); };
  ['pointerdown', 'keydown', 'touchstart', 'scroll'].forEach((e) => window.addEventListener(e, touch, { passive: true, capture: true }));
}

export function isUserBusy() {
  if (typeof document === 'undefined') return true;
  if (document.visibilityState !== 'visible') return true;
  const body = document.body;
  if (body && body.classList.contains('exam-guard-on')) return true;
  if (document.querySelector('.overlay.open, .modal-overlay.open, [aria-modal="true"], .exam-fullscreen, .exam-fs, [data-no-live-refresh]')) return true;
  const a = document.activeElement;
  // only someone who is really typing blocks the refresh: an empty (or merely focused) field does not
  if (a && (a.tagName === 'TEXTAREA' || a.isContentEditable)) return true;
  if (a && a.tagName === 'INPUT' && a.type !== 'checkbox' && a.type !== 'radio' && String(a.value || '') !== '') return true;
  return false;
}

export default function useLiveRefresh(fn, intervalMs = LIVE_REFRESH_MS) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    let stopped = false;
    let timer = 0;
    let fails = 0;
    let running = false;
    const schedule = () => {
      const idle = Date.now() - lastTouch > 90000;
      const base = intervalMs * (idle ? 4 : 1) * Math.pow(2, Math.min(fails, 3));
      const wait = Math.min(60000, Math.max(intervalMs, base * (0.85 + Math.random() * 0.3)));
      timer = setTimeout(tick, wait); // eslint-disable-line no-use-before-define
    };
    const tick = async () => {
      if (stopped) return;
      if (!running && !isUserBusy()) {
        running = true;
        try { await ref.current({ silent: true }); fails = 0; } catch (e) { fails += 1; }
        running = false;
      }
      if (!stopped) schedule();
    };
    schedule();
    return () => { stopped = true; clearTimeout(timer); };
  }, [intervalMs]);
}
