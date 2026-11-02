import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCabinetI18n } from '../../context/CabinetI18nContext';
import { formatMoney, fill } from '../../lib/payments';

/* Marketing-style pricing block for the Billing page: period toggle, one featured plan card, what's included,
   trust row and FAQ. Prices come from the server (usePlanPrices); the browser never sets an amount. */
const INCLUDED = [
  ['Live group classes', 'Weekly lessons with Ustaz Ali in a small group.'],
  ['Tasks and exams', 'Homework with feedback, midterm and final exams.'],
  ['Progress and attendance', 'See your results and attendance at a glance.'],
  ['Library and group chat', 'Books, audio and a chat with your classmates.'],
  ['Certificates', 'Earn a place certificate for your level results.'],
  ['Ufuq AI assistant', 'Practice and ask questions any time.'],
];
const FAQ = [
  ['Can I cancel any time?', 'Yes. Plans are not renewed automatically — you pay again only when you decide to.'],
  ['Which payment methods can I use?', 'Bank card and bank transfer. Transfers are checked by our team after you send the receipt.'],
  ['What happens when my plan ends?', 'Your progress and results are kept. You can renew whenever you are ready and continue.'],
  ['Is the yearly plan really cheaper?', 'Yes — the yearly price is lower than paying month by month, shown below the price.'],
];

