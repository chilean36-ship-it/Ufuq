import { useCallback, useEffect, useMemo, useState } from 'react';
import useLiveRefresh from '../../../lib/liveRefresh';
import { supabase } from '../../../lib/supabaseClient';
import { usePanel } from '../../../components/panel/PanelContext';
import { Modal } from '../../../components/panel/ui';
import { day, IC_INBOX, SearchBox, IC_BELL, IC_CLOCK, IC_SHIELD } from './paymentsShared';

/* Admin → Payments → Deadlines. The payment policy students live under (the server applies it, see 20261127_payment_policy.sql):
     pay-by date → students who never paid keep access until it,  grace period → a few more days after a plan / the date ends,
     extension → one student gets more time,  reminders → in-app notices 7 / 3 / 1 days before and daily during the grace period. */
const STATES = [
  ['overdue', 'Overdue', 'bad'], ['grace', 'Grace period', 'warn'], ['expiring', 'Ending soon', 'warn'],
  ['pre_due', 'Payment due', 'warn'], ['extended', 'Extra time', 'info'], ['active', 'Active', 'ok'],
];
const PILL_CLS = { overdue: 'bad', grace: 'bad', expiring: 'warn', pre_due: 'warn', extended: 'ok', active: 'ok', free: 'mute' };
const toLocalEnd = (d) => (d ? new Date(d + 'T23:59:59').toISOString() : null);
const dayLeft = (v) => Math.ceil((new Date(v).getTime() - Date.now()) / 86400000);

