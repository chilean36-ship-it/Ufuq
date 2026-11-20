import { useEffect, useState } from 'react';
import { LANG_KEY } from '../i18n';
import { canPromptInstall, isIOS, isStandalone, onInstallChange, promptInstall } from '../lib/pwaInstall';

/**
 * Eye-catching "Download the Ufuq app" card that floats in when a signed-in student opens the cabinet (phone and desktop).
 *   - slides in a few seconds after the cabinet opened, never over an exam / open dialog,
 *   - hidden when the site already runs as the installed app or the app was installed,
 *   - "Install" opens the browser's own install dialog (Android / Chrome / Edge); iPhone / iPad get the Share -> Add to Home Screen steps;
 *     an Android browser without the install event gets the menu steps,
 *   - closed with X / "Later" -> comes back after 3 days; closed again -> after 14 days; installed -> never.
 */
const TXT = {
  UZ: { badge: 'Yangi', title: 'Ufuq ilovasini yuklab oling', sub: 'Telefoningizda alohida ilova sifatida ishlaydi — to‘liq ekran, tezroq va har safar avtomatik kirasiz.',
    p1: 'To‘liq ekran', p2: 'Tezroq', p3: 'Avtomatik kirish', install: 'Yuklab olish', later: 'Keyinroq', ok: 'Tushunarli', close: 'Yopish',
    ios: ['Safari pastidagi “Ulashish” tugmasini bosing', '“Bosh ekranga qo‘shish” ni tanlang', '“Qo‘shish” ni bosing — tayyor'],
    and: ['Brauzer menyusini (⋮) oching', '“Ilovani o‘rnatish” yoki “Bosh ekranga qo‘shish” ni tanlang', 'Tasdiqlang — Ufuq ilovasi paydo bo‘ladi'] },
  RU: { badge: 'Новое', title: 'Скачайте приложение Ufuq', sub: 'Работает как отдельное приложение — на весь экран, быстрее, и вход происходит автоматически.',
    p1: 'На весь экран', p2: 'Быстрее', p3: 'Авто-вход', install: 'Скачать', later: 'Позже', ok: 'Понятно', close: 'Закрыть',
    ios: ['Нажмите «Поделиться» внизу Safari', 'Выберите «На экран “Домой”»', 'Нажмите «Добавить» — готово'],
    and: ['Откройте меню браузера (⋮)', 'Выберите «Установить приложение» или «Добавить на главный экран»', 'Подтвердите — значок Ufuq появится на экране'] },
  AR: { badge: 'جديد', title: 'حمّل تطبيق أُفُق', sub: 'يعمل كتطبيق مستقل — بملء الشاشة وأسرع، ويدخل تلقائيًا في كل مرة.',
    p1: 'ملء الشاشة', p2: 'أسرع', p3: 'دخول تلقائي', install: 'تحميل', later: 'لاحقًا', ok: 'حسنًا', close: 'إغلاق',
    ios: ['اضغط زر «مشاركة» أسفل Safari', 'اختر «إضافة إلى الشاشة الرئيسية»', 'اضغط «إضافة» — تم'],
    and: ['افتح قائمة المتصفح (⋮)', 'اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية»', 'أكّد وسيظهر رمز Ufuq'] },
  EN: { badge: 'New', title: 'Get the Ufuq app', sub: 'It runs as its own app — full screen, faster, and it signs you in automatically.',
    p1: 'Full screen', p2: 'Faster', p3: 'Auto sign-in', install: 'Download', later: 'Later', ok: 'Got it', close: 'Close',
    ios: ['Tap the Share button at the bottom of Safari', 'Choose “Add to Home Screen”', 'Tap “Add” — done'],
    and: ['Open the browser menu (⋮)', 'Choose “Install app” or “Add to Home screen”', 'Confirm — the Ufuq icon appears on your screen'] },
};
const KEY = 'ufuq-nudge'; // JSON { n: times closed, t: last closed (ms) }
const DELAY_MS = 3500;
const COOLDOWN_DAYS = [3, 14]; // after the 1st close / after every later close

