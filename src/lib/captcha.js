/**
 * CAPTCHA — Cloudflare Turnstile (bepul, "managed" rejim).
 *
 * Odatiy holatda foydalanuvchi hech narsa ko'rmaydi: Turnstile fonda tekshiradi.
 * Faqat shubhali trafik bo'lsagina ("interaction-only") kichik tasdiqlash oynasi chiqadi.
 *
 * Sayt kaliti (public) .env da: VITE_TURNSTILE_SITE_KEY. Kalit bo'sh bo'lsa CAPTCHA
 * butunlay o'chiq turadi va forma avvalgidek ishlaydi. Secret key Supabase Dashboard
 * (Authentication -> Attack Protection -> CAPTCHA) ga qo'yiladi, brauzerga emas.
 */
export const TURNSTILE_SITE_KEY = (import.meta.env?.VITE_TURNSTILE_SITE_KEY || '').trim();
export const captchaEnabled = TURNSTILE_SITE_KEY.length > 0;

const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loader = null;

/** Turnstile skriptini bir marta yuklaydi. */
export function loadTurnstile() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loader) return loader;
  loader = new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = SRC;
    el.async = true;
    el.defer = true;
    el.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile missing')));
    el.onerror = () => { loader = null; el.remove(); reject(new Error('turnstile load failed')); };
    document.head.appendChild(el);
  });
  return loader;
}

/** Sayt tili -> Turnstile tili. Turnstile o'zbekchani bilmasa "auto" (brauzer tili). */
export function turnstileLang(lang) {
  const l = String(lang || '').toUpperCase();
  if (l === 'RU') return 'ru';
  if (l === 'AR') return 'ar';
  if (l === 'EN') return 'en';
  return 'auto';
}

/** Sayt mavzusi (dark/light) — <html data-theme> dan, topilmasa dark. */
export function siteTheme() {
  try {
    const v = document.documentElement.getAttribute('data-theme');
    if (v === 'light' || v === 'dark') return v;
  } catch (e) { /* ignore */ }
  return 'dark';
}

/** Supabase Auth xatosi CAPTCHA bilan bog'liqmi. */
export function isCaptchaError(err) {
  const m = String((err && (err.message || err.code)) || '');
  return /captcha/i.test(m);
}
