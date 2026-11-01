import { useEffect, useRef } from 'react';

/*
 * Silent live refresh. Every few seconds the page that is currently open re-runs its own data loader with
 * { silent: true } — loaders must then (a) not show a loading state, (b) not toast errors. The screen never flashes,
 * scroll position and typed text are untouched, and the refresh is skipped whenever it could disturb the person:
 * hidden tab, a dialog open, a field focused, an exam running or a recording in progress.
 */
export const LIVE_REFRESH_MS = 5000;

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
    let running = false;
    const id = setInterval(async () => {
      if (running || isUserBusy()) return;
      running = true;
      try { await ref.current({ silent: true }); } catch (e) { /* silent */ }
      running = false;
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}
