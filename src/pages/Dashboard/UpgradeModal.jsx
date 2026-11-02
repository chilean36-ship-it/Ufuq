import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCabinetI18n } from '../../context/CabinetI18nContext';
import { useDashboardData } from '../../context/DashboardDataContext';
import usePlanPrices from '../../lib/usePlanPrices';
import { formatMoney, fill } from '../../lib/payments';

/* "Upgrade plan" window (opened from the topbar button and from Billing): the plan you have now next to the paid plan,
   with a monthly / yearly switch. Prices come from the server; the checkout opens with the chosen plan. */
const CSS = `
.um-back{ position:fixed; inset:0; z-index:400; display:grid; place-items:center; padding:16px; overflow:auto; background:rgba(8,8,10,.72); backdrop-filter:blur(6px); animation:umFade .2s ease both; }
.um{ position:relative; width:min(900px,100%); margin:auto; padding:30px clamp(16px,3vw,34px) 24px; border-radius:24px; border:1px solid var(--line); background:var(--bg); box-shadow:0 40px 90px -30px rgba(0,0,0,.9); animation:umRise .3s cubic-bezier(.2,.8,.2,1) both; }
.um-x{ position:absolute; top:14px; inset-inline-end:14px; width:36px; height:36px; border-radius:50%; border:1px solid var(--line); background:var(--bg-2); color:var(--text); font-size:20px; line-height:1; cursor:pointer; }
.um-x:hover{ border-color:var(--gold); }
.um h2{ margin:0 0 20px; text-align:center; font-family:'Fraunces',serif; font-size:clamp(22px,3.4vw,30px); color:var(--text); }
.um-grid{ display:grid; grid-template-columns:1fr 1.08fr; gap:16px; align-items:stretch; }
.um-card{ display:flex; flex-direction:column; gap:14px; padding:24px 22px; border-radius:20px; border:1px solid var(--line); background:var(--bg-2); }
.um-card.pro{ position:relative; border-color:rgba(200,160,60,.65); background:radial-gradient(420px 220px at 100% 0%, rgba(229,200,120,.16), transparent 70%), var(--bg-2); box-shadow:0 24px 50px -30px rgba(200,160,60,.8); }
.um-name{ display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:15px; font-weight:700; color:var(--text); }
.um-tag{ font-size:10.5px; font-weight:800; letter-spacing:.07em; text-transform:uppercase; padding:4px 10px; border-radius:99px; background:linear-gradient(180deg,var(--gold-bright),var(--gold)); color:var(--bg); }
.um-price{ display:flex; align-items:baseline; gap:8px; font-family:'Fraunces',serif; font-size:40px; line-height:1; color:var(--text); }
.um-card.pro .um-price{ color:var(--gold-bright); }
.um-price small{ font:500 13.5px 'Inter',sans-serif; color:var(--text-muted); }
.um-note{ min-height:19px; font-size:12.5px; color:var(--text-muted); }
.um-note s{ opacity:.65; }
.um-seg{ display:inline-grid; grid-template-columns:1fr 1fr; padding:3px; border-radius:12px; background:var(--bg-3); border:1px solid var(--line); }
.um-seg button{ border:0; background:none; color:var(--text-muted); font:600 13px 'Inter',sans-serif; padding:8px 10px; border-radius:9px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; transition:background .2s,color .2s; }
.um-seg button.on{ background:var(--gold); color:var(--bg); }
.um-seg em{ font-style:normal; font-size:10.5px; font-weight:800; padding:1px 6px; border-radius:99px; background:rgba(70,170,110,.22); color:#4cc38a; }
.um-seg button.on em{ background:rgba(0,0,0,.2); color:var(--bg); }
.um-btn{ display:flex; align-items:center; justify-content:center; gap:8px; width:100%; min-height:48px; border-radius:13px; font:700 15px 'Inter',sans-serif; cursor:pointer; border:1px solid var(--line); background:var(--bg-3); color:var(--text-muted); }
.um-btn[disabled]{ cursor:default; }
.um-btn.go{ border:none; color:var(--bg); background:linear-gradient(180deg,var(--gold-bright),var(--gold)); box-shadow:0 14px 28px -14px rgba(200,160,60,.9); transition:transform .15s, filter .2s; }
.um-btn.go:hover{ filter:brightness(1.07); transform:translateY(-1px); }
.um-btn.go:active{ transform:scale(.985); }
.um-btn:focus-visible{ outline:2px solid var(--gold-bright); outline-offset:3px; }
.um-list{ list-style:none; margin:2px 0 0; padding:0; display:grid; gap:11px; }
.um-list li{ display:flex; align-items:flex-start; gap:11px; font-size:14px; line-height:1.4; color:var(--text); }
.um-list li svg{ flex:none; width:18px; height:18px; margin-top:1px; color:var(--text-muted); }
.um-card.pro .um-list li svg{ color:var(--gold-bright); }
.um-list li.off{ color:var(--text-muted); }
.um-foot{ margin-top:16px; text-align:center; font-size:12.5px; color:var(--text-muted); }
@keyframes umFade{ from{ opacity:0; } to{ opacity:1; } }
@keyframes umRise{ from{ opacity:0; transform:translateY(14px) scale(.98); } to{ opacity:1; transform:none; } }
@media (max-width:720px){ .um-grid{ grid-template-columns:1fr; } .um{ padding-top:56px; } }
@media (prefers-reduced-motion:reduce){ .um-back, .um{ animation:none; } }
`;