export const PRICING_CSS = `
.pr{ display:grid; gap:26px; }
.pr-head{ text-align:center; display:grid; gap:10px; justify-items:center; padding-top:8px; }
.pr-kicker{ font-size:11.5px; letter-spacing:.14em; text-transform:uppercase; color:var(--gold-bright); font-weight:700; }
.pr-title{ font-family:'Fraunces',serif; font-size:clamp(26px,4vw,38px); line-height:1.15; margin:0; color:var(--text); }
.pr-sub{ max-width:520px; margin:0; color:var(--text-muted); font-size:14.5px; line-height:1.6; }
.pr-toggle{ position:relative; display:inline-grid; grid-template-columns:1fr 1fr; padding:4px; border-radius:99px; background:var(--bg-3); border:1px solid var(--line); margin-top:6px; }
.pr-toggle button{ position:relative; z-index:1; border:none; background:none; color:var(--text-muted); font:600 13.5px 'Inter',sans-serif; padding:9px 22px; border-radius:99px; cursor:pointer; display:flex; align-items:center; gap:8px; justify-content:center; white-space:nowrap; transition:color .2s; }
.pr-toggle button.on{ color:var(--bg); }
.pr-toggle .pr-knob{ position:absolute; top:4px; bottom:4px; width:calc(50% - 4px); inset-inline-start:4px; border-radius:99px; background:linear-gradient(180deg,var(--gold-bright),var(--gold)); box-shadow:0 6px 16px -6px rgba(200,160,60,.6); transition:transform .3s cubic-bezier(.2,.8,.2,1); }
.pr-toggle.year .pr-knob{ transform:translateX(100%); }
html[dir="rtl"] .pr-toggle.year .pr-knob{ transform:translateX(-100%); }
.pr-save{ font-size:10.5px; padding:2px 7px; border-radius:99px; background:rgba(70,170,110,.2); color:#4cc38a; }
.pr-toggle button.on .pr-save{ background:rgba(0,0,0,.18); color:var(--bg); }
.pr-card{ position:relative; max-width:880px; width:100%; margin:0 auto; display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1.1fr); gap:0; border-radius:22px; border:1px solid rgba(200,160,60,.5); background:radial-gradient(600px 260px at 0% 0%, rgba(200,160,60,.14), transparent 70%), var(--bg-2); box-shadow:0 30px 60px -34px rgba(200,160,60,.5); overflow:hidden; animation:blIn .5s cubic-bezier(.2,.8,.2,1) both; }
.pr-buy{ padding:30px 30px 28px; display:flex; flex-direction:column; gap:12px; border-inline-end:1px solid var(--line); }
.pr-badge{ align-self:flex-start; font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; padding:4px 10px; border-radius:99px; background:linear-gradient(180deg,var(--gold-bright),var(--gold)); color:var(--bg); }
.pr-plan{ font-family:'Fraunces',serif; font-size:20px; color:var(--text); }
.pr-price{ font-family:'Fraunces',serif; font-size:clamp(42px,6vw,56px); line-height:1; color:var(--gold-bright); display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; }
.pr-price small{ font:500 14px 'Inter',sans-serif; color:var(--text-muted); }
.pr-note{ color:var(--text-muted); font-size:13px; min-height:20px; }
.pr-note s{ opacity:.7; }
.pr-cta{ margin-top:auto; display:flex; align-items:center; justify-content:center; gap:8px; border:none; cursor:pointer; background:linear-gradient(180deg,var(--gold-bright),var(--gold)); color:var(--bg); font:700 15px 'Inter',sans-serif; padding:14px 18px; border-radius:12px; box-shadow:0 14px 28px -14px rgba(200,160,60,.7); transition:transform .15s, box-shadow .2s, filter .2s; }
.pr-cta:hover{ filter:brightness(1.06); transform:translateY(-1px); }
.pr-cta:active{ transform:scale(.985); }
.pr-cta:focus-visible{ outline:2px solid var(--gold-bright); outline-offset:3px; }
.pr-fine{ font-size:11.5px; color:var(--text-muted); text-align:center; }
.pr-incl{ padding:30px; display:grid; gap:14px; align-content:start; }
.pr-incl h4{ margin:0; font-size:12px; letter-spacing:.1em; text-transform:uppercase; color:var(--text-muted); }
.pr-feat{ display:flex; gap:12px; align-items:flex-start; }
.pr-feat .bl-tick{ margin-top:2px; }
.pr-feat b{ display:block; font-size:14px; color:var(--text); font-weight:600; }
.pr-feat span.d{ display:block; font-size:12.5px; color:var(--text-muted); line-height:1.5; }
.pr-trust{ display:flex; flex-wrap:wrap; justify-content:center; gap:10px 26px; color:var(--text-muted); font-size:13px; }
.pr-trust span{ display:inline-flex; align-items:center; gap:8px; }
.pr-trust svg{ width:16px; height:16px; color:var(--gold-bright); }
.pr-faq{ max-width:720px; width:100%; margin:0 auto; display:grid; gap:8px; }
.pr-faq h3{ text-align:center; font-family:'Fraunces',serif; font-size:20px; margin:0 0 6px; }
.pr-q{ border:1px solid var(--line); border-radius:12px; background:var(--bg-2); overflow:hidden; transition:border-color .2s; }
.pr-q:hover{ border-color:rgba(200,160,60,.4); }
.pr-q button{ width:100%; display:flex; justify-content:space-between; align-items:center; gap:12px; text-align:start; background:none; border:none; color:var(--text); font:600 14px 'Inter',sans-serif; padding:14px 16px; cursor:pointer; }
.pr-q .chev{ flex:none; width:18px; height:18px; transition:transform .25s; color:var(--text-muted); }
.pr-q.open .chev{ transform:rotate(180deg); }
.pr-a{ display:grid; grid-template-rows:0fr; transition:grid-template-rows .3s ease; }
.pr-q.open .pr-a{ grid-template-rows:1fr; }
.pr-a > div{ overflow:hidden; }
.pr-a p{ margin:0; padding:0 16px 14px; color:var(--text-muted); font-size:13.5px; line-height:1.6; }
@media (max-width:760px){
  .pr-card{ grid-template-columns:1fr; }
  .pr-buy{ border-inline-end:none; border-bottom:1px solid var(--line); padding:24px 20px; }
  .pr-incl{ padding:22px 20px; }
}
@media (prefers-reduced-motion:reduce){ .pr-card{ animation:none; } .pr-toggle .pr-knob, .pr-a, .pr-q .chev{ transition:none; } }
`;

