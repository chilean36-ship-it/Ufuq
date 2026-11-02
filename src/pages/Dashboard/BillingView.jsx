import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCabinetI18n } from '../../context/CabinetI18nContext';
import { useDashboardData } from '../../context/DashboardDataContext';
import useLiveRefresh from '../../lib/liveRefresh';
import OrderSteps from './OrderSteps';
import { fetchMyOrders, fetchOrder, cancelOrder, startCardPayment, uploadTransferProof, submitTransferProof, formatMoney } from '../../lib/payments';

const LOCALE = { EN: 'en', UZ: 'uz', RU: 'ru', AR: 'ar' };
const MAX_BYTES = 5 * 1024 * 1024;
const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const STATUS = {
  pending: 'Waiting for payment', awaiting_review: 'Waiting for review', paid: 'Paid', failed: 'Failed',
  cancelled: 'Cancelled', rejected: 'Rejected', refunded: 'Refunded',
};

export const BILLING_CSS = `
.bl-grid{display:grid; gap:18px;}
.bl-card{background:var(--bg-2); border:1px solid var(--line); border-radius:10px; padding:22px 24px;}
.bl-card h3{margin:0 0 10px; font-family:'Fraunces',serif; font-size:17px;}
.bl-big{font-family:'Fraunces',serif; font-size:24px; color:var(--gold-bright); margin:4px 0;}
.bl-muted{color:var(--text-muted); font-size:13px; line-height:1.55;}
.bl-warn{border-color:var(--gold);}
.bl-btn{display:inline-block; margin-top:14px; background:var(--gold); color:var(--bg); border:none; border-radius:8px; padding:11px 22px; font-weight:600; font-size:14px; cursor:pointer; font-family:inherit;}
.bl-btn:hover{background:var(--gold-bright);} .bl-btn[disabled]{opacity:.6; cursor:default;}
.bl-link{background:none; border:none; color:var(--gold-bright); text-decoration:underline; cursor:pointer; font-size:13px; padding:0; font-family:inherit;}
.bl-badge{display:inline-block; padding:2px 10px; border-radius:99px; font-size:11.5px; font-weight:600; background:var(--bg-3); color:var(--text-muted);}
.bl-badge.paid{background:rgba(70,170,110,.16); color:#4cc38a;}
.bl-badge.bad{background:rgba(220,80,80,.14); color:var(--danger);}
.bl-badge.wait{background:rgba(200,160,60,.16); color:var(--gold-bright);}
.bl-actions{display:flex; gap:14px; flex-wrap:wrap; align-items:center;}
.bl-upload{margin-top:8px; display:flex; gap:8px; flex-wrap:wrap; align-items:center;}
.bl-upload input[type=file]{font-size:12px; max-width:230px; color:var(--text-muted);}
.bl-msg{font-size:12px; margin-top:6px;} .bl-msg.err{color:var(--danger);} .bl-msg.ok{color:#4cc38a;}
.bl-ref{font-family:ui-monospace,monospace; font-size:11.5px; color:var(--text-muted);}
.bl-input{background:var(--bg-3); border:1px solid var(--line); border-radius:8px; padding:7px 10px; font-size:12.5px; color:inherit; font-family:inherit; width:150px;}
.bl-msg.info{color:var(--text-muted);}
.bl-reason{color:var(--danger); font-size:12px; margin-top:6px; line-height:1.5;}
.bl-steps{list-style:none; display:flex; flex-wrap:wrap; align-items:center; gap:0; margin:10px 0 0; padding:0;}
.bl-step{display:flex; align-items:center; gap:6px; font-size:11.5px; color:var(--text-muted); white-space:nowrap;}
.bl-step::before{content:''; width:7px; height:7px; border-radius:50%; background:var(--line); flex-shrink:0;}
.bl-step:not(:last-child)::after{content:''; width:16px; height:1px; background:var(--line); margin:0 8px;}
.bl-step.done{color:var(--text);} .bl-step.done::before{background:#4cc38a;}
.bl-step.active{color:var(--gold-bright); font-weight:600;} .bl-step.active::before{background:var(--gold-bright); box-shadow:0 0 0 3px rgba(200,160,60,.22);}
.bl-step.bad{color:var(--danger);} .bl-step.bad::before{background:var(--danger);}
.bl-eyebrow{font-size:11.5px; letter-spacing:.08em; text-transform:uppercase; color:var(--text-muted);}
.bl-hero{display:flex; justify-content:space-between; align-items:center; gap:16px; flex-wrap:wrap; background:linear-gradient(180deg,var(--bg-2),var(--bg)); border:1px solid var(--line); border-radius:16px; padding:22px 24px;}
.bl-hero.soon{border-color:var(--gold);}
.content .bl-hero{padding:22px 24px;}
.bl-hero-title{font-family:'Fraunces',serif; font-size:22px; margin:4px 0 4px; color:var(--text);}
.bl-chip{display:inline-block; padding:4px 12px; border-radius:99px; font-size:12px; font-weight:600; white-space:nowrap;}
.bl-chip.active{background:rgba(70,170,110,.16); color:#4cc38a;}
.bl-chip.soon{background:rgba(200,160,60,.16); color:var(--gold-bright);}
.bl-chip.none{background:rgba(220,80,80,.14); color:var(--danger);}
.bl-chip.warn{background:rgba(229,100,90,.16); color:#e5645a;}
.bl-chip.info{background:rgba(120,160,230,.16); color:#8db0f0;}
.bl-hero-side{ display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
.bl-upgrade{ border:none; cursor:pointer; display:inline-flex; align-items:center; gap:8px; padding:9px 18px; border-radius:99px; font-weight:700; font-size:13.5px; font-family:inherit; color:var(--bg); background:linear-gradient(180deg,var(--gold-bright),var(--gold)); box-shadow:0 10px 22px -12px rgba(200,160,60,.9); transition:transform .15s, filter .2s; }
.bl-upgrade:hover{ filter:brightness(1.07); transform:translateY(-1px); }
.bl-upgrade:focus-visible{ outline:2px solid var(--gold-bright); outline-offset:3px; }
.bl-orders-head{ display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
.bl-filter{ display:inline-flex; gap:4px; padding:3px; border-radius:11px; background:var(--bg-3); border:1px solid var(--line); }
.bl-filter button{ border:0; background:transparent; color:var(--text-muted); font-weight:600; font-size:13px; font-family:inherit; padding:7px 12px; border-radius:8px; cursor:pointer; display:flex; align-items:center; gap:7px; }
.bl-filter button.on{ background:var(--gold); color:var(--bg); }
.bl-filter i{ font-style:normal; font-size:11px; min-width:18px; padding:1px 6px; border-radius:99px; background:rgba(127,127,127,.2); text-align:center; }
.bl-filter button.on i{ background:rgba(0,0,0,.2); }
.bl-chip.free{background:var(--bg-3); color:var(--text-muted);}
.bl-plans{display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:14px;}
.bl-plan{background:var(--bg-2); border:1px solid var(--line); border-radius:16px; padding:20px 22px; display:flex; flex-direction:column; gap:10px; transition:border-color .2s, transform .2s;}
.bl-plan:hover{border-color:var(--gold); transform:translateY(-2px);}
.bl-plan.rec{border-color:rgba(200,160,60,.55);}
.bl-plan-head{display:flex; justify-content:space-between; align-items:center; gap:8px; font-weight:600; font-size:14.5px; color:var(--text);}
.bl-pill{font-size:11px; padding:2px 8px; border-radius:99px; background:rgba(70,170,110,.16); color:#4cc38a; font-weight:600; white-space:nowrap;}
.bl-plan-price{font-family:'Fraunces',serif; font-size:28px; color:var(--gold-bright); line-height:1.1;}
.bl-plan-price small{font-family:inherit; font-size:13px; color:var(--text-muted); margin-inline-start:6px;}
.bl-plan-btn{margin-top:auto; background:var(--gold); color:var(--bg); border:none; border-radius:10px; padding:11px 16px; font-weight:600; font-size:14px; cursor:pointer; font-family:inherit; transition:background .2s;}
.bl-plan-btn:hover{background:var(--gold-bright);}
.bl-plan-btn:focus-visible{outline:2px solid var(--gold); outline-offset:3px;}
.bl-plan.rec .bl-plan-btn{box-shadow:0 8px 20px rgba(200,160,60,.18);}
@media (prefers-reduced-motion:reduce){ .bl-plan, .bl-order{animation:none; transition:none;} .bl-plan:hover{transform:none;} .bl-plan-btn span{transition:none;} }
.bl-plan{ animation:blIn .45s cubic-bezier(.2,.8,.2,1) both; }
.bl-order{ animation:blIn .4s cubic-bezier(.2,.8,.2,1) both; }
@keyframes blIn{ from{ opacity:0; transform:translateY(8px); } to{ opacity:1; transform:none; } }
.bl-plan-list{ list-style:none; margin:4px 0 0; padding:0; display:grid; gap:7px; }
.bl-plan-list li{ display:flex; align-items:flex-start; gap:9px; font-size:13px; line-height:1.5; color:var(--text-muted); }
.bl-tick{ flex:none; width:18px; height:18px; border-radius:50%; display:grid; place-items:center; font-size:11px; font-weight:700; color:#4cc38a; background:rgba(70,170,110,.16); margin-top:1px; }
.bl-plan-btn{ display:flex; align-items:center; justify-content:center; gap:8px; }
.bl-plan-btn span{ display:inline-block; transition:transform .2s ease; }
.bl-plan-btn:hover span{ transform:translateX(3px); }
html[dir="rtl"] .bl-plan-btn:hover span{ transform:translateX(-3px); }
.bl-plan-btn:active{ transform:scale(.985); }
.bl-plan-btn{ transition:background .2s, transform .15s; }
.bl-plan.rec{ box-shadow:0 14px 34px -18px rgba(200,160,60,.45); }
.bl-link{ transition:color .15s ease, opacity .15s ease; } .bl-link:hover{ color:var(--gold); } .bl-link:disabled{ opacity:.5; cursor:default; }
.bl-btn{ transition:background .2s, transform .15s; } .bl-btn:active:not([disabled]){ transform:scale(.98); }
.bl-input:focus, .bl-upload input[type=file]:focus-visible{ outline:2px solid var(--gold); outline-offset:2px; }
.bl-input{ transition:border-color .15s ease; } .bl-input:focus{ border-color:var(--gold); }
.bl-order-actions .bl-link{ padding:4px 0; }
.bl-orders{display:grid; gap:12px;}
/* order history: compact cards, three per row on desktop, two on tablets, one on phones */
.bl-orders-grid{ display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:14px; align-items:stretch; }
.bl-orders-grid .bl-order{ padding:16px; gap:10px; align-content:start; min-width:0; box-shadow:0 1px 0 rgba(0,0,0,.04); }
.bl-orders-grid .bl-order-head{ flex-wrap:wrap; gap:6px 12px; }
.bl-orders-grid .bl-order-head > div:first-child{ flex:1 1 130px; }
.bl-orders-grid .bl-order-title{ font-size:14px; }
.bl-orders-grid .bl-order-actions{ padding-top:10px; gap:8px 12px; }
.bl-orders-grid .bl-upload{ flex-direction:column; align-items:stretch; width:100%; gap:8px; }
.bl-orders-grid .bl-upload .bl-btn, .bl-orders-grid .bl-upload .bl-input{ width:100%; }
.bl-orders-grid .bl-ref{ overflow-wrap:anywhere; }
@media (max-width:1180px){ .bl-orders-grid{ grid-template-columns:repeat(2, minmax(0,1fr)); } }
@media (max-width:700px){ .bl-orders-grid{ grid-template-columns:1fr; } }
.bl-order{background:var(--bg-2); border:1px solid var(--line); border-radius:14px; padding:18px 20px; display:grid; gap:12px; transition:border-color .2s;}
.bl-order:hover{border-color:rgba(200,160,60,.35);}
.bl-order-head{display:flex; justify-content:space-between; gap:12px; align-items:flex-start;}
.bl-order-title{font-weight:600; color:var(--text); font-size:14.5px;}
.bl-order-amt{font-family:'Fraunces',serif; font-size:18px; color:var(--gold-bright); white-space:nowrap;}
.bl-order-status{display:flex; flex-direction:column; gap:6px; align-items:flex-start;}
.bl-order-actions{display:flex; flex-wrap:wrap; gap:10px 14px; align-items:center; padding-top:12px; border-top:1px solid var(--line);}
.bl-order-actions .bl-upload{margin:0;}
/* alignment: text starts on the same edge in every block, prices sit on the text baseline, long text wraps inside its box */
.bl-hero > div, .bl-order-head > div{ min-width:0; text-align:start; }
.bl-hero-title, .bl-muted, .bl-order-title{ overflow-wrap:anywhere; }
.bl-plan{ min-width:0; text-align:start; }
.bl-plan-price{ display:flex; align-items:baseline; flex-wrap:wrap; gap:2px 6px; }
.bl-plan-price small{ margin:0; }
.bl-plan-btn{ width:100%; text-align:center; }
.bl-order-amt{ font-variant-numeric:tabular-nums; text-align:end; }
.bl-upload{ align-items:center; }
.bl-upload input[type=file]{ min-width:0; }
.bl-order-head{ align-items:flex-start; }
@media (max-width:640px){
  .bl-hero{ padding:18px; }
  .bl-plan{ padding:18px; }
  .bl-order{ padding:16px; }
  .bl-order-amt{ font-size:16px; }
  .bl-upload input[type=file]{ max-width:100%; }
  .bl-input{ width:100%; }
  .bl-plans{ grid-template-columns:1fr; }
  .bl-plan-price{ font-size:26px; }
  .bl-actions{ flex-direction:column; align-items:stretch; }
}
`;

