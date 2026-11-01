import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { usePanel } from '../../../components/panel/PanelContext';
import { Switch } from '../../../components/panel/ui';
import Loader from '../../../components/Loader';
import { METHOD, day, IC_TOGGLE, IC_BUILDING, IC_BANK, IC_TAG, IC_SHIELD, IC_CARD, IC_PERCENT, IC_BELL, IC_REFRESH } from './paymentsShared';

/* ------------------------------------------------------------------ settings (main admin) */
const SET_SECTIONS = [
  ['switches', 'Switches', 'IC_TOGGLE', true],
  ['business', 'Business & tax', 'IC_BUILDING', true],
  ['bank', 'Bank transfer', 'IC_BANK', true],
  ['pricing', 'Pricing & rates', 'IC_TAG', false],
];

export default function SettingsTab() {
  const { t, toast, askConfirm } = usePanel();
  const [s, setS] = useState(null);
  const [orig, setOrig] = useState('');
  const [plans, setPlans] = useState([]);
  const [fx, setFx] = useState([]);
  const [busy, setBusy] = useState(false);
  const [sec, setSec] = useState('switches');

  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      supabase.rpc('admin_get_settings'),
      supabase.from('plans').select('id, title, months, price_usd_cents, active').order('sort'),
      supabase.from('fx_rates').select('currency, per_usd, source, updated_at').order('currency'),
    ]);
    if (a.data) { setS(a.data); setOrig(JSON.stringify(a.data)); }
    setPlans(b.data || []); setFx(c.data || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setS((x) => ({ ...x, [k]: v }));
  const dirty = !!s && JSON.stringify(s) !== orig;
  async function save(e) {
    e.preventDefault();
    const save1 = async () => {
      setBusy(true);
      const { error } = await supabase.rpc('admin_save_settings', { p: s });
      setBusy(false);
      if (error) { toast(error.message, 'err'); return; }
      toast(t('Settings saved.'), 'ok'); load();
    };
    if (s.payments_enforced) {
      askConfirm(t('Payments are ON'), t('Students without an active plan will lose access to lessons, tasks, exams and the library. Save?'), save1);
    } else save1();
  }
  async function savePlan(p) {
    const { error } = await supabase.rpc('admin_save_plan', { p_id: p.id, p_title: p.title, p_months: Number(p.months), p_usd_cents: Math.round(Number(p.price_usd_cents)), p_active: !!p.active });
    if (error) toast(error.message, 'err'); else toast(t('Plan saved.'), 'ok');
  }
  async function saveFx(r) {
    const { error } = await supabase.rpc('admin_set_fx', { p_currency: r.currency, p_rate: Number(r.per_usd), p_source: 'manual' });
    if (error) toast(error.message, 'err'); else toast(t('Rate saved.'), 'ok');
  }
  async function refreshFx() {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('fx-refresh', { body: {} });
    setBusy(false);
    if (error || (data && data.error)) { toast(t('Could not update rates.'), 'err'); return; }
    toast(t('Rates updated.'), 'ok'); load();
  }
  async function reminders() {
    const { data, error } = await supabase.rpc('send_expiry_reminders');
    if (error) toast(error.message, 'err'); else toast(`${t('Reminders sent')}: ${data}`, 'ok');
  }
  const upPlan = (i, patch) => setPlans((a) => a.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const upFx = (i, patch) => setFx((a) => a.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  if (!s) return <div className="panel"><Loader inline label={t('Loading…')} /></div>;

  const ICONS = { IC_TOGGLE, IC_BUILDING, IC_BANK, IC_TAG };
  const text = (k, label, props = {}) => (
    <div className="field set-field"><label>{t(label)}</label><input style={{ width: '100%' }} value={s[k] ?? ''} onChange={(e) => set(k, e.target.value)} {...props} /></div>
  );
  const toggle = (k, label, hint, icon) => (
    <button type="button" role="switch" aria-checked={!!s[k]} className={'set-toggle' + (s[k] ? ' is-on' : '')} onClick={() => set(k, !s[k])}>
      <span className="set-toggle-ic">{icon}</span>
      <span className="set-toggle-body"><b>{t(label)}</b>{hint && <small>{t(hint)}</small>}</span>
      <span className="set-state">{s[k] ? t('ON') : t('OFF')}</span>
      <Switch on={!!s[k]} />
    </button>
  );
  const noMethod = !!s.payments_enforced && !s.paymob_enabled && !s.bank_transfer_enabled;

  return (
    <div className="set-wrap">
      <div className="set-nav" role="tablist">
        {SET_SECTIONS.map(([k, l, ic, isForm]) => (
          <button key={k} type="button" role="tab" aria-selected={sec === k} className={'set-nav-btn' + (sec === k ? ' is-active' : '')} onClick={() => setSec(k)}>
            <span className="set-nav-ic">{ICONS[ic]}</span><span className="set-nav-lbl">{t(l)}</span>
            {isForm && dirty && sec !== k ? <i className="set-dot" aria-hidden="true" /> : null}
          </button>
        ))}
      </div>

      {sec !== 'pricing' ? (
        <form onSubmit={save} className="set-form">
          {sec === 'switches' && (
            <div className="panel set-card set-anim">
              <div className="set-card-head"><h3>{t('Switches')}</h3></div>
              <div className="set-toggles">
                {toggle('payments_enforced', 'Require payment', 'OFF = everything stays open (use while testing). ON = students need an active plan.', IC_SHIELD)}
                {toggle('paymob_enabled', 'Card payments (Paymob)', 'Turn on only after the Paymob keys are set on the server.', IC_CARD)}
                {toggle('bank_transfer_enabled', 'Bank transfer', 'Students upload a receipt; you approve it in Orders.', IC_BANK)}
              </div>
              {noMethod && <div className="set-alert" role="alert">{t('Payments are required but no payment method is on.')}</div>}
            </div>
          )}

          {sec === 'business' && (
            <>
              <div className="panel set-card set-anim">
                <div className="set-card-head"><h3>{t('Seller details (printed on invoices)')}</h3></div>
                <div className="set-grid">{text('seller_name', 'Legal name')}{text('seller_tax_id', 'Tax registration no.')}</div>
                {text('seller_address', 'Address')}
                <div className="set-grid">{text('seller_email', 'Billing email')}{text('seller_country', 'Country (2 letters)', { maxLength: 2 })}</div>
              </div>
              <div className="panel set-card set-anim">
                <div className="set-card-head"><h3>{t('Charge currency and tax')}</h3></div>
                <div className="set-grid">{text('charge_currency', 'Charge currency (e.g. EGP)', { maxLength: 3 })}{text('tax_label', 'Tax name (e.g. VAT)')}</div>
                <div className="set-grid">
                  <div className="field set-field"><label>{t('Tax rate %')}</label><input type="number" min="0" max="100" step="0.01" style={{ width: '100%' }} value={s.tax_rate ?? 0} onChange={(e) => set('tax_rate', e.target.value)} /></div>
                  <div className="field set-field"><label>{t('Refund window (days)')}</label><input type="number" min="0" max="365" style={{ width: '100%' }} value={s.refund_days ?? 14} onChange={(e) => set('refund_days', e.target.value)} /></div>
                </div>
                {toggle('prices_include_tax', 'Prices already include tax', 'ON: the tax is taken out of the price. OFF: the tax is added on top. Ask your accountant.', IC_PERCENT)}
                <div className="set-grid" style={{ marginTop: 14 }}>{text('tax_note', 'Note printed on invoices')}{text('terms_version', 'Terms version (change it when the legal texts change)')}</div>
              </div>
            </>
          )}

          {sec === 'bank' && (
            <div className="panel set-card set-anim">
              <div className="set-card-head"><h3>{t('Bank transfer instructions')}</h3></div>
              <div className="set-bank">
                <div className="field set-field"><textarea rows={8} style={{ width: '100%' }} value={s.bank_instructions ?? ''} onChange={(e) => set('bank_instructions', e.target.value)} placeholder={'Bank name\nAccount name\nIBAN\nSWIFT'} /></div>
                <div className="set-preview">
                  <div className="set-preview-lbl">{t('What students see')}</div>
                  <div className="set-preview-box">{(s.bank_instructions || '').trim() || '—'}</div>
                </div>
              </div>
              <p className="hint">{t('Shown to signed-in students at checkout. Add the bank name, account holder, IBAN and SWIFT.')}</p>
            </div>
          )}

          <div className={'set-savebar' + (dirty ? ' is-dirty' : '')}>
            <span className="set-savebar-msg"><i className="set-dot" aria-hidden="true" />{dirty ? t('Unsaved changes') : t('All changes saved')}</span>
            <span className="set-savebar-btns">
              {dirty && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setS(JSON.parse(orig))}>{t('Discard changes')}</button>}
              <button type="submit" className="btn btn-gold" disabled={busy || !dirty}>{t('Save settings')}</button>
            </span>
          </div>
        </form>
      ) : (
        <>
          <div className="panel set-card set-anim">
            <div className="set-card-head"><h3>{t('Plans (price in US dollars)')}</h3></div>
            <div className="set-plans">
              {plans.map((p, i) => (
                <div key={p.id} className={'set-plan' + (p.active ? '' : ' is-off')}>
                  <div className="set-plan-top">
                    <span className="pay-plan">{p.id}</span>
                    <span className="set-plan-sw"><span className="hint">{p.active ? t('Active') : t('Inactive')}</span><Switch on={!!p.active} onClick={() => upPlan(i, { active: !p.active })} /></span>
                  </div>
                  <div className="field set-field"><label>{t('Title')}</label><input className="u-input" style={{ width: '100%' }} value={p.title} onChange={(e) => upPlan(i, { title: e.target.value })} /></div>
                  <div className="set-grid">
                    <div className="field set-field"><label>{t('Months')}</label><input className="u-input" type="number" min="1" max="36" style={{ width: '100%' }} value={p.months} onChange={(e) => upPlan(i, { months: e.target.value })} /></div>
                    <div className="field set-field"><label>{t('Price (USD)')}</label><input className="u-input" type="number" min="0" step="0.01" style={{ width: '100%' }} value={p.price_usd_cents / 100} onChange={(e) => upPlan(i, { price_usd_cents: Number(e.target.value) * 100 })} /></div>
                  </div>
                  <button type="button" className="btn btn-gold btn-sm set-plan-save" onClick={() => savePlan(p)}>{t('Save')}</button>
                </div>
              ))}
            </div>
          </div>

          <div className="panel set-card set-anim">
            <div className="set-card-head"><h3>{t('Exchange rates (units per 1 USD)')}</h3>
              <button type="button" className="btn btn-gold btn-sm" disabled={busy} onClick={refreshFx}>{IC_REFRESH}{t('Update rates')}</button></div>
            <p className="hint">{t('Rates are used to show local prices and to compute the charge currency. Update them before going live and from time to time.')}</p>
            <div className="set-fx">
              {fx.map((r, i) => (
                <div key={r.currency} className="set-fx-row">
                  <div className="set-fx-cur"><b>{r.currency}</b><span className="hint">{r.source}{r.updated_at ? ' · ' + day(r.updated_at) : ''}</span></div>
                  <input className="u-input" type="number" min="0" step="any" value={r.per_usd} onChange={(e) => upFx(i, { per_usd: e.target.value })} aria-label={r.currency} />
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => saveFx(r)}>{t('Save')}</button>
                </div>
              ))}
            </div>
          </div>

          <div className="panel set-card set-anim">
            <div className="set-card-head"><h3>{t('Renewal reminders')}</h3></div>
            <div className="set-remind">
              <span className="set-toggle-ic">{IC_BELL}</span>
              <p className="hint">{t('Sends a notice to students whose access ends within 3 days. Can also run daily (see the migration file for the pg_cron line).')}</p>
              <button type="button" className="btn btn-ghost btn-sm" onClick={reminders}>{t('Send reminders now')}</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