export default function DeadlinesTab() {
  const { t, toast, askConfirm, isSuper } = usePanel();
  const [s, setS] = useState(null);       // payment settings (policy part)
  const [form, setForm] = useState(null); // { due: 'YYYY-MM-DD'|'', grace: n, hold: n }
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const [flt, setFlt] = useState('attention');
  const [ext, setExt] = useState(null);
  const [extDate, setExtDate] = useState('');
  const [extWhy, setExtWhy] = useState('');
  const [busy, setBusy] = useState(false);

  const loadPolicy = useCallback(async () => {
    const { data } = await supabase.rpc('admin_get_settings');
    if (data) { setS(data); setForm({ due: data.pay_due_at ? day(data.pay_due_at) : '', grace: data.grace_days ?? 3, hold: data.order_hold_hours ?? 24 }); }
  }, []);
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_payment_overview', { p_q: q || null });
    if (error) { setRows({ error: error.message }); return; }
    setRows(data || []);
  }, [q]);
  useEffect(() => { loadPolicy(); }, [loadPolicy]);
  useEffect(() => { const id = setTimeout(load, 250); return () => clearTimeout(id); }, [load]);
  useLiveRefresh(load);

  const list = Array.isArray(rows) ? rows : [];
  const count = useMemo(() => { const c = {}; list.forEach((r) => { c[r.state] = (c[r.state] || 0) + 1; }); return c; }, [list]);
  const shown = list.filter((r) => (flt === 'all' ? true : flt === 'attention' ? ['overdue', 'grace', 'expiring', 'pre_due', 'extended'].includes(r.state) : r.state === flt));

  async function savePolicy(e) {
    e.preventDefault();
    const grace = Math.round(Number(form.grace)), hold = Math.round(Number(form.hold));
    if (!(grace >= 0 && grace <= 30) || !(hold >= 1 && hold <= 720)) { toast(t('Check the numbers: grace 0–30 days, order window 1–720 hours.'), 'err'); return; }
    setBusy(true);
    const { error } = await supabase.rpc('admin_save_settings', { p: { pay_due_at: toLocalEnd(form.due) || '', grace_days: grace, order_hold_hours: hold } });
    setBusy(false);
    if (error) { toast(error.message, 'err'); return; }
    toast(t('Settings saved.'), 'ok'); loadPolicy(); load();
  }
  async function sendNow() {
    const { data, error } = await supabase.rpc('send_payment_notices');
    if (error) toast(error.message, 'err'); else toast(`${t('Reminders sent')}: ${data}`, 'ok');
  }
  async function remind(r) {
    const { error } = await supabase.rpc('admin_remind_user', { p_user: r.user_id });
    if (error) toast(error.message, 'err'); else toast(t('Reminder sent.'), 'ok');
  }
  function openExt(r) {
    setExt(r); setExtWhy('');
    const d = new Date(Date.now() + 7 * 86400000); setExtDate(d.toISOString().slice(0, 10));
  }
  const quick = (n) => setExtDate(new Date(Date.now() + n * 86400000).toISOString().slice(0, 10));
  async function doExtend() {
    if (!extDate) return;
    setBusy(true);
    const { error } = await supabase.rpc('admin_grant_extension', { p_user: ext.user_id, p_until: toLocalEnd(extDate), p_reason: extWhy });
    setBusy(false);
    if (error) { toast(error.message === 'BAD_DATE' ? t('Pick a future date (up to 180 days).') : error.message, 'err'); return; }
    toast(t('More time granted.'), 'ok'); setExt(null); load();
  }
  function dropExt(r) {
    askConfirm(t('Remove extra time'), (r.full_name || r.email) + ' — ' + t('the extra time ends now. Continue?'), async () => {
      const { error } = await supabase.rpc('admin_revoke_extension', { p_user: r.user_id });
      if (error) { toast(error.message, 'err'); return; }
      toast(t('Removed.'), 'ok'); load();
    });
  }

  const label = (k) => (STATES.find((x) => x[0] === k) || [k, k])[1];
  const whenOf = (r) => {
    if (r.state === 'active' || r.state === 'expiring') return `${t('Ends')} ${day(r.active_until)} (${dayLeft(r.active_until)} ${t('days')})`;
    if (r.state === 'extended') return `${t('Until')} ${day(r.extension_until)}`;
    if (r.state === 'grace') return `${t('Access closes')} ${day(r.grace_ends_at)}`;
    if (r.state === 'pre_due') return `${t('Pay by')} ${day(r.due_at)}`;
    if (r.state === 'overdue') return r.last_end ? `${t('Ended')} ${day(r.last_end)}` : t('Never paid');
    return '—';
  };

  return (
    <>
      <div className="panel pay-filters">
        <div className="pay-head-text" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>{IC_SHIELD}{t('Payment deadline and grace period')}</h3>
          <p className="hint" style={{ margin: '4px 0 0' }}>
            {s && s.payments_enforced ? t('Payment is required (switch in Settings).') : t('Payment is not required right now, so nothing below closes access.')}
          </p>
        </div>
        {form && (
          <form onSubmit={savePolicy}>
            <div className="set-grid">
              <div className="field set-field">
                <label>{t('Pay by (students who never paid keep access until this date)')}</label>
                <input type="date" style={{ width: '100%' }} disabled={!isSuper} value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} />
              </div>
              <div className="field set-field">
                <label>{t('Grace period after it (days)')}</label>
                <input type="number" min="0" max="30" style={{ width: '100%' }} disabled={!isSuper} value={form.grace} onChange={(e) => setForm({ ...form, grace: e.target.value })} />
              </div>
            </div>
            <div className="set-grid">
              <div className="field set-field">
                <label>{t('Unpaid order stays open for (hours)')}</label>
                <input type="number" min="1" max="720" style={{ width: '100%' }} disabled={!isSuper} value={form.hold} onChange={(e) => setForm({ ...form, hold: e.target.value })} />
              </div>
              <div className="field set-field" style={{ alignSelf: 'end' }}>
                <span className="hint">{t('Bank-transfer orders get three times longer. Cancelled orders are deleted after 1 day.')}</span>
              </div>
            </div>
            <div className="pay-filters-actions" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              {isSuper && <button className="btn btn-gold btn-sm" disabled={busy}>{t('Save')}</button>}
              {form.due && isSuper && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm({ ...form, due: '' })}>{t('Clear date')}</button>}
              <button type="button" className="btn btn-ghost btn-sm" onClick={sendNow}>{IC_BELL}<span style={{ marginInlineStart: 6 }}>{t('Send reminders now')}</span></button>
            </div>
            <p className="hint" style={{ marginTop: 10 }}>
              {t('Students get an in-app reminder 7, 3 and 1 days before their plan or the pay-by date ends, every day during the grace period, and once when access closes.')}
            </p>
          </form>
        )}
      </div>

      <div className="pay-metrics">
        {STATES.map(([k, l]) => (
          <button key={k} type="button" className="pay-metric" style={{ textAlign: 'start', cursor: 'pointer', outline: flt === k ? '2px solid var(--gold)' : 'none' }} onClick={() => setFlt(flt === k ? 'attention' : k)}>
            <span className="pay-metric-body"><span className="pay-metric-lbl">{t(l)}</span><span className="pay-metric-val">{rows === null ? '…' : count[k] || 0}</span></span>
          </button>
        ))}
      </div>

      <div className="panel pay-filters">
        <SearchBox value={q} onChange={setQ} placeholder={t('Search students by name or email')} />
        <div className="acc-chips" role="tablist">
          {[['attention', 'Needs attention'], ['all', 'All']].map(([k, l]) => (
            <button key={k} type="button" className={'acc-chip' + (flt === k ? ' is-active' : '')} onClick={() => setFlt(k)}>{t(l)}</button>
          ))}
        </div>
      </div>

      {rows === null ? (
        <div className="panel pay-table-wrap"><table className="pay-table"><tbody>{[0, 1, 2].map((i) => <tr key={i} className="pay-skel">{[0, 1, 2, 3].map((j) => <td key={j}><span className="pay-skel-bar" /></td>)}</tr>)}</tbody></table></div>
      ) : rows.error ? (
        <div className="panel pay-table-wrap"><div className="pay-empty"><div>{rows.error}</div></div></div>
      ) : shown.length === 0 ? (
        <div className="panel pay-table-wrap"><div className="pay-empty">{IC_INBOX}<div>{t('Nobody here.')}</div></div></div>
      ) : (
        <div className="panel pay-table-wrap">
          <table className="pay-table">
            <thead><tr><th>{t('Student')}</th><th>{t('Status')}</th><th>{t('Date')}</th><th></th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.user_id}>
                  <td data-label={t('Student')} className="pay-buyer"><b>{r.full_name || '—'}</b><div className="hint">{r.email}</div></td>
                  <td data-label={t('Status')}><span className={'pay-pill ' + (PILL_CLS[r.state] || 'mute')}>{t(label(r.state))}</span></td>
                  <td data-label={t('Date')}>{whenOf(r)}</td>
                  <td className="pay-actions">
                    {r.state !== 'active' && <button className="btn btn-ghost btn-sm" onClick={() => remind(r)}>{t('Remind')}</button>}
                    <button className="btn btn-gold btn-sm" onClick={() => openExt(r)}>{IC_CLOCK}<span style={{ marginInlineStart: 6 }}>{t('Give more time')}</span></button>
                    {r.state === 'extended' && <button className="btn btn-danger btn-sm" onClick={() => dropExt(r)}>{t('Remove')}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!ext} onClose={() => setExt(null)} style={{ maxWidth: 440 }}>
        {ext && (<>
          <h3>{t('Give more time')}</h3>
          <p className="hint" style={{ color: 'var(--text)' }}>{ext.full_name || ext.email}</p>
          <div className="acc-chips" style={{ margin: '6px 0 10px' }}>
            {[3, 7, 14, 30].map((n) => <button key={n} type="button" className="acc-chip" onClick={() => quick(n)}>+{n} {t('days')}</button>)}
          </div>
          <div className="field"><label>{t('Access stays open until')}</label><input type="date" style={{ width: '100%' }} value={extDate} onChange={(e) => setExtDate(e.target.value)} /></div>
          <div className="field"><label>{t('Reason (internal)')}</label><input style={{ width: '100%' }} maxLength={300} value={extWhy} onChange={(e) => setExtWhy(e.target.value)} /></div>
          <p className="hint">{t('The student gets a notification with the new date.')}</p>
          <div className="modal-actions"><button className="btn btn-ghost" onClick={() => setExt(null)}>{t('Cancel')}</button><button className="btn btn-gold" disabled={busy || !extDate} onClick={doExtend}>{t('Grant')}</button></div>
        </>)}
      </Modal>
    </>
  );
}