function daysLeft(iso) {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
}

/** Student → Billing: access status, renew, order history, invoices, and finishing a bank transfer. */
export default function BillingView({ onUpgrade }) {
  const { t, lang } = useCabinetI18n();
  const { user, role, access, refreshAccess } = useDashboardData();
  const showAsStudent = role === 'admin'; // admins see Billing exactly like a student, including plans
  const navigate = useNavigate();
  const locale = LOCALE[lang] || 'en';
  const [orders, setOrders] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [files, setFiles] = useState({});
  const [msg, setMsg] = useState({}); // orderId -> { kind, text }
  const [phones, setPhones] = useState({}); // orderId -> phone typed for a card payment
  const [flt, setFlt] = useState('all');   // order filter: all | open | paid

  const load = useCallback(async () => {
    try { setOrders(await fetchMyOrders()); } catch (e) { setOrders((o) => o || []); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useLiveRefresh(() => { load(); refreshAccess(); });

  const say = (id, kind, text) => setMsg((m) => ({ ...m, [id]: { kind, text } }));
  const date = (v) => (v ? new Date(v).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');

  async function sendProof(o) {
    const f = files[o.id];
    if (!f) return say(o.id, 'err', t('Choose a file first.'));
    if (f.size > MAX_BYTES) return say(o.id, 'err', t('The file is larger than 5 MB.'));
    if (!OK_TYPES.includes(f.type)) return say(o.id, 'err', t('Use a JPG, PNG, WebP or PDF file.'));
    setBusyId(o.id);
    try {
      const path = await uploadTransferProof(user.id, o.id, f);
      await submitTransferProof(o.id, path, '');
      say(o.id, 'ok', t('Receipt sent. We will review it soon.'));
      await load();
    } catch (e) { say(o.id, 'err', t('Something went wrong. Please try again.')); }
    setBusyId(null);
  }
  async function cancel(o) {
    setBusyId(o.id);
    try { await cancelOrder(o.id); await load(); } catch (e) { say(o.id, 'err', t('Something went wrong. Please try again.')); }
    setBusyId(null);
  }

  /* Card order still pending: send the student back to the Paymob page (same order, no new charge is created). */
  async function payNow(o) {
    setBusyId(o.id);
    try {
      const url = await startCardPayment(o.id, (phones[o.id] || '').trim());
      window.location.assign(url);
    } catch (e) {
      say(o.id, 'err', t('Something went wrong. Please try again.'));
      setBusyId(null);
    }
  }
  /* Re-read one order. The webhook is what marks it paid, so this only shows what the server already recorded. */
  async function checkStatus(o) {
    setBusyId(o.id);
    try {
      const fresh = await fetchOrder(o.id);
      if (fresh && fresh.status === 'paid') say(o.id, 'ok', t('Payment confirmed.'));
      else if (fresh && fresh.status !== o.status) say(o.id, 'ok', t('Status updated.'));
      else say(o.id, 'info', t('Not confirmed yet. If you already paid, wait a few minutes and check again.'));
      await load();
      refreshAccess();
    } catch (e) { say(o.id, 'err', t('Something went wrong. Please try again.')); }
    setBusyId(null);
  }

  const active = access && access.active;
  const left = active && access.ends_at ? daysLeft(access.ends_at) : 0;
  const soon = active && left <= 7;

  /* Every price on this page is shown in US dollars. */
  const usd = (cents) => formatMoney(Number(cents) / 100, 'USD', 'en');
  const st = access ? access.state : null;
  const heroKind = !access ? 'none' : access.exempt ? 'free' : st === 'grace' ? 'warn' : st === 'pre_due' ? 'soon' : st === 'extended' ? 'info' : active ? (soon ? 'soon' : 'active') : 'none';
  const heroChip = { free: t('Free'), active: t('Active'), soon: st === 'pre_due' ? t('Payment due') : t('Ending soon'), warn: t('Grace period'), info: t('Extra time'), none: t('Inactive') }[heroKind];
  const heroTitle = access && access.exempt ? t('Free access')
    : st === 'grace' ? date(access.grace_ends_at)
    : st === 'pre_due' ? date(access.due_at)
    : st === 'extended' ? date(access.extension_until)
    : active ? date(access.ends_at)
    : t('No active access');
  const heroSub = access && access.exempt ? t('Teachers and main admins do not need a plan.')
    : st === 'grace' ? t('Payment is overdue. Your access closes on this date unless you pay.')
    : st === 'pre_due' ? t('Please choose a plan by this date to keep your access.')
    : st === 'extended' ? t('You were given extra time. Your access stays open until this date.')
    : active ? `${t('Active until')} · ${left} ${t('days left')}`
    : access && access.enforced ? t('Your access has ended or has not started yet. Choose a plan to unlock the cabinet.')
    : t('Payments are not required right now. Everything is open.');
  const canBuy = !!access && (!access.exempt || showAsStudent) && heroKind !== 'free';

  // Order history: newest first. A cancelled order disappears a day after it was cancelled and an unpaid order when its payment
  // window ends. The server deletes them too; this only hides them until the next cleanup run.
  const DAY = 86400000;
  const shown = (orders || []).filter((o) => {
    if (o.status === 'cancelled' && o.cancelled_at && Date.now() - new Date(o.cancelled_at).getTime() > DAY) return false;
    if (o.status === 'pending' && o.expires_at && new Date(o.expires_at).getTime() < Date.now()) return false;
    return true;
  }).sort((x, y) => new Date(y.created_at) - new Date(x.created_at));
  const isOpen = (o) => ['pending', 'awaiting_review'].includes(o.status);
  const list = flt === 'open' ? shown.filter(isOpen) : flt === 'paid' ? shown.filter((o) => o.status === 'paid') : shown;
  const counts = { all: shown.length, open: shown.filter(isOpen).length, paid: shown.filter((o) => o.status === 'paid').length };

  return (
    <div className="bl-grid">
      <style>{BILLING_CSS}</style>

      <section className={'bl-hero ' + (heroKind === 'soon' ? 'soon' : '')} aria-live="polite">
        <div>
          <div className="bl-eyebrow">{t('Your access')}</div>
          <div className="bl-hero-title">{heroTitle}</div>
          <p className="bl-muted" style={{ margin: 0 }}>{heroSub}</p>
        </div>
        <div className="bl-hero-side">
          <span className={'bl-chip ' + heroKind}>{heroChip}</span>
          {canBuy && <button type="button" className="bl-upgrade" onClick={onUpgrade}>{active ? t('Renew plan') : t('Upgrade plan')} <span aria-hidden="true">→</span></button>}
        </div>
      </section>

      <section className="bl-orders" aria-label={t('Order history')}>
        <div className="bl-orders-head">
          <div className="bl-eyebrow">{t('Order history')}</div>
          {shown.length > 0 && (
            <div className="bl-filter" role="tablist" aria-label={t('Filter orders')}>
              {[['all', 'All'], ['open', 'In progress'], ['paid', 'Paid']].map(([k, l]) => (
                <button key={k} type="button" role="tab" aria-selected={flt === k} className={flt === k ? 'on' : ''} onClick={() => setFlt(k)}>{t(l)}<i>{counts[k]}</i></button>
              ))}
            </div>
          )}
        </div>
        {orders && shown.length === 0 && <div className="bl-card bl-muted">{t('No orders yet.')}</div>}
        {orders && shown.length > 0 && list.length === 0 && <div className="bl-card bl-muted">{t('No orders in this filter.')}</div>}
        {orders && list.length > 0 && <div className="bl-orders-grid">{list.map((o, i) => {
          const m = msg[o.id];
          const isBank = o.method === 'bank_transfer';
          const isCard = o.method === 'paymob';
          const open = ['pending', 'awaiting_review'].includes(o.status);
          const cls = o.status === 'paid' ? 'paid' : ['failed', 'cancelled', 'rejected', 'refunded'].includes(o.status) ? 'bad' : 'wait';
          const amount = o.usd_cents != null ? usd(o.usd_cents) : '—';
          const methodLabel = t(isCard ? 'Card' : isBank ? 'Bank transfer' : 'Granted by Ufuq');
          return (
            <article key={o.id} className="bl-order" style={{ animationDelay: `${Math.min(i, 6) * 60}ms` }}>
              <header className="bl-order-head">
                <div>
                  <div className="bl-order-title">{t(o.plan_id === 'yearly' ? 'Yearly' : 'Monthly')} · {methodLabel}</div>
                  <div className="bl-muted">{date(o.created_at)}{o.invoice_no ? ` · ${o.invoice_no}` : ''}</div>
                </div>
                <div className="bl-order-amt">{amount}</div>
              </header>

              <div className="bl-order-status">
                <span className={'bl-badge ' + cls}>{t(STATUS[o.status] || o.status)}</span>
                <OrderSteps status={o.status} />
              </div>

              {o.status === 'pending' && o.expires_at && <div className="bl-muted">{t('Pay before')} {date(o.expires_at)}</div>}
              {isBank && o.status === 'pending' && <div className="bl-muted">{t('Transfer the exact amount with the reference below, then send the receipt.')}</div>}
              {isBank && o.status === 'awaiting_review' && <div className="bl-muted">{t('Receipt received. We are checking the transfer.')}</div>}
              {isBank && open && <div className="bl-ref">{t('Payment reference')}: UFUQ-{o.id.slice(0, 8).toUpperCase()}</div>}
              {o.status === 'rejected' && o.review_note && <div className="bl-reason">{t('Reason')}: {o.review_note}</div>}
              {m && <div className={'bl-msg ' + m.kind} role="status">{m.text}</div>}

              {(open || o.invoice_no || ['rejected', 'cancelled'].includes(o.status)) && (
                <footer className="bl-order-actions">
                  {isCard && o.status === 'pending' && (
                    <div className="bl-upload">
                      <input type="tel" className="bl-input" placeholder={t('Phone (optional)')} value={phones[o.id] || ''} onChange={(e) => setPhones((p) => ({ ...p, [o.id]: e.target.value }))} />
                      <button type="button" className="bl-btn" style={{ marginTop: 0, padding: '8px 16px', fontSize: 13 }} disabled={busyId === o.id} onClick={() => payNow(o)}>
                        {busyId === o.id ? t('Please wait…') : t('Pay now')}
                      </button>
                    </div>
                  )}
                  {isBank && open && (
                    <div className="bl-upload">
                      <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFiles((f) => ({ ...f, [o.id]: e.target.files[0] || null }))} />
                      <button type="button" className="bl-btn" style={{ marginTop: 0, padding: '8px 16px', fontSize: 13 }} disabled={busyId === o.id} onClick={() => sendProof(o)}>
                        {busyId === o.id ? t('Sending…') : t(o.status === 'pending' ? 'Send receipt' : 'Upload receipt')}
                      </button>
                    </div>
                  )}
                  {open && <button type="button" className="bl-link" disabled={busyId === o.id} onClick={() => checkStatus(o)}>{t('Check status')}</button>}
                  {o.status === 'pending' && <button type="button" className="bl-link" disabled={busyId === o.id} onClick={() => cancel(o)}>{t('Cancel order')}</button>}
                  {['rejected', 'cancelled'].includes(o.status) && <button type="button" className="bl-link" onClick={() => navigate('/checkout')}>{t('Start a new order')}</button>}
                  {o.invoice_no && <button type="button" className="bl-link" onClick={() => navigate(`/invoice/${o.id}`)}>{t('Invoice')}</button>}
                </footer>
              )}
            </article>
          );
        })}</div>}
      </section>
    </div>
  );
}
