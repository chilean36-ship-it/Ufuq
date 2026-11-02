import { useNavigate } from 'react-router-dom';
import { useCabinetI18n } from '../../context/CabinetI18nContext';
import { useDashboardData } from '../../context/DashboardDataContext';
import { fill, formatMoney } from '../../lib/payments';
import usePlanPrices from '../../lib/usePlanPrices';

/* Home-page payment card. Shows nothing when the student is exempt or payments are not enforced.
   - no active plan  → "payment not made" notice, short explanation, benefit cards, one button to the checkout (no prices here)
   - plan ends ≤ 7 days → compact renewal reminder */
const LOCALE = { EN: 'en', UZ: 'uz', RU: 'ru', AR: 'ar' };
const WARN_DAYS = 7;

const ICON_PROPS = { viewBox: '0 0 24 24', width: 18, height: 18, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' };
const ARROW = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>
);

/* What the student gets after paying — four short benefit cards. */
const BENEFITS = [
  {
    title: 'Live group classes',
    desc: 'Join your group lessons and the Zoom room on schedule.',
    icon: <svg {...ICON_PROPS}><rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 10l5-3v10l-5-3" /></svg>,
  },
  {
    title: 'Tasks and exams',
    desc: 'Homework, written and oral exams, with your results.',
    icon: <svg {...ICON_PROPS}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>,
  },
  {
    title: 'Progress and attendance',
    desc: 'Follow your monthly attendance and exam trend.',
    icon: <svg {...ICON_PROPS}><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></svg>,
  },
  {
    title: 'Library and group chat',
    desc: 'Audio and materials, plus chat with your classmates.',
    icon: <svg {...ICON_PROPS}><path d="M4 19.5A2.5 2.5 0 016.5 17H20V3H6.5A2.5 2.5 0 004 5.5v14z" /><path d="M4 19.5A2.5 2.5 0 006.5 22H20v-5" /></svg>,
  },
];

const CSS = `
.sc-card{ box-sizing:border-box; width:100%; background:linear-gradient(180deg,var(--bg-2),var(--bg)); border:1px solid var(--line); border-radius:16px; padding:22px 24px; margin-bottom:20px; animation:scIn .35s ease both; }
.sc-card.warn{ border-color:var(--gold); }
@keyframes scIn{ from{opacity:0; transform:translateY(6px);} to{opacity:1; transform:none;} }
.sc-row{ display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:16px 24px; }
.sc-text{ flex:1 1 300px; min-width:0; text-align:start; }
.sc-eyebrow{ margin:0 0 6px; font-size:11.5px; line-height:1.3; letter-spacing:.08em; text-transform:uppercase; color:var(--text-muted); }
.sc-title{ margin:0 0 6px; font-family:'Fraunces',serif; font-size:20px; font-weight:600; line-height:1.3; color:var(--text); overflow-wrap:anywhere; text-wrap:balance; }
.sc-sub{ margin:0; max-width:62ch; color:var(--text-muted); font-size:13.5px; line-height:1.6; overflow-wrap:anywhere; text-wrap:pretty; }
.sc-cta{ flex:none; display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:46px; background:var(--gold); color:var(--bg); border:none; border-radius:10px; padding:12px 22px; font-weight:600; font-size:14.5px; line-height:1.2; cursor:pointer; font-family:inherit; transition:background .2s, transform .15s; }
.sc-cta:hover{ background:var(--gold-bright); transform:translateY(-1px); }
.sc-cta svg{ flex:none; }
html[dir="rtl"] .sc-cta svg{ transform:scaleX(-1); }
.sc-cta:focus-visible{ outline:2px solid var(--gold-bright); outline-offset:3px; }

/* benefits block — shown only in the "payment not made" state */
.sc-divider{ height:1px; background:var(--line); margin:20px 0 16px; }
.sc-benefits-eyebrow{ margin:0 0 12px; font-size:11.5px; line-height:1.3; letter-spacing:.08em; text-transform:uppercase; color:var(--gold); font-weight:600; text-align:start; }
.sc-benefits{ list-style:none; margin:0; padding:0; display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:12px; }
.sc-benefit{ display:flex; align-items:flex-start; gap:12px; margin:0; padding:14px; min-width:0; text-align:start; border:1px solid var(--line); border-radius:12px; background:var(--bg); transition:border-color .18s ease, transform .18s ease; }
.sc-benefit:hover{ border-color:var(--gold); transform:translateY(-2px); }
.sc-b-icon{ flex:none; width:36px; height:36px; border-radius:10px; display:grid; place-items:center; color:var(--gold-bright); background:var(--gold-dim); }
.sc-b-body{ min-width:0; }
.sc-b-title{ margin:0 0 4px; font-family:inherit; font-size:14px; font-weight:600; line-height:1.35; color:var(--text); overflow-wrap:anywhere; }
.sc-b-desc{ margin:0; font-size:12.5px; line-height:1.55; color:var(--text-muted); overflow-wrap:anywhere; text-wrap:pretty; }

/* .content section{padding:0} (dashboard.css) would wipe the padding above — restate it with higher specificity */
.content .sc-card{ padding:22px 24px; }
.sc-hero{ position:relative; overflow:hidden; border-color:rgba(200,160,60,.55); background:radial-gradient(520px 200px at 0% 0%, rgba(229,200,120,.2), transparent 70%), linear-gradient(180deg,var(--bg-2),var(--bg)); box-shadow:0 20px 44px -28px rgba(200,160,60,.7); }
.sc-buy{ flex:none; display:grid; gap:8px; justify-items:end; }
.sc-price{ font-size:13px; color:var(--text-muted); display:flex; align-items:baseline; gap:6px; }
.sc-price b{ font-family:'Fraunces',serif; font-size:24px; color:var(--gold-bright); }
.sc-save{ font-size:11px; font-weight:700; padding:2px 8px; border-radius:99px; background:rgba(70,170,110,.18); color:#4cc38a; }
.sc-cta-big{ position:relative; overflow:hidden; min-height:50px; padding:13px 28px; font-size:15.5px; box-shadow:0 14px 28px -12px rgba(200,160,60,.8); }
.sc-cta-big::after{ content:''; position:absolute; inset:0; transform:translateX(-120%); background:linear-gradient(105deg, transparent 35%, rgba(255,255,255,.35) 50%, transparent 65%); animation:sbShine 3.4s ease-in-out infinite; }
@media (max-width:640px){
  .sc-buy{ justify-items:stretch; width:100%; }
  .content .sc-card{ padding:18px; }
  .sc-title{ font-size:18px; }
  .sc-cta{ width:100%; }
}
@media (prefers-reduced-motion:reduce){ .sc-card, .sc-cta, .sc-benefit, .sc-cta-big::after{ animation:none; transition:none; } .sc-cta:hover, .sc-benefit:hover{ transform:none; } }
`;

