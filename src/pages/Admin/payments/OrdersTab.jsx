import { useCallback, useEffect, useMemo, useState } from 'react';
import useLiveRefresh from '../../../lib/liveRefresh';
import { supabase } from '../../../lib/supabaseClient';
import { usePanel } from '../../../components/panel/PanelContext';
import { EmptyRow, Modal } from '../../../components/panel/ui';
import { fmtDate as fmtDateL, currentLang } from '../../../lib/dateLocale';
import { STATUSES, SLABEL, METHOD, day, money, downloadCsv, IC_WALLET, IC_CLOCK, IC_CHECK, IC_UNDO, Metric, IC_INBOX, SearchBox, PILL } from './paymentsShared';

export default function OrdersTab() {
  const { t, toast, isSuper } = usePanel();
  const [rows, setRows] = useState(null);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [checks, setChecks] = useState({ lessons: false, downloads: false });
  const [sel, setSel] = useState(null); // { order, mode: 'review' | 'refund', proofUrl }
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_list_orders', { p_status: status || null, p_from: from || null, p_to: to || null, p_q: q || null });
    if (error) { setRows((r) => r || { error: error.message }); return; }
    setRows(data || []);
  }, [status, from, to, q]);
  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load);

  const totals = useMemo(() => (Array.isArray(rows) ? rows.filter((o) => o.status === 'paid').reduce((s, o) => s + (o.charge_cents - (o.refund_cents || 0)), 0) : 0), [rows]);
  const cur = Array.isArray(rows) && rows[0] ? rows[0].charge_currency : 'EGP';

  async function open(o, mode) {
    setNote(''); setChecks({ lessons: false, downloads: false }); setAmount(mode === 'refund' ? ((o.charge_cents - (o.refund_cents || 0)) / 100).toFixed(2) : '');
    let proofUrl = null;
    if (mode === 'review' && o.proof_path) {
      const { data } = await supabase.storage.from('payment-proofs').createSignedUrl(o.proof_path, 600);
      proofUrl = data && data.signedUrl;
    }
    setSel({ order: o, mode, proofUrl });
  }
  async function review(approve) {
    setBusy(true);
    const { error } = await supabase.rpc('admin_review_order', { p_order: sel.order.id, p_approve: approve, p_note: note });
    setBusy(false);
    if (error) { toast(error.message, 'err'); return; }
    toast(t(approve ? 'Payment approved. Access granted.' : 'Payment rejected.'), 'ok');
    setSel(null); load();
  }
  async function refund() {
    const cents = Math.round(Number(amount) * 100);
    if (!cents || cents <= 0) { toast(t('Enter a valid amount.'), 'err'); return; }
    setBusy(true);
    const { error } = await supabase.rpc('admin_refund_order', { p_order: sel.order.id, p_cents: cents, p_note: note });
    setBusy(false);
    if (error) { toast(String(error.message).includes('REFUND_WINDOW_CLOSED') ? t('The refund window for this order has closed.') : error.message, 'err'); return; }
    toast(t('Refund recorded.'), 'ok');
    setSel(null); load();
  }

  const list = Array.isArray(rows) ? rows : [];
  const nPaid = list.filter((o) => o.status === 'paid').length;
  const nReview = list.filter((o) => ['pending', 'awaiting_review'].includes(o.status)).length;
  const nRefunded = list.filter((o) => o.status === 'refunded' || o.refund_cents > 0).length;
  const loadingRows = rows === null;
  return (
    <>
      <div className="pay-metrics">
        <Metric tone="gold" icon={IC_WALLET} label={t('Net revenue')} value={money(totals, cur)} sub={t('Paid, minus refunds')} loading={loadingRows} />
        <Metric tone="warn" icon={IC_CLOCK} label={t('Pending')} value={nReview} sub={t('Waiting for payment or review')} loading={loadingRows} />
        <Metric tone="ok" icon={IC_CHECK} label={t('Paid orders')} value={nPaid} sub={`${list.length} ${t('orders')}`} loading={loadingRows} />
        <Metric tone="bad" icon={IC_UNDO} label={t('Refunded')} value={nRefunded} sub={t('Orders with a refund')} loading={loadingRows} />
      </div>
      <div className="panel pay-filters">
        <div className="pay-filters-grid">
          <div className="field"><label>{t('Status')}</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">{t('All')}</option>
              {STATUSES.map((s) => <option key={s} value={s}>{t(SLABEL[s])}</option>)}
            </select></div>
          <div className="field"><label>{t('From')}</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="field"><label>{t('To')}</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
        <SearchBox value={q} onChange={setQ} placeholder={t('Search name, email or invoice no.')} />
        <div className="pay-filters-foot">
          <span className="hint">{t('Net paid in this list')}: <b>{money(totals, cur)}</b> · {list.length} {t('orders')}</span>
          <div className="pay-filters-actions">
            {(status || from || to || q) && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setStatus(''); setFrom(''); setTo(''); setQ(''); }}>{t('Reset')}</button>}
            <button type="button" className="btn btn-ghost btn-sm" disabled={!list.length} onClick={() => downloadCsv(list)}>{t('Export CSV')}</button>
          </div>
        </div>
      </div>

      <div className="panel pay-table-wrap">
        <table className="pay-table">
          <thead><tr><th>{t('Date')}</th><th>{t('Buyer')}</th><th>{t('Plan')}</th><th>{t('Method')}</th><th>{t('Amount')}</th><th>{t('Status')}</th><th></th></tr></thead>
          <tbody>
            {rows === null ? [0, 1, 2, 3].map((i) => (
                <tr key={i} className="pay-skel">{[0, 1, 2, 3, 4, 5, 6].map((j) => <td key={j}><span className="pay-skel-bar" /></td>)}</tr>
              ))
              : rows.error ? <EmptyRow cols={7}>{rows.error}</EmptyRow>
              : list.length === 0 ? <tr><td colSpan={7}><div className="pay-empty">{IC_INBOX}<div>{t('No orders.')}</div></div></td></tr>
              : list.map((o) => (
                <tr key={o.id}>
                  <td data-label={t('Date')}>{day(o.created_at)}<div className="hint">{o.invoice_no || ''}</div></td>
                  <td data-label={t('Buyer')} className="pay-buyer"><b>{o.buyer_name}</b><div className="hint">{o.buyer_email} · {o.buyer_country}</div></td>
                  <td data-label={t('Plan')}><span className="pay-plan">{o.plan_id}</span></td>
                  <td data-label={t('Method')}>{t(METHOD[o.method] || o.method)}</td>
                  <td data-label={t('Amount')} className="pay-amt">{money(o.charge_cents, o.charge_currency)}{o.refund_cents > 0 && <div className="hint pay-refund">− {money(o.refund_cents, o.charge_currency)}</div>}</td>
                  <td data-label={t('Status')}><span className={'pay-pill ' + (PILL[o.status] || '')}>{t(SLABEL[o.status] || o.status)}</span></td>
                  <td className="pay-actions">
                    {o.method === 'bank_transfer' && ['pending', 'awaiting_review'].includes(o.status) && <button className="btn btn-gold btn-sm" onClick={() => open(o, 'review')}>{t('Review')}</button>}
                    {isSuper && o.status === 'paid' && <button className="btn btn-ghost btn-sm" onClick={() => open(o, 'refund')}>{t('Refund')}</button>}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <Modal open={!!sel} onClose={() => setSel(null)} style={{ maxWidth: 520 }}>
        {sel && sel.mode === 'review' && (
          <>
            <h3>{t('Review bank transfer')}</h3>
            <p className="hint" style={{ fontSize: 13.5, color: 'var(--text)' }}>
              <b>{sel.order.buyer_name}</b> · {sel.order.buyer_email}<br />
              {money(sel.order.charge_cents, sel.order.charge_currency)} · {t('Reference')}: UFUQ-{sel.order.id.slice(0, 8).toUpperCase()}
            </p>
            {sel.order.proof_note && <p className="hint">{t('Student note')}: {sel.order.proof_note}</p>}
            {sel.proofUrl ? <p><a href={sel.proofUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">{t('Open receipt')}</a></p> : <p className="hint">{t('No receipt uploaded yet.')}</p>}
            <p className="hint">{t('Approve only after the money is visible on the bank statement. A receipt image alone is not proof.')}</p>
            <div className="field"><label>{t('Note (shown in the log)')}</label><input style={{ width: '100%' }} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></div>
            <div className="modal-actions">
              <button className="btn btn-danger" disabled={busy} onClick={() => review(false)}>{t('Reject')}</button>
              <button className="btn btn-gold" disabled={busy} onClick={() => review(true)}>{t('Approve')}</button>
            </div>
          </>
        )}
        {sel && sel.mode === 'refund' && (
          <>
            <h3>{t('Record a refund')}</h3>
            <p className="hint">{t('This records the refund and shortens access. Send the money back from the Paymob dashboard or your bank yourself.')}</p>
            <p className="hint">{t('Paid on')}: {sel.order.paid_at ? fmtDateL(sel.order.paid_at, currentLang()) : '—'}. {t('Refund allowed only within the refund window (see settings).')}</p>
            <label className="hint" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <input type="checkbox" checked={checks.lessons} onChange={(e) => setChecks((c) => ({ ...c, lessons: e.target.checked }))} />
              {t('Student attended no more than 2 live lessons.')}
            </label>
            <label className="hint" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
              <input type="checkbox" checked={checks.downloads} onChange={(e) => setChecks((c) => ({ ...c, downloads: e.target.checked }))} />
              {t('Student did not bulk-download the materials.')}
            </label>
            <div className="field"><label>{t('Amount')} ({sel.order.charge_currency})</label><input type="number" min="0" step="0.01" style={{ width: '100%' }} value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div className="field"><label>{t('Reason')}</label><input style={{ width: '100%' }} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setSel(null)}>{t('Cancel')}</button>
              <button className="btn btn-gold" disabled={busy || !checks.lessons || !checks.downloads} onClick={refund}>{t('Record refund')}</button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
