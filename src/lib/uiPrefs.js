import { useCallback, useEffect, useState } from 'react';

/** Per-device interface preferences (Settings → Appearance). Applied as data-attributes on <html>; see styles/ui-prefs.css. */
const KEY = 'ufuq-ui-prefs';
export const DEFAULT_PREFS = { accent: 'gold', density: 'comfortable', motion: 'full', text: 'normal', contrast: 'normal' };
export const ACCENTS = ['gold', 'emerald', 'sky', 'violet', 'rose'];

export function getUiPrefs() {
  try { return { ...DEFAULT_PREFS, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch (e) { return { ...DEFAULT_PREFS }; }
}

export function applyUiPrefs(p = getUiPrefs()) {
  const h = document.documentElement;
  const reduceOS = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  h.setAttribute('data-accent', p.accent);
  h.setAttribute('data-density', p.density);
  h.setAttribute('data-text', p.text);
  h.setAttribute('data-contrast', p.contrast === 'high' ? 'high' : 'normal');
  h.setAttribute('data-motion', p.motion === 'reduced' || (p.motion === 'system' && reduceOS) ? 'reduce' : 'full');
}

export function useUiPrefs() {
  const [prefs, setPrefs] = useState(getUiPrefs);
  useEffect(() => { applyUiPrefs(prefs); }, [prefs]);
  const setPref = useCallback((k, v) => {
    setPrefs((cur) => {
      const next = { ...cur, [k]: v };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (e) { /* storage blocked */ }
      return next;
    });
  }, []);
  const reset = useCallback(() => {
    try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    setPrefs({ ...DEFAULT_PREFS });
  }, []);
  const isDefault = Object.keys(DEFAULT_PREFS).every((k) => prefs[k] === DEFAULT_PREFS[k]);
  return { prefs, setPref, reset, isDefault };
}
