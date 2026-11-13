import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { LANG_KEY } from '../i18n';
import { canPromptInstall, isIOS, isStandalone, onInstallChange, promptInstall } from '../lib/pwaInstall';

/**
 * Small "Install the Ufuq app" banner (PWA). Shown only where it can never get in the way:
 *   - on the landing / about / cabinet home pages (never during an exam, payment, chat call or admin work),
 *   - not when the site already runs as an installed app, not for 21 days after the user closed it, never after installing,
 *   - Android / desktop Chrome / Edge: one tap opens the browser's install dialog; iPhone / iPad: short "Share -> Add to Home Screen" steps.
 * Texts are local (the cabinets use their own i18n systems), language = the one saved by the language switcher.
 */
const TEXT = {
  EN: { title: 'Install the Ufuq app', sub: 'Open Ufuq from your home screen, full screen and faster.', install: 'Install', later: 'Not now', close: 'Close',
    iosSub: 'Tap the Share button, then “Add to Home Screen”.', iosOk: 'Got it' },
  UZ: { title: 'Ufuq ilovasini o\'rnating', sub: 'Ufuq\'ni bosh ekrandan, to\'liq ekranda va tezroq oching.', install: 'O\'rnatish', later: 'Hozir emas', close: 'Yopish',
    iosSub: '«Ulashish» tugmasini bosing, so\'ng «Bosh ekranga qo\'shish»ni tanlang.', iosOk: 'Tushunarli' },
  RU: { title: 'Установите приложение Ufuq', sub: 'Открывайте Ufuq с главного экрана — на весь экран и быстрее.', install: 'Установить', later: 'Не сейчас', close: 'Закрыть',
    iosSub: 'Нажмите «Поделиться», затем «На экран “Домой”».', iosOk: 'Понятно' },
  AR: { title: 'ثبّت تطبيق أُفُق', sub: 'افتح أُفُق من الشاشة الرئيسية بملء الشاشة وبسرعة أكبر.', install: 'تثبيت', later: 'لاحقًا', close: 'إغلاق',
    iosSub: 'اضغط زر المشاركة ثم «إضافة إلى الشاشة الرئيسية».', iosOk: 'حسنًا' },
};
const SHOW_ON = new Set(['/', '/index', '/dashboard', '/about-author', '/profile']);
const KEY_DISMISS = 'ufuq-pwa-dismissed';
const DISMISS_DAYS = 21;

const CSS = `
.pwa-bar{position:fixed;z-index:900;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));max-width:460px;margin-inline:auto;display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:16px;background:#1a1a1a;color:#edeae3;border:1px solid rgba(201,162,75,.45);box-shadow:0 18px 50px rgba(0,0,0,.55);font-family:inherit;animation:pwaIn .35s ease both;}
@keyframes pwaIn{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:none;}}
.pwa-ico{flex:none;width:44px;height:44px;border-radius:11px;display:block;}
.pwa-txt{flex:1;min-width:0;}
.pwa-txt strong{display:block;font-size:14.5px;font-weight:600;line-height:1.25;}
.pwa-txt span{display:block;margin-top:2px;font-size:12.5px;line-height:1.35;color:#a8a29b;}
.pwa-act{flex:none;display:flex;flex-direction:column;gap:4px;align-items:stretch;}
.pwa-btn{border:0;border-radius:9px;padding:8px 14px;font:600 13.5px/1 inherit;font-family:inherit;cursor:pointer;background:#c9a24b;color:#121212;white-space:nowrap;}
.pwa-btn:hover{filter:brightness(1.08);}
.pwa-later{border:0;background:transparent;color:#a8a29b;font:500 12px/1 inherit;font-family:inherit;padding:5px;cursor:pointer;}
.pwa-later:hover{color:#edeae3;}
@media (prefers-reduced-motion:reduce){.pwa-bar{animation:none;}}
@media (max-width:380px){.pwa-ico{display:none;}}
`;

function readLang() {
  try { const l = localStorage.getItem(LANG_KEY); if (TEXT[l]) return l; } catch (e) { /* storage blocked */ }
  const n = ((navigator.language || 'en') + '').slice(0, 2).toUpperCase();
  return TEXT[n] ? n : 'EN';
}
function recentlyDismissed() {
  try {
    if (localStorage.getItem('ufuq-pwa-installed')) return true;
    const t = Number(localStorage.getItem(KEY_DISMISS) || 0);
    return t > 0 && Date.now() - t < DISMISS_DAYS * 86400000;
  } catch (e) { return false; }
}
/** Something the user must not be interrupted by: an exam / full-screen dialog is open. */
// (Closed dialogs stay in the page - e.g. the video lightbox - so only a dialog that is actually visible counts.)
const busy = () => Array.from(document.querySelectorAll('.xr, [role="dialog"][aria-modal="true"]'))
  .some((el) => el.getAttribute('aria-hidden') !== 'true' && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden');

export default function InstallPrompt() {
  const { pathname } = useLocation();
  const [ready, setReady] = useState(false);   // a moment after the page opened
  const [, tick] = useState(0);
  const [hidden, setHidden] = useState(false);
  const ios = isIOS();

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 9000);
    const off = onInstallChange(() => tick((n) => n + 1));
    const poll = setInterval(() => tick((n) => n + 1), 2000); // re-check: hide the banner if an exam / dialog opens meanwhile
    return () => { clearTimeout(t); clearInterval(poll); off(); };
  }, []);

  if (hidden || !ready || !SHOW_ON.has(pathname) || isStandalone() || recentlyDismissed() || busy()) return null;
  const canInstall = canPromptInstall();
  if (!canInstall && !ios) return null; // browsers without install support (e.g. Firefox desktop) get nothing

  const lang = readLang();
  const tx = TEXT[lang];
  const dismiss = () => { try { localStorage.setItem(KEY_DISMISS, String(Date.now())); } catch (e) { /* ignore */ } setHidden(true); };
  const install = async () => { const r = await promptInstall(); if (r === 'accepted') setHidden(true); else dismiss(); };

  return (
    <div className="pwa-bar" role="region" aria-label={tx.title} dir={lang === 'AR' ? 'rtl' : 'ltr'}>
      <style>{CSS}</style>
      <img className="pwa-ico" src="/favicon-96.png" alt="" width="44" height="44" />
      <div className="pwa-txt"><strong>{tx.title}</strong><span>{canInstall ? tx.sub : tx.iosSub}</span></div>
      <div className="pwa-act">
        <button type="button" className="pwa-btn" onClick={canInstall ? install : dismiss}>{canInstall ? tx.install : tx.iosOk}</button>
        {canInstall && <button type="button" className="pwa-later" onClick={dismiss}>{tx.later}</button>}
      </div>
    </div>
  );
}
