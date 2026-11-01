import { forwardRef, useCallback, useContext, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { I18nContext } from '../context/I18nContext';
import { DICTS, LANG_KEY, resolve } from '../i18n';
import { TURNSTILE_SITE_KEY, captchaEnabled, loadTurnstile, siteTheme, turnstileLang } from '../lib/captcha';

/**
 * Landing i18n provider ichida bo'lsa o'shani ishlatadi; cabinet (dashboard/profile)
 * sahifalarida provider bo'lmasa, saqlangan tilni o'zi o'qiydi — hech qachon qulamaydi.
 */
function useCaptchaI18n() {
  const ctx = useContext(I18nContext);
  if (ctx) return ctx;
  let lang = 'EN';
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved && DICTS[saved]) lang = saved;
  } catch (e) { /* storage blocked */ }
  const t = (key) => {
    const v = resolve(DICTS[lang] || DICTS.EN, key);
    return v !== undefined ? v : (resolve(DICTS.EN, key) ?? key);
  };
  return { t, lang };
}

/**
 * Ko'rinmas (interaction-only) CAPTCHA bloki.
 *   const cap = useRef(null);
 *   <Captcha ref={cap} action="login" />
 *   const token = await cap.current.getToken();   // null bo'lsa -> tekshiruv tugamagan
 *   ... yuborgach: cap.current.reset();            // token bir martalik
 * captchaEnabled = false bo'lsa hech narsa chizmaydi va getToken() darrov null qaytaradi.
 */
const Captcha = forwardRef(function Captcha({ action = 'form', className = '' }, ref) {
  const { t, lang } = useCaptchaI18n();
  const boxRef = useRef(null);
  const widgetId = useRef(null);
  const token = useRef(null);
  const waiters = useRef([]);
  const retries = useRef(0);
  const [visible, setVisible] = useState(false); // shubha: foydalanuvchi bosishi kerak
  const [failed, setFailed] = useState(false);
  const visibleRef = useRef(false);
  // Mavzu o'zgarsa (dark/light) widgetni qayta chizish uchun kuzatamiz
  const [theme, setTheme] = useState(siteTheme);
  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return undefined;
    const mo = new MutationObserver(() => setTheme(siteTheme()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);

  const flush = useCallback((value) => {
    const list = waiters.current;
    waiters.current = [];
    list.forEach((fn) => fn(value));
  }, []);

  const reset = useCallback(() => {
    token.current = null;
    setFailed(false);
    try { if (widgetId.current !== null && window.turnstile) window.turnstile.reset(widgetId.current); } catch (e) { /* ignore */ }
  }, []);

  useImperativeHandle(ref, () => ({
    enabled: captchaEnabled,
    reset,
    /** Token tayyor bo'lguncha kutadi. Challenge ko'rinib turgan bo'lsa foydalanuvchini kutadi. */
    getToken: () => new Promise((resolve) => {
      if (!captchaEnabled) { resolve(null); return; }
      if (token.current) { resolve(token.current); return; }
      let done = false;
      const finish = (v) => { if (!done) { done = true; clearTimeout(timer); resolve(v); } };
      waiters.current.push(finish);
      const tick = () => {
        if (done) return;
        if (visibleRef.current) { timer = setTimeout(tick, 1000); return; } // foydalanuvchi yechmoqda
        finish(null);
      };
      let timer = setTimeout(tick, 12000);
    }),
  }), [reset]);

  useEffect(() => {
    if (!captchaEnabled) return undefined;
    let cancelled = false;
    loadTurnstile().then((ts) => {
      if (cancelled || !boxRef.current) return;
      const w = boxRef.current.clientWidth || 300;
      widgetId.current = ts.render(boxRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        action,
        theme,
        language: turnstileLang(lang),
        appearance: 'interaction-only',
        size: w < 300 ? 'compact' : 'flexible',
        retry: 'auto',
        'refresh-expired': 'auto',
        callback: (tok) => { token.current = tok; retries.current = 0; setFailed(false); flush(tok); },
        'expired-callback': () => { token.current = null; },
        'timeout-callback': () => { token.current = null; },
        'before-interactive-callback': () => { visibleRef.current = true; setVisible(true); },
        'after-interactive-callback': () => { visibleRef.current = false; },
        'error-callback': () => {
          token.current = null;
          if (retries.current < 2) {
            retries.current += 1;
            setTimeout(() => { try { ts.reset(widgetId.current); } catch (e) { /* ignore */ } }, 900);
          } else {
            setFailed(true);
            flush(null);
          }
          return true;
        },
      });
    }).catch(() => { if (!cancelled) { setFailed(true); flush(null); } });
    return () => {
      cancelled = true;
      try { if (widgetId.current !== null && window.turnstile) window.turnstile.remove(widgetId.current); } catch (e) { /* ignore */ }
      widgetId.current = null;
      visibleRef.current = false;
    };
    // widget bir marta chiziladi; til/mavzu o'zgarsa qayta chizish uchun key ishlatiladi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, lang, theme]);

  if (!captchaEnabled) return null;

  return (
    <div className={'cf-captcha' + (visible || failed ? ' show' : '') + (failed ? ' err' : '') + (className ? ' ' + className : '')} data-action={action}>
      {(visible || failed) && (
        <div className="cf-captcha-label">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 4.5-3.2 8.2-8 9-4.8-.8-8-4.5-8-9V6z" /><path d="M9 12l2 2 4-4" /></svg>
          <span>{failed ? t('captcha.failed') : t('captcha.hint')}</span>
        </div>
      )}
      <div ref={boxRef} className="cf-captcha-box" />
      {failed && <button type="button" className="cf-captcha-retry" onClick={() => { retries.current = 0; reset(); }}>{t('captcha.retry')}</button>}
    </div>
  );
});

export default Captcha;
