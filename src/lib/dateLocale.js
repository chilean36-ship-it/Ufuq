/* Date / time formatting in the language chosen in the cabinet (EN | UZ | RU | AR),
   not in the browser's language — otherwise a student who picked Uzbek still sees "Oct 29" in English. */
const LOCALES = { EN: 'en-GB', UZ: 'uz-UZ', RU: 'ru-RU', AR: 'ar' };

export function dateLocale(lang) {
  return LOCALES[String(lang || 'EN').toUpperCase()] || 'en-GB';
}

/** Never throws: an unsupported locale falls back to English, an invalid date to ''. */
export function fmtDate(value, lang, opts) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  try { return d.toLocaleDateString(dateLocale(lang), opts); } catch (e) { try { return d.toLocaleDateString('en-GB', opts); } catch (e2) { return ''; } }
}

export function fmtTime(value, lang, opts) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const o = opts || { hour: '2-digit', minute: '2-digit' };
  try { return d.toLocaleTimeString(dateLocale(lang), o); } catch (e) { try { return d.toLocaleTimeString('en-GB', o); } catch (e2) { return ''; } }
}

export function fmtDateTime(value, lang, opts) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  try { return d.toLocaleString(dateLocale(lang), opts); } catch (e) { try { return d.toLocaleString('en-GB', opts); } catch (e2) { return ''; } }
}

/** The language saved by the language switcher (same key as both i18n providers) — for plain functions that have no hook. */
export function currentLang() {
  try { return localStorage.getItem('ufuq-language') || 'EN'; } catch (e) { return 'EN'; }
}
