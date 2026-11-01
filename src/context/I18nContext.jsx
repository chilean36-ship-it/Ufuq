import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DICTS, LANG_KEY, resolve } from '../i18n';
import { saveLangToProfile, ensureProfileLang } from '../lib/langSync';

export const I18nContext = createContext(null);

function readSavedLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved && DICTS[saved]) return saved;
  } catch (e) { /* storage blocked */ }
  return 'EN';
}

/**
 * Language state for the public/site pages (landing, about-author, checkout, profile).
 * Restores the saved language, persists changes under "ufuq-language", and drives
 * <html dir/lang> (Arabic = rtl). Direction is reset when the provider unmounts so
 * pages that never had a language switcher (dashboard/admin/teacher) stay LTR.
 */
export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(readSavedLang);

  useEffect(() => { ensureProfileLang(lang); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.documentElement.dir = lang === 'AR' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang.toLowerCase();
  }, [lang]);

  useEffect(() => () => {
    document.documentElement.dir = 'ltr';
    document.documentElement.lang = 'en';
  }, []);

  const setLang = useCallback((next) => {
    if (!DICTS[next]) return;
    try { localStorage.setItem(LANG_KEY, next); } catch (e) { /* ignore */ }
    setLangState(next);
    saveLangToProfile(next);
  }, []);

  const t = useCallback(
    (key) => {
      const v = resolve(DICTS[lang] || DICTS.EN, key);
      return v !== undefined ? v : resolve(DICTS.EN, key) ?? key;
    },
    [lang]
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}
