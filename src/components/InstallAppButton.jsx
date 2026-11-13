import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { LANG_KEY } from '../i18n';
import { canPromptInstall, isIos, isStandalone, promptInstall, subscribeInstall } from '../lib/pwaInstall';

/* "Install the Ufuq app" button for the website (landing, cabinet). Self-contained: own texts, own dialog. */
const TXT = {
  UZ: { btn: 'Ilovani o‘rnatish', title: 'Ufuq ilovasi', sub: 'Telefoningizning bosh ekraniga qo‘shing — ilova alohida ochiladi va har safar avtomatik kiradi.', open: 'Ilovani ochish', close: 'Yopish',
    ios1: 'Safari pastidagi “Ulashish” tugmasini bosing', ios2: '“Bosh ekranga qo‘shish” ni tanlang', ios3: '“Qo‘shish” ni bosing — tayyor',
    and1: 'Brauzer menyusini (⋮) oching', and2: '“Ilovani o‘rnatish” yoki “Bosh ekranga qo‘shish” ni tanlang', and3: 'Tasdiqlang — Ufuq ilovasi paydo bo‘ladi' },
  RU: { btn: 'Установить приложение', title: 'Приложение Ufuq', sub: 'Добавьте на главный экран — приложение откроется отдельно и будет входить автоматически.', open: 'Открыть приложение', close: 'Закрыть',
    ios1: 'Нажмите «Поделиться» внизу Safari', ios2: 'Выберите «На экран “Домой”»', ios3: 'Нажмите «Добавить» — готово',
    and1: 'Откройте меню браузера (⋮)', and2: 'Выберите «Установить приложение» или «Добавить на главный экран»', and3: 'Подтвердите — значок Ufuq появится на экране' },
  AR: { btn: 'تثبيت التطبيق', title: 'تطبيق Ufuq', sub: 'أضفه إلى الشاشة الرئيسية — يعمل كتطبيق مستقل ويدخل تلقائيًا.', open: 'فتح التطبيق', close: 'إغلاق',
    ios1: 'اضغط زر «مشاركة» أسفل Safari', ios2: 'اختر «إضافة إلى الشاشة الرئيسية»', ios3: 'اضغط «إضافة» — تم',
    and1: 'افتح قائمة المتصفح (⋮)', and2: 'اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية»', and3: 'أكّد وسيظهر رمز Ufuq' },
  EN: { btn: 'Install the app', title: 'The Ufuq app', sub: 'Add it to your home screen — it opens on its own and keeps you signed in.', open: 'Open the app', close: 'Close',
    ios1: 'Tap the Share button at the bottom of Safari', ios2: 'Choose “Add to Home Screen”', ios3: 'Tap “Add” — done',
    and1: 'Open the browser menu (⋮)', and2: 'Choose “Install app” or “Add to Home screen”', and3: 'Confirm — the Ufuq icon appears on your screen' },
};
const lang = () => { try { const l = localStorage.getItem(LANG_KEY); return TXT[l] ? l : 'EN'; } catch (e) { return 'EN'; } };

const PHONE = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="6" y="2.5" width="12" height="19" rx="2.5" /><path d="M11 18.5h2" /><path d="M12 7v6M9.5 10.5L12 13l2.5-2.5" />
  </svg>
);

const CSS = `
.iab-ov{position:fixed;inset:0;z-index:100002;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.6);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);padding:0}
.iab-sheet{width:100%;max-width:460px;background:var(--bg-2,#1A1A1A);color:var(--text,#EDEAE3);border:1px solid var(--line,rgba(237,234,227,.12));border-radius:20px 20px 0 0;padding:22px 22px calc(22px + env(safe-area-inset-bottom));box-shadow:0 -20px 60px rgba(0,0,0,.5);font-family:'Inter',system-ui,sans-serif}
@media (min-width:600px){.iab-ov{align-items:center}.iab-sheet{border-radius:20px;padding-bottom:22px}}
.iab-sheet h3{margin:0 0 6px;font:600 20px 'Fraunces',serif}
.iab-sheet p{margin:0 0 14px;font-size:14px;line-height:1.55;color:var(--text-muted,#A8A29B)}
.iab-sheet ol{margin:0 0 18px;padding:0;list-style:none;display:grid;gap:10px;counter-reset:s}
.iab-sheet li{display:flex;gap:12px;align-items:center;font-size:14.5px;line-height:1.4;counter-increment:s}
.iab-sheet li::before{content:counter(s);flex:none;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-weight:700;font-size:13px;background:var(--gold-dim,rgba(201,162,75,.14));color:var(--gold-bright,#E5C878)}
.iab-row{display:flex;gap:10px}
.iab-b{flex:1;padding:13px 14px;border-radius:12px;border:1px solid var(--line,rgba(237,234,227,.14));background:transparent;color:inherit;font:600 14.5px inherit;font-family:inherit;cursor:pointer;text-align:center;text-decoration:none}
.iab-b.p{background:linear-gradient(180deg,var(--gold-bright,#E5C878),var(--gold,#C9A24B));color:#121212;border-color:transparent}
.iab-btn{display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-family:inherit}
@media (max-width:980px){.nav-install{display:none !important}}
.foot-install{margin-top:14px}
`;

/**
 * variant: 'nav' (compact, landing header) | 'hero' (outlined, next to the main buttons) | 'link' (plain text, footer) | 'side' (cabinet sidebar row).
 * Hidden when the page already runs as the installed app.
 */
export default function InstallAppButton({ variant = 'hero', className = '' }) {
  const [, force] = useState(0);
  const [open, setOpen] = useState(false);
  useEffect(() => subscribeInstall(() => force((n) => n + 1)), []);
  if (isStandalone()) return null;
  const L = TXT[lang()];

  async function click(e) {
    e.preventDefault();
    if (canPromptInstall()) { await promptInstall(); return; }
    setOpen(true);
  }
  const steps = isIos() ? [L.ios1, L.ios2, L.ios3] : [L.and1, L.and2, L.and3];

  const style = variant === 'nav'
    ? { padding: '8px 14px', borderRadius: 999, border: '1px solid var(--gold,#C9A24B)', color: 'var(--gold-bright,#E5C878)', background: 'transparent', fontSize: 13.5, fontWeight: 600 }
    : variant === 'hero'
      ? { padding: '14px 22px', borderRadius: 999, border: '1px solid var(--gold,#C9A24B)', color: 'var(--gold-bright,#E5C878)', background: 'transparent', fontSize: 15, fontWeight: 600 }
      : variant === 'side'
        ? { padding: '10px 12px', border: 0, background: 'transparent', color: 'inherit', fontSize: 14, width: '100%' }
        : { padding: 0, border: 0, background: 'transparent', color: 'inherit', fontSize: 'inherit' };

  return (
    <>
      <style>{CSS}</style>
      <button type="button" className={'iab-btn ' + className} style={style} onClick={click} data-install-app>
        {variant !== 'link' && PHONE}<span>{L.btn}</span>
      </button>
      {open && createPortal(
        <div className="iab-ov" role="dialog" aria-modal="true" aria-label={L.title} onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="iab-sheet">
            <h3>{L.title}</h3>
            <p>{L.sub}</p>
            <ol>{steps.map((s) => <li key={s}>{s}</li>)}</ol>
            <div className="iab-row">
              <button type="button" className="iab-b" onClick={() => setOpen(false)}>{L.close}</button>
              <a className="iab-b p" href="/app">{L.open}</a>
            </div>
          </div>
        </div>, document.body)}
    </>
  );
}
