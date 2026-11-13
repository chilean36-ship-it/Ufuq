import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { readPrefs } from './AppContext';

/* ------------------------------------------------------------------ haptics */
/** A tiny tick on supporting phones (Android). Silently does nothing elsewhere or when "reduce motion" is on. */
export function haptic(ms = 8) {
  try {
    const active = !navigator.userActivation || navigator.userActivation.hasBeenActive; // browsers refuse vibration before the first tap
    if (active && navigator.vibrate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) navigator.vibrate(ms);
  } catch (e) { /* ignore */ }
}

/* ------------------------------------------------------------------ toast */
const ToastCtx = createContext({ toast: () => {} });
export const useToast = () => useContext(ToastCtx).toast;

export function ToastProvider({ children }) {
  const [item, setItem] = useState(null);
  const timer = useRef(0);
  const toast = useCallback((text, tone = 'ok') => {
    clearTimeout(timer.current);
    setItem({ text, tone, id: Date.now() });
    timer.current = setTimeout(() => setItem(null), 2600);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  const value = useMemo(() => ({ toast }), [toast]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      {item && <div key={item.id} className={'ua-toast ' + item.tone} role="status">{item.text}</div>}
    </ToastCtx.Provider>
  );
}

/* ------------------------------------------------------------------ recently opened sections */
const RECENT_KEY = 'ufuq-app-recent';
export function readRecents() { try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch (e) { return []; } }
export function pushRecent(view) {
  if (!view || view === 'myGroup') return;
  try {
    const list = [view, ...readRecents().filter((v) => v !== view)].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch (e) { /* ignore */ }
}

/* ------------------------------------------------------------------ activity: time in the app, daily goal, streak */
const dayKey = (d = new Date()) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const storeKey = (uid) => 'ufuq-app-activity:' + (uid || 'anon');
const ACTIVE_DAY_SEC = 60; // a day "counts" for the streak after one minute in the app

function readStore(uid) { try { return JSON.parse(localStorage.getItem(storeKey(uid))) || {}; } catch (e) { return {}; } }

function computeStreak(store) {
  let n = 0; const d = new Date();
  if ((store[dayKey(d)] || 0) < ACTIVE_DAY_SEC) d.setDate(d.getDate() - 1); // today not counted yet: the streak still stands until midnight
  while ((store[dayKey(d)] || 0) >= ACTIVE_DAY_SEC) { n += 1; d.setDate(d.getDate() - 1); }
  return n;
}

/**
 * Counts the seconds the person really spends in the app (screen visible and touched in the last minute),
 * per day, on this device. Drives the daily-goal ring, the week strip and the streak.
 * Fires `ufuq-goal-reached` the first time each day the goal is met.
 */
export function useActivity(uid) {
  const [store, setStore] = useState(() => readStore(uid));
  const goalMin = (readPrefs().goal || 10);
  const goalSec = goalMin * 60;
  const last = useRef(Date.now());
  const storeRef = useRef(store);
  storeRef.current = store;
  const [goalVersion, setGoalVersion] = useState(0);

  useEffect(() => {
    const touch = () => { last.current = Date.now(); };
    ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach((e) => window.addEventListener(e, touch, { passive: true, capture: true }));
    let unsaved = 0;
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible' || Date.now() - last.current > 60000) return;
      const k = dayKey();
      const cur = storeRef.current;
      const before = cur[k] || 0;
      const next = { ...cur, [k]: before + 1 };
      storeRef.current = next;
      unsaved += 1;
      setStore(next);
      if (before < goalSec && before + 1 >= goalSec) window.dispatchEvent(new Event('ufuq-goal-reached'));
      if (unsaved >= 5) { unsaved = 0; try { localStorage.setItem(storeKey(uid), JSON.stringify(trim(next))); } catch (e) { /* ignore */ } }
    }, 1000);
    const flush = () => { try { localStorage.setItem(storeKey(uid), JSON.stringify(trim(storeRef.current))); } catch (e) { /* ignore */ } };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => { clearInterval(id); flush(); window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', flush); ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach((e) => window.removeEventListener(e, touch, { capture: true })); };
  }, [uid, goalSec, goalVersion]);

  // Re-read the goal when it is changed on the Me tab.
  useEffect(() => {
    const on = () => setGoalVersion((n) => n + 1);
    window.addEventListener('ufuq-goal-changed', on);
    return () => window.removeEventListener('ufuq-goal-changed', on);
  }, []);

  return useMemo(() => {
    const today = store[dayKey()] || 0;
    const now = new Date();
    const mondayOffset = (now.getDay() + 6) % 7;
    const week = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now); d.setDate(now.getDate() - mondayOffset + i);
      return { date: d, sec: store[dayKey(d)] || 0, isToday: dayKey(d) === dayKey(now), future: d > now && dayKey(d) !== dayKey(now) };
    });
    const total = Object.values(store).reduce((a, b) => a + b, 0);
    return { todaySec: today, goalSec, goalMin, ratio: Math.min(1, today / goalSec), reached: today >= goalSec, streak: computeStreak(store), week, totalMin: Math.round(total / 60) };
  }, [store, goalSec, goalMin]);
}

function trim(store) {
  const keys = Object.keys(store).sort().slice(-120); // keep ~4 months
  const out = {}; keys.forEach((k) => { out[k] = store[k]; });
  return out;
}

/* ------------------------------------------------------------------ pull to refresh */
/** Pull the page down from the top (touch) to run onRefresh. Returns { pull (0..1), busy }. */
export function usePullRefresh(onRefresh) {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const cb = useRef(onRefresh); cb.current = onRefresh;
  useEffect(() => {
    const el = document.getElementById('uaScroll');
    if (!el) return undefined;
    let y0 = null; let dist = 0;
    const start = (e) => { y0 = el.scrollTop <= 0 ? e.touches[0].clientY : null; dist = 0; };
    const move = (e) => {
      if (y0 == null) return;
      dist = Math.max(0, e.touches[0].clientY - y0);
      if (dist > 0 && el.scrollTop <= 0) setPull(Math.min(1, dist / 110));
    };
    const end = async () => {
      if (y0 == null) return;
      const fire = dist > 100;
      y0 = null; setPull(0);
      if (fire) { setBusy(true); haptic(12); try { await cb.current(); } finally { setBusy(false); } }
    };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: true });
    el.addEventListener('touchend', end, { passive: true });
    return () => { el.removeEventListener('touchstart', start); el.removeEventListener('touchmove', move); el.removeEventListener('touchend', end); };
  }, []);
  return { pull, busy };
}

/** Counts a number up to `value` (stats feel alive). */
export function useCountUp(value, ms = 700) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setN(value); return undefined; }
    let raf; const t0 = performance.now();
    const tick = (t) => { const p = Math.min(1, (t - t0) / ms); setN(Math.round(value * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return n;
}
