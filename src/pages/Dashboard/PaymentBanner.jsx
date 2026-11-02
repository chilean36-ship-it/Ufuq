import { useState } from 'react';
import { useCabinetI18n } from '../../context/CabinetI18nContext';
import { useDashboardData } from '../../context/DashboardDataContext';
import { fill } from '../../lib/payments';

/* One slim notice above the page, driven by my_access().state (the same rule the server uses to open or close access):
     expiring  – a running plan ends within 7 days        pre_due – the pay-by date is coming (never paid)
     grace     – the plan / pay-by date passed, a few days of grace remain       extended – the admin gave extra time
   "grace" cannot be dismissed; the softer notices can (until the next browser session). */
const LOCALE = { EN: 'en', UZ: 'uz', RU: 'ru', AR: 'ar' };
const CSS = `
.pb{ display:flex; align-items:center; gap:12px 16px; flex-wrap:wrap; margin:0 0 18px; padding:12px 16px; border-radius:14px; border:1px solid rgba(200,160,60,.45); background:linear-gradient(90deg, rgba(200,160,60,.14), rgba(200,160,60,.04)); color:var(--text); animation:pbIn .3s ease both; }
.pb.danger{ border-color:rgba(229,100,90,.55); background:linear-gradient(90deg, rgba(229,100,90,.16), rgba(229,100,90,.04)); }
.pb.info{ border-color:var(--line); background:var(--bg-2); }
.pb-ico{ flex:none; width:30px; height:30px; border-radius:50%; display:grid; place-items:center; font-weight:800; color:var(--bg); background:var(--gold); }
.pb.danger .pb-ico{ background:#e5645a; color:#fff; }
.pb.info .pb-ico{ background:var(--bg-3); color:var(--gold-bright); }
.pb-txt{ flex:1 1 260px; min-width:0; font-size:13.5px; line-height:1.5; }
.pb-txt b{ display:block; font-size:14px; }
.pb-txt span{ color:var(--text-muted); }
.pb-btn{ flex:none; border:none; border-radius:10px; padding:9px 18px; font:700 13.5px 'Inter',sans-serif; cursor:pointer; color:var(--bg); background:linear-gradient(180deg,var(--gold-bright),var(--gold)); }
.pb.danger .pb-btn{ background:#e5645a; color:#fff; }
.pb-x{ flex:none; width:28px; height:28px; border-radius:50%; border:none; background:transparent; color:var(--text-muted); font-size:18px; cursor:pointer; }
@keyframes pbIn{ from{ opacity:0; transform:translateY(-4px); } to{ opacity:1; transform:none; } }
@media (prefers-reduced-motion:reduce){ .pb{ animation:none; } }
`;

const days = (iso) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));

export default function PaymentBanner({ onUpgrade }) {
  const { t, lang } = useCabinetI18n();
  const { access, locked } = useDashboardData();
  const [gone, setGone] = useState(() => { try { return sessionStorage.getItem('ufuq-pb') || ''; } catch (e) { return ''; } });
  if (!access || access.exempt || !access.enforced || locked) return null;
  const fmt = (v) => new Date(v).toLocaleDateString(LOCALE[lang] || 'en', { day: 'numeric', month: 'long', year: 'numeric' });

  let kind = '', title = '', sub = '', cta = t('Upgrade plan'), key = '';
  if (access.state === 'expiring') {
    kind = ''; key = 'e' + access.ends_at; cta = t('Renew plan');
    title = fill(t('Your plan ends in {n} days'), { n: days(access.ends_at) }); sub = `${t('Active until')} ${fmt(access.ends_at)}`;
  } else if (access.state === 'pre_due') {
    kind = ''; key = 'p' + access.due_at;
    title = fill(t('Payment is required in {n} days'), { n: days(access.due_at) }); sub = `${t('Choose a plan before')} ${fmt(access.due_at)} ${t('to keep your access.')}`;
  } else if (access.state === 'grace') {
    kind = 'danger'; key = '';
    title = fill(t('Payment overdue — {n} days left'), { n: days(access.grace_ends_at) }); sub = `${t('Your access closes on')} ${fmt(access.grace_ends_at)} ${t('unless you pay.')}`;
  } else if (access.state === 'extended') {
    kind = 'info'; key = 'x' + access.extension_until; cta = t('Choose a plan');
    title = t('You have extra time to pay'); sub = `${t('Your access stays open until')} ${fmt(access.extension_until)}.`;
  } else return null;
  if (key && gone === key) return null;

  return (
    <div className={'pb ' + kind} role={kind === 'danger' ? 'alert' : 'status'}>
      <style>{CSS}</style>
      <span className="pb-ico" aria-hidden="true">{kind === 'info' ? 'i' : '!'}</span>
      <div className="pb-txt"><b>{title}</b><span>{sub}</span></div>
      <button type="button" className="pb-btn" onClick={onUpgrade}>{cta}</button>
      {key && <button type="button" className="pb-x" aria-label={t('Close')} onClick={() => { try { sessionStorage.setItem('ufuq-pb', key); } catch (e) { /* ignore */ } setGone(key); }}>×</button>}
    </div>
  );
}
