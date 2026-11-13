import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { LANG_KEY } from '../i18n';
import { saveLangToProfile } from '../lib/langSync';
import { APP_DICT } from './strings';

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

function initialLang() {
  try {
    const s = localStorage.getItem(LANG_KEY);
    if (s && APP_DICT[s]) return s;
  } catch (e) { /* storage blocked */ }
  const n = (navigator.language || '').slice(0, 2).toLowerCase();
  return n === 'ru' ? 'RU' : n === 'ar' ? 'AR' : n === 'en' ? 'EN' : 'UZ';
}

/** Language for the whole app: its own screens and (same storage key) the cabinet views mounted inside it. */
export function AppProvider({ children }) {
  const [lang, setLangState] = useState(initialLang);
  useEffect(() => {
    document.documentElement.lang = lang.toLowerCase();
    document.documentElement.dir = lang === 'AR' ? 'rtl' : 'ltr';
  }, [lang]);
  useEffect(() => () => { document.documentElement.dir = 'ltr'; document.documentElement.lang = 'en'; }, []);
  const setLang = useCallback((next, { sync = true } = {}) => {
    if (!APP_DICT[next]) return;
    try { localStorage.setItem(LANG_KEY, next); } catch (e) { /* ignore */ }
    setLangState(next);
    if (sync) saveLangToProfile(next);
  }, []);
  const t = useCallback((k) => (APP_DICT[lang] && APP_DICT[lang][k]) || APP_DICT.EN[k] || k, [lang]);
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

/* ---- onboarding answers (kept on the device; copied to the account's metadata after sign-up) ---- */
const PREFS_KEY = 'ufuq-app-prefs';
const DONE_KEY = 'ufuq-app-onboarded';
export function readPrefs() { try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch (e) { return {}; } }
export function writePrefs(p) { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) { /* ignore */ } }
export function isOnboarded() { try { return localStorage.getItem(DONE_KEY) === '1'; } catch (e) { return false; } }
export function setOnboarded() { try { localStorage.setItem(DONE_KEY, '1'); } catch (e) { /* ignore */ } }