export default function PricingSection({ plans, loading, savePct, active }) {
  const { t } = useCabinetI18n();
  const navigate = useNavigate();
  const [period, setPeriod] = useState('year');
  const [openQ, setOpenQ] = useState(0);

  const monthly = plans.find((p) => p.months === 1);
  const yearly = plans.find((p) => p.months === 12);
  const plan = (period === 'year' ? yearly : monthly) || yearly || monthly;
  const usd = (cents) => formatMoney(Number(cents) / 100, 'USD', 'en');
  const isYear = plan && plan.months === 12;

  return (
    <section className="pr" aria-label={t('Plans and pricing')}>
      <style>{PRICING_CSS}</style>
      <div className="pr-head">
        <span className="pr-kicker">{t('Plans and pricing')}</span>
        <h2 className="pr-title">{t('One plan. Everything you need to learn Arabic.')}</h2>
        <p className="pr-sub">{t('Simple, transparent pricing in US dollars. Pay monthly or save with the yearly plan.')}</p>
        {monthly && yearly && (
          <div className={'pr-toggle ' + period} role="tablist" aria-label={t('Billing period')}>
            <span className="pr-knob" aria-hidden="true" />
            <button type="button" role="tab" aria-selected={period === 'month'} className={period === 'month' ? 'on' : ''} onClick={() => setPeriod('month')}>{t('Monthly')}</button>
            <button type="button" role="tab" aria-selected={period === 'year'} className={period === 'year' ? 'on' : ''} onClick={() => setPeriod('year')}>
              {t('Yearly')}{savePct > 0 && <span className="pr-save">−{savePct}%</span>}
            </button>
          </div>
        )}
      </div>

      {loading && <div className="bl-muted" style={{ textAlign: 'center' }}>…</div>}
      {!loading && plan && (
        <div className="pr-card" key={plan.id}>
          <div className="pr-buy">
            {isYear ? <span className="pr-badge">{t('Best value')}</span> : <span className="pr-badge" style={{ background: 'var(--bg-3)', color: 'var(--text-muted)' }}>{t('Flexible')}</span>}
            <div className="pr-plan">{t('Ufuq Student')} · {t(isYear ? 'Yearly' : 'Monthly')}</div>
            <div className="pr-price">{usd(isYear ? plan.usd_cents / plan.months : plan.usd_cents)}<small>{t('per month')}</small></div>
            <div className="pr-note">
              {isYear
                ? <>{usd(plan.usd_cents)} {t('billed once a year')}{savePct > 0 && monthly ? <> · <s>{usd(monthly.usd_cents * 12)}</s> · {fill(t('Save {n}%'), { n: savePct })}</> : null}</>
                : t('Billed monthly. Switch to yearly and pay less.')}
            </div>
            <button type="button" className="pr-cta" onClick={() => navigate(`/checkout?plan=${plan.id}`)}>
              {active ? t('Renew') : t('Get started')} <span aria-hidden="true">→</span>
            </button>
            <div className="pr-fine">{t('No automatic renewals. Cancel any time.')}</div>
          </div>
          <div className="pr-incl">
            <h4>{t("What's included")}</h4>
            {INCLUDED.map(([title, desc]) => (
              <div className="pr-feat" key={title}>
                <span className="bl-tick" aria-hidden="true">✓</span>
                <div><b>{t(title)}</b><span className="d">{t(desc)}</span></div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="pr-trust">
        <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></svg>{t('Secure payments')}</span>
        <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>{t('Card or bank transfer')}</span>
        <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8v4l3 2" /><circle cx="12" cy="12" r="9" /></svg>{t('Access starts right after payment')}</span>
      </div>

      <div className="pr-faq">
        <h3>{t('Questions, answered')}</h3>
        {FAQ.map(([q, a], i) => (
          <div key={q} className={'pr-q' + (openQ === i ? ' open' : '')}>
            <button type="button" aria-expanded={openQ === i} onClick={() => setOpenQ(openQ === i ? -1 : i)}>
              {t(q)}
              <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            <div className="pr-a"><div><p>{t(a)}</p></div></div>
          </div>
        ))}
      </div>
    </section>
  );
}
