import { formatMoney, minorToMajor } from '../../../lib/payments';

export const STATUSES = ['pending', 'awaiting_review', 'paid', 'failed', 'cancelled', 'rejected', 'refunded'];
export const SLABEL = { pending: 'Waiting for payment', awaiting_review: 'Waiting for review', paid: 'Paid', failed: 'Failed', cancelled: 'Cancelled', rejected: 'Rejected', refunded: 'Refunded' };
export const METHOD = { paymob: 'Card (Paymob)', bank_transfer: 'Bank transfer', admin: 'Granted by Ufuq' };
export const day = (v) => (v ? new Date(v).toISOString().slice(0, 10) : '');
export const money = (c, cur) => (cur ? formatMoney(minorToMajor(c, cur), cur, 'en') : '—');

export function downloadCsv(rows) {
  const head = ['invoice_no', 'created', 'paid_at', 'status', 'method', 'plan', 'months', 'buyer_name', 'buyer_email', 'country', 'currency', 'total', 'tax', 'refunded', 'reference'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((o) => [o.invoice_no, day(o.created_at), day(o.paid_at), o.status, o.method, o.plan_id, o.months, o.buyer_name, o.buyer_email, o.buyer_country,
    o.charge_currency, (o.charge_cents / 100).toFixed(2), ((o.tax_cents || 0) / 100).toFixed(2), ((o.refund_cents || 0) / 100).toFixed(2), o.provider_txn_id || o.id].map(esc).join(','));
  const blob = new Blob(['﻿' + [head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `ufuq-orders-${day(new Date())}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export const svg = (d) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
export const IC_WALLET = svg(<><path d="M3 7.5A2.5 2.5 0 015.5 5H18a1 1 0 011 1v2" /><path d="M3 7.5V17a2 2 0 002 2h13a1 1 0 001-1v-9a1 1 0 00-1-1H5.5A2.5 2.5 0 013 7.5z" /><circle cx="16" cy="13.5" r="1.1" fill="currentColor" stroke="none" /></>);
export const IC_CLOCK = svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
export const IC_CHECK = svg(<><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.8 2.8L16.5 9.5" /></>);
export const IC_UNDO = svg(<><path d="M9 7L4 12l5 5" /><path d="M4 12h10a6 6 0 010 12" transform="translate(0 -6)" /></>);
export const IC_TOGGLE = svg(<><rect x="2.5" y="7" width="19" height="10" rx="5" /><circle cx="16.5" cy="12" r="2.6" /></>);
export const IC_BUILDING = svg(<><path d="M4 21V5a1 1 0 011-1h9a1 1 0 011 1v16" /><path d="M15 9h4a1 1 0 011 1v11" /><path d="M8 8h3M8 12h3M8 16h3M3 21h18" /></>);
export const IC_BANK = svg(<><path d="M3 10l9-6 9 6" /><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18" /></>);
export const IC_TAG = svg(<><path d="M3 12V4a1 1 0 011-1h8l9 9-9 9-9-9z" /><circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" stroke="none" /></>);
export const IC_SHIELD = svg(<><path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6l8-3z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></>);
export const IC_CARD = svg(<><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 10h19M6.5 15h4" /></>);
export const IC_PERCENT = svg(<><path d="M19 5L5 19" /><circle cx="7" cy="7" r="2.2" /><circle cx="17" cy="17" r="2.2" /></>);
export const IC_BELL = svg(<><path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15L6 16z" /><path d="M10 21h4" /></>);
export const IC_REFRESH = svg(<><path d="M20 11a8 8 0 00-14-4L4 9" /><path d="M4 4v5h5" /><path d="M4 13a8 8 0 0014 4l2-2" /><path d="M20 20v-5h-5" /></>);

export function Metric({ tone, icon, label, value, sub, loading }) {
  return (
    <div className={'pay-metric ' + tone}>
      <span className="pay-metric-ic">{icon}</span>
      <div className="pay-metric-body">
        <div className="pay-metric-lbl">{label}</div>
        <div className="pay-metric-val">{loading ? <span className="pay-metric-skel" /> : value}</div>
        {sub ? <div className="pay-metric-sub">{sub}</div> : null}
      </div>
    </div>
  );
}

export const IC_SEARCH = svg(<><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>);
export const IC_X = svg(<path d="M6 6l12 12M18 6L6 18" />);
export const IC_INBOX = svg(<><path d="M3 13l2.5-7.5A2 2 0 017.4 4h9.2a2 2 0 011.9 1.5L21 13" /><path d="M3 13v5a2 2 0 002 2h14a2 2 0 002-2v-5h-5l-1.5 2h-5L8 13H3z" /></>);

export function SearchBox({ value, onChange, placeholder, label }) {
  return (
    <div className="pay-search">
      <span className="pay-search-ic">{IC_SEARCH}</span>
      <input type="search" aria-label={label || placeholder} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off" spellCheck={false} />
      {value ? <button type="button" className="pay-search-clear" aria-label="Clear" onClick={() => onChange('')}>{IC_X}</button> : null}
    </div>
  );
}

export const IC_CARET = svg(<path d="M6 9l6 6 6-6" />);
export const IC_GROUP = svg(<><circle cx="9" cy="8" r="3.2" /><path d="M3 19c0-3.2 2.7-5.5 6-5.5s6 2.3 6 5.5" /><circle cx="17" cy="9" r="2.4" /><path d="M16.5 14c2.6 0 4.5 1.8 4.5 4.5" /></>);
export const PILL = { paid: 'ok', pending: 'warn', awaiting_review: 'warn', failed: 'bad', rejected: 'bad', cancelled: 'mute', refunded: 'bad' };