const TICK = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
const LOCK = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>;

const FREE_ITEMS = [['Your cabinet and profile', true], ['Billing and order history', true], ['Live classes, tasks and exams', false], ['Library and group chat', false]];
const PRO_ITEMS = ['Live group classes with Ustaz Ali', 'Homework, midterm and final exams', 'Progress, attendance and certificates', 'Library, group chat and Ufuq AI'];

export default function UpgradeModal({ open, onClose }) {
  const { t, lang } = useCabinetI18n();
  const { access } = useDashboardData();
  const navigate = useNavigate();
  const { plans, savePct, loading } = usePlanPrices(lang === 'UZ' ? 'uz' : lang === 'RU' ? 'ru' : lang === 'AR' ? 'ar' : 'en');
  const [period, setPeriod] = useState('year');

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;

  const monthly = plans.find((p) => p.months === 1);
  const yearly = plans.find((p) => p.months === 12);
  const plan = (period === 'year' ? yearly : monthly) || yearly || monthly;
  const isYear = !!plan && plan.months === 12;
  const usd = (c) => formatMoney(Number(c) / 100, 'USD', 'en');
  const active = !!(access && access.active);
  const endDate = active && access.ends_at ? new Date(access.ends_at).toLocaleDateString(lang === 'UZ' ? 'uz' : lang === 'RU' ? 'ru' : lang === 'AR' ? 'ar' : 'en', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

  return (
    <div className="um-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <style>{CSS}</style>
      <div className="um" role="dialog" aria-modal="true" aria-label={t('Upgrade your plan')}>
        <button type="button" className="um-x" aria-label={t('Close')} onClick={onClose}>×</button>
        <h2>{t('Upgrade your plan')}</h2>
        <div className="um-grid">
          <div className="um-card">
            <div className="um-name">{t('Free')}</div>
            <div className="um-price">$0<small>/ {t('month')}</small></div>
            <div className="um-note">{active ? `${t('Active until')} ${endDate}` : t('Limited access')}</div>
            <button type="button" className="um-btn" disabled>{t('Your current plan')}</button>
            <ul className="um-list">
              {FREE_ITEMS.map(([k, on]) => <li key={k} className={on ? '' : 'off'}>{on ? TICK : LOCK}<span>{t(k)}</span></li>)}
            </ul>
          </div>

          <div className="um-card pro">
            <div className="um-name">{t('Ufuq Student')}<span className="um-tag">{t('Recommended')}</span></div>
            {monthly && yearly && (
              <div className="um-seg" role="tablist" aria-label={t('Billing period')}>
                <button type="button" role="tab" aria-selected={period === 'month'} className={period === 'month' ? 'on' : ''} onClick={() => setPeriod('month')}>{t('Monthly')}</button>
                <button type="button" role="tab" aria-selected={period === 'year'} className={period === 'year' ? 'on' : ''} onClick={() => setPeriod('year')}>{t('Yearly')}{savePct > 0 && <em>−{savePct}%</em>}</button>
              </div>
            )}
            <div className="um-price">{loading || !plan ? '…' : usd(isYear ? plan.usd_cents / plan.months : plan.usd_cents)}<small>/ {t('month')}</small></div>
            <div className="um-note">
              {plan && (isYear
                ? <>{usd(plan.usd_cents)} {t('billed once a year')}{savePct > 0 && monthly ? <> · <s>{usd(monthly.usd_cents * 12)}</s> · {fill(t('Save {n}%'), { n: savePct })}</> : null}</>
                : t('Billed monthly'))}
            </div>
            <button type="button" className="um-btn go" disabled={!plan} onClick={() => { onClose(); navigate(`/checkout?plan=${plan.id}`); }}>
              {active ? t('Renew') : t('Get started')} <span aria-hidden="true">→</span>
            </button>
            <ul className="um-list">
              {PRO_ITEMS.map((k) => <li key={k}>{TICK}<span>{t(k)}</span></li>)}
            </ul>
          </div>
        </div>
        <div className="um-foot">{t('Secure payment · Card or bank transfer · No automatic renewals')}</div>
      </div>
    </div>
  );
}
