import { useEffect } from 'react';

/**
 * Cabinet sahifalari (dashboard / teacher / admin) bo'limlarni route emas, state bilan almashtiradi —
 * shuning uchun F5 (obnovleniya) qilinganda hamma narsa boshiga (Home / Overview) qaytib ketardi.
 * Bu yerda joriy bo'lim URL hash'ida saqlanadi: /dashboard#myGroup. Sahifa yangilansa, shu bo'limning
 * o'zida qolinadi. Hash o'zgarishi history'ga yangi yozuv qo'shmaydi (replaceState) va router'ga tegmaydi.
 */

/** Hash'dagi bo'lim nomi (agar `isValid` ruxsat bersa), aks holda `fallback`. */
export function readHashView(fallback, isValid) {
  try {
    const h = decodeURIComponent((window.location.hash || '').replace(/^#/, ''));
    if (h && (!isValid || isValid(h))) return h;
  } catch (e) { /* noto'g'ri hash — e'tibor bermaymiz */ }
  return fallback;
}

/** `view` o'zgarganda hash'ni yangilaydi. `defaultView` bo'lsa hash olib tashlanadi (toza URL). */
export default function useHashView(view, defaultView) {
  useEffect(() => {
    try {
      const { pathname, search, hash } = window.location;
      const next = view && view !== defaultView ? '#' + encodeURIComponent(view) : '';
      if (next === hash) return;
      window.history.replaceState(window.history.state, '', pathname + search + next);
    } catch (e) { /* ignore */ }
  }, [view, defaultView]);
}