function daysLeft(iso) {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
}

export default function SubscriptionCard() {
  const { t, lang } = useCabinetI18n();
  const { access } = useDashboardData();
  const navigate = useNavigate();
  const locale = LOCALE[lang] || 'en';
  const { plans, savePct } = usePlanPrices(locale);
  const yearly = plans.find((p) => p.months === 12);
  const monthly = plans.find((p) => p.months === 1);
  const perMonth = yearly ? yearly.usd_cents / yearly.months : monthly ? monthly.usd_cents : null;

  const needsPlan = !!access && !access.exempt && access.enforced && !access.active;
  const endingSoon = !!access && !access.exempt && access.active && !!access.ends_at && daysLeft(access.ends_at) <= WARN_DAYS;
  const show = needsPlan || endingSoon;

  if (!show) return null;

  if (endingSoon) {
    const left = daysLeft(access.ends_at);
    const date = new Date(access.ends_at).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
    return (
      <section className="sc-card warn" aria-live="polite">
        <style>{CSS}</style>
        <div className="sc-row">
          <div className="sc-text">
            <p className="sc-eyebrow">{t('Active until')}</p>
            <h2 className="sc-title">{date}</h2>
            <p className="sc-sub">{fill(t('{n} days left'), { n: left })} · {t('Nothing renews automatically.')}</p>
          </div>
          <button type="button" className="sc-cta" onClick={() => navigate('/checkout')}>{t('Renew')}{ARROW}</button>
        </div>
      </section>
    );
  }

  return (
    <section className="sc-card sc-hero" aria-labelledby="sc-title">
      <style>{CSS}</style>
      <div className="sc-row">
        <div className="sc-text">
          <p className="sc-eyebrow">{t('Access')}</p>
          <h2 className="sc-title" id="sc-title">{t('Payment not made')}</h2>
          <p className="sc-sub">{t('Your plan is not active. Lessons, tasks, exams and the library are locked until you renew.')}</p>
        </div>
        <div className="sc-buy">
          {perMonth !== null && <div className="sc-price">{t('from')} <b>{formatMoney(perMonth / 100, 'USD', 'en')}</b> / {t('month')}{savePct > 0 && <span className="sc-save">−{savePct}%</span>}</div>}
          <button type="button" className="sc-cta sc-cta-big" onClick={() => navigate('/checkout')}>{t('Upgrade plan')}{ARROW}</button>
        </div>
      </div>

      <div className="sc-divider" aria-hidden="true" />
      <p className="sc-benefits-eyebrow">{t('What you get after payment')}</p>
      <ul className="sc-benefits" role="list">
        {BENEFITS.map((b) => (
          <li key={b.title} className="sc-benefit">
            <span className="sc-b-icon">{b.icon}</span>
            <div className="sc-b-body">
              <h3 className="sc-b-title">{t(b.title)}</h3>
              <p className="sc-b-desc">{t(b.desc)}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