const CSS = `
.nudge{position:fixed;z-index:2147483000;right:20px;bottom:20px;width:min(380px,calc(100vw - 24px));box-sizing:border-box;border-radius:22px;padding:18px 18px 16px;color:#edeae3;font-family:'Inter',system-ui,sans-serif;
  background:radial-gradient(120% 90% at 0% 0%,rgba(229,200,120,.16),transparent 55%),linear-gradient(180deg,#232018,#16140f);
  border:1px solid rgba(229,200,120,.5);box-shadow:0 30px 70px rgba(0,0,0,.6),0 0 0 1px rgba(0,0,0,.4),0 0 44px rgba(201,162,75,.22);overflow:hidden;
  animation:nudgeIn .7s cubic-bezier(.18,1.1,.3,1) both}
.nudge.out{animation:nudgeOut .35s ease-in both}
.nudge::before{content:'';position:absolute;inset:0;pointer-events:none;background:linear-gradient(115deg,transparent 35%,rgba(255,236,170,.13) 50%,transparent 65%);transform:translateX(-120%);animation:nudgeShine 3.4s ease-in-out 1.1s infinite}
@keyframes nudgeIn{0%{opacity:0;transform:translateY(60px) scale(.94)}100%{opacity:1;transform:none}}
@keyframes nudgeOut{to{opacity:0;transform:translateY(40px) scale(.96)}}
@keyframes nudgeShine{0%,55%{transform:translateX(-120%)}100%{transform:translateX(120%)}}
@keyframes nudgeBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
@keyframes nudgePulse{0%{box-shadow:0 0 0 0 rgba(229,200,120,.5)}100%{box-shadow:0 0 0 16px rgba(229,200,120,0)}}
.nudge-x{position:absolute;top:10px;inset-inline-end:10px;width:30px;height:30px;border:0;border-radius:50%;background:rgba(255,255,255,.07);color:#cfc9bf;cursor:pointer;font-size:17px;line-height:1;display:grid;place-items:center;transition:background .2s,color .2s}
.nudge-x:hover{background:rgba(255,255,255,.16);color:#fff}
.nudge-top{display:flex;gap:14px;align-items:center;padding-inline-end:26px}
.nudge-ico{flex:none;width:58px;height:58px;border-radius:15px;display:block;animation:nudgeBob 2.6s ease-in-out infinite,nudgePulse 2.2s ease-out infinite;box-shadow:0 6px 18px rgba(0,0,0,.5)}
.nudge-badge{display:inline-block;margin-bottom:4px;padding:2px 9px;border-radius:999px;background:linear-gradient(180deg,#e5c878,#c9a24b);color:#121212;font:700 10.5px/1.5 inherit;letter-spacing:.08em;text-transform:uppercase}
.nudge h4{margin:0;font:600 17px/1.25 'Fraunces',Georgia,serif;color:#f4efe3}
.nudge p{margin:12px 0 0;font-size:13.5px;line-height:1.5;color:#b9b2a6}
.nudge-perks{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
.nudge-perks span{padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600;color:#e5c878;background:rgba(201,162,75,.13);border:1px solid rgba(201,162,75,.28)}
.nudge ol{margin:12px 0 0;padding:0;list-style:none;display:grid;gap:9px;counter-reset:s}
.nudge li{display:flex;gap:11px;align-items:center;font-size:13.5px;line-height:1.4;counter-increment:s}
.nudge li::before{content:counter(s);flex:none;width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font-weight:700;font-size:12px;background:rgba(201,162,75,.16);color:#e5c878}
.nudge-act{display:flex;gap:10px;align-items:center;margin-top:16px}
.nudge-go{flex:1;border:0;border-radius:13px;padding:13px 16px;cursor:pointer;font:700 15px/1 inherit;font-family:inherit;color:#121212;background:linear-gradient(180deg,#f0d687,#c9a24b);box-shadow:0 8px 22px rgba(201,162,75,.35);display:inline-flex;align-items:center;justify-content:center;gap:8px;transition:transform .15s,filter .15s}
.nudge-go:hover{filter:brightness(1.07);transform:translateY(-1px)}
.nudge-go:active{transform:none}
.nudge-later{border:0;background:transparent;color:#a8a29b;font:500 13.5px/1 inherit;font-family:inherit;padding:10px 6px;cursor:pointer}
.nudge-later:hover{color:#edeae3}
@media (max-width:600px){
  .nudge{right:12px;left:12px;width:auto;bottom:calc(12px + env(safe-area-inset-bottom));max-width:480px;margin-inline:auto}
  .nudge-ico{width:52px;height:52px}
}
@media (prefers-reduced-motion:reduce){.nudge,.nudge.out,.nudge::before,.nudge-ico{animation:none}}
`;

