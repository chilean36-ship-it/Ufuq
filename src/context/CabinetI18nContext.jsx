import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { LANG_KEY } from '../i18n';
import { saveLangToProfile, ensureProfileLang } from '../lib/langSync';

export const CabinetI18nContext = createContext(null);

function readSavedLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved) return saved;
  } catch (e) { /* storage blocked */ }
  return 'EN';
}

/**
 * "Cabinet" i18n (student/teacher/admin panels) — a different lookup style from the site
 * pages: the dictionary key IS the English source text (port of window.t() in
 * profile.html / dashboard.html / teacher.html / admin.html), but it reads and writes the
 * *same* "ufuq-language" localStorage key as the site's <I18nProvider>, so the choice
 * a visitor made on the landing page carries straight into the cabinet.
 */
export function CabinetI18nProvider({ dict, children }) {
  const [lang, setLangState] = useState(readSavedLang);

  useEffect(() => { ensureProfileLang(lang); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.documentElement.lang = lang === 'AR' ? 'ar' : lang === 'RU' ? 'ru' : lang === 'UZ' ? 'uz' : 'en';
    document.documentElement.dir = lang === 'AR' ? 'rtl' : 'ltr';
  }, [lang]);

  useEffect(() => () => {
    document.documentElement.dir = 'ltr';
    document.documentElement.lang = 'en';
  }, []);

  const setLang = useCallback((next) => {
    try { localStorage.setItem(LANG_KEY, next); } catch (e) { /* ignore */ }
    setLangState(next);
    saveLangToProfile(next);
  }, []);

  const t = useCallback((key) => {
    const map = dict[lang] || dict.EN;
    return (map && map[key]) || (dict.EN && dict.EN[key]) || key;
  }, [dict, lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <CabinetI18nContext.Provider value={value}>{children}</CabinetI18nContext.Provider>;
}

export function useCabinetI18n() {
  const ctx = useContext(CabinetI18nContext);
  if (!ctx) throw new Error('useCabinetI18n must be used inside <CabinetI18nProvider>');
  return ctx;
}

/**
 * Lets a shared view that was written against another dictionary (e.g. the Profile page, whose strings live in
 * cabinet-profile.js) render inside a panel that has its own provider: it follows the panel's current language
 * but looks keys up in `dict` first, then in the panel's own dictionary.
 */
export function CabinetI18nBridge({ dict, children }) {
  const outer = useCabinetI18n();
  const { lang, setLang } = outer;
  const t = useCallback((key) => {
    const map = dict[lang] || dict.EN;
    return (map && map[key]) || (dict.EN && dict.EN[key]) || outer.t(key);
  }, [dict, lang, outer]);
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <CabinetI18nContext.Provider value={value}>{children}</CabinetI18nContext.Provider>;
}