const ARROW = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 4v12M7 11.5l5 5 5-5" /><path d="M5 20h14" />
  </svg>
);

function readLang() {
  try { const l = localStorage.getItem(LANG_KEY); if (TXT[l]) return l; } catch (e) { /* storage blocked */ }
  const n = ((navigator.language || 'en') + '').slice(0, 2).toUpperCase();
  return TXT[n] ? n : 'EN';
}
function suppressed() {
  try {
    if (localStorage.getItem('ufuq-pwa-installed')) return true;
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!s || !s.t) return false;
    const days = COOLDOWN_DAYS[Math.min((s.n || 1) - 1, COOLDOWN_DAYS.length - 1)];
    return Date.now() - s.t < days * 86400000;
  } catch (e) { return false; }
}
function remember() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null') || {};
    localStorage.setItem(KEY, JSON.stringify({ n: (s.n || 0) + 1, t: Date.now() }));
  } catch (e) { /* ignore */ }
}
// Don't interrupt an exam / an open dialog (closed dialogs stay in the page, so only a visible one counts).
const busy = () => Array.from(document.querySelectorAll('.xr, [role="dialog"][aria-modal="true"]'))
  .some((el) => el.getAttribute('aria-hidden') !== 'true' && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden');

export default function InstallNudge() {
  const [ready, setReady] = useState(false);
  const [, tick] = useState(0);
  const [phase, setPhase] = useState('in'); // in | out | gone
  const [steps, setSteps] = useState(false); // show the manual steps instead of the browser dialog
  const ios = isIOS();
  const android = /Android/i.test(typeof navigator !== 'undefined' ? navigator.userAgent || '' : '');

  useEffect(() => {
    const t = setTimeout(() => setReady(true), DELAY_MS);
    const off = onInstallChange(() => tick((n) => n + 1));
    const poll = setInterval(() => tick((n) => n + 1), 2000);
    return () => { clearTimeout(t); clearInterval(poll); off(); };
  }, []);

  if (phase === 'gone' || !ready || isStandalone() || suppressed()) return null;
  const canInstall = canPromptInstall();
  if (!canInstall && !ios && !android) return null; // e.g. Firefox / Safari on desktop: no install support
  if (busy()) return null;

  const L = TXT[readLang()];
  const rtl = readLang() === 'AR';
  const leave = (remembered) => {
    if (remembered) remember();
    setPhase('out');
    setTimeout(() => setPhase('gone'), 350);
  };
  const go = async () => {
    if (canInstall) { const r = await promptInstall(); leave(r !== 'accepted'); return; }
    setSteps(true);
  };
  const list = ios ? L.ios : L.and;
  const showSteps = steps || (!canInstall && (ios || android)); // no install event -> show the manual steps

  return (
    <div className={'nudge' + (phase === 'out' ? ' out' : '')} role="region" aria-label={L.title} dir={rtl ? 'rtl' : 'ltr'}>
      <style>{CSS}</style>
      <button type="button" className="nudge-x" aria-label={L.close} onClick={() => leave(true)}>×</button>
      <div className="nudge-top">
        <img className="nudge-ico" src="/favicon-96.png" alt="" width="58" height="58" />
        <div><span className="nudge-badge">{L.badge}</span><h4>{L.title}</h4></div>
      </div>
      {showSteps
        ? <ol>{list.map((s) => <li key={s}>{s}</li>)}</ol>
        : <><p>{L.sub}</p><div className="nudge-perks"><span>{L.p1}</span><span>{L.p2}</span><span>{L.p3}</span></div></>}
      <div className="nudge-act">
        {showSteps
          ? <button type="button" className="nudge-go" onClick={() => leave(true)}>{L.ok}</button>
          : <><button type="button" className="nudge-go" onClick={go}>{ARROW}{L.install}</button>
            <button type="button" className="nudge-later" onClick={() => leave(true)}>{L.later}</button></>}
      </div>
    </div>
  );
}
