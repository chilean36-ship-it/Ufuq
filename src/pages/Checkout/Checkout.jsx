import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import tokensCss from '../../styles/tokens.css?inline';
import pageCss from './checkout.css?inline';
import PageStyle from '../../components/PageStyle';
import CardFields from './CardFields';
import SecurityBadges, { ICON_SHIELD } from './SecurityBadges';
import { validateAll, FIELD_ORDER, FIELD_ID } from './validation';
import LangSelect from '../../components/LangSelect';
import { useI18n } from '../../context/I18nContext';
import { useAuth } from '../../context/AuthContext';
import {
  getPaymentsConfig, createOrder, startCardPayment, uploadTransferProof, submitTransferProof,
  detectCountry, currencyForCountry, countryOptions, displayAmount, formatMoney, minorToMajor, fill, payErrKey,
} from '../../lib/payments';

const LOCALE = { EN: 'en', UZ: 'uz', RU: 'ru', AR: 'ar' };
const MAX_BYTES = 5 * 1024 * 1024;
const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const CHECK = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
);
const LOCK = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
);

export default function Checkout() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const locale = LOCALE[lang] || 'en';

  const [cfg, setCfg] = useState(null);
  const [loadErr, setLoadErr] = useState(false);
  const [planId, setPlanId] = useState(params.get('plan') === 'yearly' ? 'yearly' : 'monthly');
  const [country, setCountry] = useState(detectCountry());
  const [ccy, setCcy] = useState(currencyForCountry(detectCountry()));
  const [method, setMethod] = useState('');
  const [form, setForm] = useState({ name: '', email: '', phone: '', terms: false, start: false });
  const [card, setCard] = useState({ number: '', name: '', exp: '', cvc: '' }); // local UI only — never stored or sent
  const [savedSel, setSavedSel] = useState('');
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [stage, setStage] = useState(''); // '' | 'order' | 'redirect'
  const [shake, setShake] = useState(false);
  const shakeTimer = useRef(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState(null); // set once a bank-transfer order exists
  const [file, setFile] = useState(null);
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  const [incOpen, setIncOpen] = useState(false);
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width:860px)').matches);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const countries = useMemo(() => countryOptions(locale), [locale]);

  useEffect(() => { document.title = 'Ufuq — Checkout'; }, []);
  useEffect(() => {
    const m = window.matchMedia('(max-width:860px)');
    const h = () => setNarrow(m.matches);
    m.addEventListener('change', h);
    return () => m.removeEventListener('change', h);
  }, []);
  useEffect(() => {
    let alive = true;
    getPaymentsConfig().then((c) => {
      if (!alive) return;
      setCfg(c);
      setMethod((m) => m || (c.paymob_enabled ? 'paymob' : c.bank_transfer_enabled ? 'bank_transfer' : ''));
    }).catch(() => alive && setLoadErr(true));
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!user) return;
    const nm = (user.user_metadata && user.user_metadata.full_name) || '';
    setForm((f) => ({ ...f, email: f.email || user.email || '', name: f.name || nm }));
  }, [user]);

  const plans = (cfg && cfg.plans) || [];
  const plan = plans.find((p) => p.id === planId) || plans[0];
  const fx = (cfg && cfg.fx) || {};
  const ccyList = useMemo(() => ['USD', ...Object.keys(fx).filter((c) => c !== 'USD').sort()], [fx]);

  const shown = (usdCents) => { const d = displayAmount(usdCents, fx, ccy); return formatMoney(d.amount, d.currency, locale); };
  const monthly = plans.find((p) => p.months === 1);
  const savePct = plan && monthly && plan.months > 1 ? Math.round((1 - plan.usd_cents / (monthly.usd_cents * plan.months)) * 100) : 0;

  // What the card will really be charged in (the "charge currency", normally EGP) — shown before paying, not hidden.
  const chargeCcy = cfg ? cfg.charge_currency : 'EGP';
  const chargeAmount = plan && fx[chargeCcy]
    ? (() => {
        const gross = Math.round(plan.usd_cents * fx[chargeCcy]);
        const tax = cfg.tax_rate > 0 && !cfg.prices_include_tax ? Math.round(gross * cfg.tax_rate / 100) : 0;
        return formatMoney(minorToMajor(gross + tax, chargeCcy), chargeCcy, locale);
      })()
    : '';
  const taxUsd = plan && cfg && cfg.tax_rate > 0 && !cfg.prices_include_tax ? Math.round(plan.usd_cents * cfg.tax_rate / 100) : 0;
  const showCharge = chargeCcy !== ccy && chargeAmount;

  const periodText = useMemo(() => {
    if (!plan) return '';
    const a = new Date();
    const b = new Date(a);
    b.setMonth(b.getMonth() + plan.months);
    const f = (d) => d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
    return `${f(a)} – ${f(b)}`;
  }, [plan, locale]);
  const pctOf = (p) => (monthly && p.months > 1 ? Math.round((1 - p.usd_cents / (monthly.usd_cents * p.months)) * 100) : 0);

  const noMethod = cfg && !cfg.paymob_enabled && !cfg.bank_transfer_enabled;

  /* ---------- Phase 3: validation ---------- */
  const errs = useMemo(() => validateAll({ form, card, method, savedSel }), [form, card, method, savedSel]);
  const touch = (f) => setTouched((p) => (p[f] ? p : { ...p, [f]: true }));
  const show = (f) => (touched[f] || submitted) && errs[f];
  const msg = (f) => (show(f) ? fill(t(`pay.val.${errs[f].k}`), { n: errs[f].n }) : '');
  const ok = (f) => !!touched[f] && !errs[f];
  const errMap = {};
  const validMap = {};
  ['cardNum', 'cardName', 'exp', 'cvc'].forEach((f) => { errMap[f] = msg(f); validMap[f] = ok(f); });
  const fcls = (f) => 'co-field' + (show(f) ? ' invalid' : ok(f) ? ' valid' : '');
  const ariaFor = (f, id) => ({ 'aria-invalid': show(f) ? 'true' : undefined, 'aria-describedby': show(f) ? id + 'Err' : undefined });
  useEffect(() => () => clearTimeout(shakeTimer.current), []);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setErr('');
    setSubmitted(true);
    const firstBad = FIELD_ORDER.find((f) => errs[f]);
    if (firstBad) {
      setErr(t('pay.val.summary'));
      setShake(true);
      clearTimeout(shakeTimer.current);
      shakeTimer.current = setTimeout(() => setShake(false), 520);
      const el = document.getElementById(FIELD_ID[firstBad]);
      if (el && el.focus) el.focus();
      return;
    }
    if (!plan || !method) return;
    setBusy(true);
    setStage('order');
    try {
      const o = await createOrder({
        plan: plan.id, method, country, name: form.name.trim(), email: form.email.trim(),
        displayCurrency: ccy, termsVersion: cfg.terms_version,
      });
      if (method === 'paymob') {
        setStage('redirect');
        const url = await startCardPayment(o.id, form.phone.trim());
        setCard({ number: '', name: '', exp: '', cvc: '' });
        window.location.assign(url);
        return; // leaving the page
      }
      setOrder(o);
    } catch (ex) {
      setErr(t(payErrKey(ex)));
    }
    setStage('');
    setBusy(false);
  }

  async function sendProof(e) {
    e.preventDefault();
    setErr('');
    if (!file) { setErr(t('pay.bank.pick')); return; }
    if (file.size > MAX_BYTES) { setErr(t('pay.bank.tooBig')); return; }
    if (!OK_TYPES.includes(file.type)) { setErr(t('pay.bank.badType')); return; }
    setBusy(true);
    try {
      const path = await uploadTransferProof(user.id, order.id, file);
      await submitTransferProof(order.id, path, note);
      setSent(true);
    } catch (ex) {
      setErr(t(payErrKey(ex)));
    }
    setBusy(false);
  }

  const refCode = order ? `UFUQ-${order.id.slice(0, 8).toUpperCase()}` : '';
  const consentMain = t('pay.consent.main').split(/(\{terms\}|\{refund\}|\{privacy\})/).map((part, i) => {
    const map = { '{terms}': ['/terms', 'pay.terms'], '{refund}': ['/refund', 'pay.refund'], '{privacy}': ['/privacy', 'pay.privacy'] };
    return map[part] ? <a key={i} href={map[part][0]} target="_blank" rel="noopener noreferrer">{t(map[part][1])}</a> : <span key={i}>{part}</span>;
  });

  const topbar = (
    <div className="co-topbar">
      <div className="co-topbar-left">
        <Link className="co-back-arrow" to="/dashboard" aria-label={t('checkout.topbar.backLabel')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>
        </Link>
        <Link className="co-brand" to="/dashboard"><img src="/assets/images/logo-checkout.png" alt="Ufuq" width="16" height="28" />Ufuq</Link>
      </div>
      <div className="co-topbar-right"><LangSelect variant="checkout" /></div>
    </div>
  );

  /* ---------- bank transfer step ---------- */
  if (order) {
    const amt = formatMoney(minorToMajor(order.charge_cents, order.charge_currency), order.charge_currency, locale);
    return (
      <>
        <PageStyle css={tokensCss} /><PageStyle css={pageCss} />
        {topbar}
        {sent ? (
          <div className="co-success-wrap show">
            <div className="co-check"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg></div>
            <h1>{t('pay.bank.sentTitle')}</h1>
            <p>{t('pay.bank.sentSub')}</p>
            <Link className="co-success-btn" to="/dashboard#billing"><span>{t('pay.bank.toBilling')}</span></Link>
          </div>
        ) : (
          <div className="co-narrow">
            <div className="co-form-card">
              <h2>{t('pay.bank.title')}</h2>
              <p className="sec-sub">{fill(t('pay.bank.sub'), { amount: amt })}</p>
              <div className="co-bankbox">
                <div className="co-bank-k">{t('pay.bank.ref')}</div>
                <div className="co-bank-ref">{refCode}</div>
                <div className="co-bank-k">{t('pay.bank.details')}</div>
                <pre className="co-bank-pre">{cfg.bank_instructions || t('pay.bank.noDetails')}</pre>
              </div>
              <p className="co-warn">{t('pay.bank.notice')}</p>
              <form noValidate onSubmit={sendProof}>
                <div className="co-field">
                  <label htmlFor="coFile">{t('pay.bank.upload')}</label>
                  <input id="coFile" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFile(e.target.files[0] || null)} />
                </div>
                <div className="co-field">
                  <label htmlFor="coNote">{t('pay.bank.note')}</label>
                  <input id="coNote" type="text" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
                <div className={'checkout-error' + (err ? ' show' : '')}>{err}</div>
                <button type="submit" className={'checkout-pay-btn' + (busy ? ' loading' : '')} disabled={busy}>
                  <span className="co-spinner"></span>
                  <span className="co-pay-label">{busy ? t('pay.bank.sending') : t('pay.bank.submit')}</span>
                </button>
              </form>
            </div>
          </div>
        )}
      </>
    );
  }

  /* ---------- main checkout ---------- */
  const payLabel = busy ? (stage === 'redirect' ? t('pay.btn.redirecting') : method === 'paymob' ? t('pay.btn.creating') : t('pay.btn.working'))
    : method === 'paymob' ? fill(t('pay.btn.card'), { amount: showCharge ? chargeAmount : (plan ? shown(plan.usd_cents) : '') })
    : t('pay.btn.bank');

  return (
    <>
      <PageStyle css={tokensCss} /><PageStyle css={pageCss} />
      {topbar}
      {loadErr && <div className="co-narrow"><div className="checkout-error show">{t('pay.err.GENERIC')}</div></div>}
      {!cfg && !loadErr && (
        <div className="co-wrap co-skel" role="status" aria-busy="true" aria-label={t('pay.title')}>
          <div className="co-head"><span className="sk sk-h" /><span className="sk sk-p" /></div>
          <div className="co-form-card"><span className="sk sk-b" /><span className="sk sk-b" /><span className="sk sk-b tall" /></div>
          <aside className="co-summary"><div className="rc"><span className="sk sk-blk" /></div></aside>
        </div>
      )}
      {cfg && plan && (
        <div className="co-wrap">
          <div className="co-head">
            <h1>{t('pay.title')}</h1>
            <p className="sub">{t('pay.sub')}</p>
          </div>
          <aside className="co-summary" aria-label={t('pay.summary.title')}>
            <div className="rc">
              <div className="rc-top">
                <div className="rc-head">
                  <h2 className="rc-title">{t('pay.summary.title')}</h2>
                  <span className="rc-pill">{LOCK}<span>{t('pay.summary.noRenew')}</span></span>
                </div>

                <div className="rc-plans" role="radiogroup" aria-label={t('pay.summary.plan')}>
                  {plans.map((p) => {
                    const on = p.id === plan.id;
                    const pct = pctOf(p);
                    return (
                      <button key={p.id} type="button" role="radio" aria-checked={on} className={'rc-plan' + (on ? ' on' : '')} onClick={() => setPlanId(p.id)}>
                        <span className="rc-radio" aria-hidden="true" />
                        <span className="rc-plan-top">
                          <span className="rc-plan-name">{t(`pay.plan.${p.id === 'yearly' ? 'yearly' : 'monthly'}`)}</span>
                          {pct > 0 && <em className="rc-plan-save">-{pct}%</em>}
                        </span>
                        <span className="rc-plan-price">{shown(p.usd_cents)}</span>
                        <span className="rc-plan-sub">{p.months === 1 ? t('pay.plan.oneMonth') : `${shown(p.usd_cents / p.months)} ${t('pay.plan.perMonth')}`}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="rc-item">
                  <div className="rc-item-ico" aria-hidden="true">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z" /></svg>
                  </div>
                  <div className="rc-item-info">
                    <div className="rc-item-name">{t('pay.plan.full')}</div>
                    <div className="rc-item-period"><span>{t('pay.summary.period')}</span><b>{periodText}</b></div>
                  </div>
                </div>
              </div>

              <div className="rc-tear" aria-hidden="true" />

              <div className="rc-bottom">
                <dl className="rc-lines">
                  <div className="rc-row"><dt>{t('pay.summary.subtotal')}</dt><dd>{shown(plan.usd_cents)}</dd></div>
                  {taxUsd > 0 && <div className="rc-row"><dt>{t('pay.summary.tax')} ({cfg.tax_rate}%)</dt><dd>{shown(taxUsd)}</dd></div>}
                  {savePct > 0 && <div className="rc-row rc-saving"><dt>{fill(t('pay.plan.save'), { pct: savePct })}</dt><dd>{shown(monthly.usd_cents * plan.months - plan.usd_cents)}</dd></div>}
                </dl>

                <div className="rc-total">
                  <span className="rc-total-label">{t('pay.summary.total')}</span>
                  <span key={plan.id + ccy} className="rc-total-amt co-price-pop">{shown(plan.usd_cents + taxUsd)}</span>
                </div>
                {showCharge && <div className="rc-charged"><span>{t('pay.summary.chargedAs')}</span><b>{chargeAmount}</b></div>}

                <div className="rc-ccy">
                  <label htmlFor="coCcy">{t('pay.currency')}</label>
                  <select id="coCcy" value={ccy} onChange={(e) => setCcy(e.target.value)}>
                    {ccyList.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <p className="rc-note">{t('pay.priceNote')}</p>

                {narrow ? (
                  <button type="button" className="rc-inc-toggle" aria-expanded={incOpen} aria-controls="rcInc" onClick={() => setIncOpen((v) => !v)}>
                    <span>{t('pay.include')}</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={incOpen ? 'up' : ''}><path d="M6 9l6 6 6-6" /></svg>
                  </button>
                ) : (
                  <div className="rc-inc-title">{t('pay.include')}</div>
                )}
                {(!narrow || incOpen) && (
                  <ul className="rc-inc" id="rcInc">
                    {[1, 2, 3, 4].map((n) => <li key={n}>{CHECK}<span>{t(`checkout.summary.include${n}`)}</span></li>)}
                  </ul>
                )}

                <div className="co-guarantee">
                  <span className="co-guarantee-ico">{ICON_SHIELD}</span>
                  <div><b>{t('pay.trust.guaranteeTitle')}</b><p>{t('pay.trust.guaranteeText')}</p></div>
                </div>
              </div>
            </div>
          </aside>

          <div className={'co-form-card' + (shake ? ' shake' : '')}>
            <form noValidate onSubmit={submit} aria-busy={busy}>
              <fieldset className="co-fieldset" disabled={busy}>
              <div className="co-section-title">{t('pay.method.title')}</div>
              {noMethod && <div className="checkout-error show">{t('pay.method.bankOff')}</div>}
              <div className="co-methods" role="radiogroup" aria-label={t('pay.method.title')}>
                <label className={'co-method' + (method === 'paymob' ? ' on' : '') + (cfg.paymob_enabled ? '' : ' off')}>
                  <input type="radio" name="m" disabled={!cfg.paymob_enabled} checked={method === 'paymob'} onChange={() => setMethod('paymob')} />
                  <span className="co-method-ico"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 10h19M6.5 15h4" /></svg></span>
                  <span className="co-method-txt"><b>{t('pay.method.card')}</b>{!cfg.paymob_enabled && <small>{t('pay.method.cardSoon')}</small>}</span>
                </label>
                <label className={'co-method' + (method === 'bank_transfer' ? ' on' : '') + (cfg.bank_transfer_enabled ? '' : ' off')}>
                  <input type="radio" name="m" disabled={!cfg.bank_transfer_enabled} checked={method === 'bank_transfer'} onChange={() => setMethod('bank_transfer')} />
                  <span className="co-method-ico"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" /></svg></span>
                  <span className="co-method-txt"><b>{t('pay.method.bank')}</b>{!cfg.bank_transfer_enabled && <small>{t('pay.method.bankOff')}</small>}</span>
                </label>
              </div>
              {method && (cfg.paymob_enabled || cfg.bank_transfer_enabled) && <p className="co-method-hint">{method === 'paymob' ? t('pay.method.cardSub') : t('pay.method.bankSub')}</p>}

              {method === 'paymob' && (
                <>
                  <div className="co-section-title">{t('pay.card.title')}<span className="co-enc-pill">{LOCK}<span>{t('pay.trust.enc')}</span></span></div>
                  <CardFields t={t} card={card} setCard={setCard} saved={(cfg && cfg.saved_cards) || []} selected={savedSel} onSelect={setSavedSel} errors={errMap} valid={validMap} onTouch={touch} />
                </>
              )}

              <div className="co-section-title">{t('pay.buyer.title')}</div>
              <div className={fcls('name')}>
                <label htmlFor="coName">{t('pay.buyer.name')}</label>
                <input id="coName" type="text" autoComplete="name" {...ariaFor('name', 'coName')} value={form.name} onBlur={() => touch('name')} onChange={(e) => set({ name: e.target.value })} />
                <div className="err-text" id="coNameErr" role="alert">{msg('name')}</div>
              </div>
              <div className={fcls('email')}>
                <label htmlFor="coEmail">{t('pay.buyer.email')}</label>
                <input id="coEmail" type="email" autoComplete="email" {...ariaFor('email', 'coEmail')} value={form.email} onBlur={() => touch('email')} onChange={(e) => set({ email: e.target.value })} />
                <div className="err-text" id="coEmailErr" role="alert">{msg('email')}</div>
              </div>
              <div className="co-row2">
                <div className="co-field">
                  <label htmlFor="coCountry">{t('pay.buyer.country')}</label>
                  <select id="coCountry" value={country} onChange={(e) => { setCountry(e.target.value); setCcy(currencyForCountry(e.target.value) in fx || currencyForCountry(e.target.value) === 'USD' ? currencyForCountry(e.target.value) : 'USD'); }}>
                    {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                  </select>
                </div>
                {method === 'paymob' && (
                  <div className={fcls('phone')}>
                    <label htmlFor="coPhone">{t('pay.buyer.phone')}</label>
                    <input id="coPhone" type="tel" autoComplete="tel" {...ariaFor('phone', 'coPhone')} value={form.phone} onBlur={() => touch('phone')} onChange={(e) => set({ phone: e.target.value })} />
                    <div className="err-text" id="coPhoneErr" role="alert">{msg('phone')}</div>
                  </div>
                )}
              </div>

              <label className={'co-terms' + (show('terms') ? ' invalid' : '')}>
                <input id="coTerms" type="checkbox" checked={form.terms} {...ariaFor('terms', 'coTerms')} onChange={(e) => { set({ terms: e.target.checked }); touch('terms'); }} />
                <i className="co-box" aria-hidden="true" /><span>{consentMain}</span>
              </label>
              {show('terms') && <div className="co-err-line" id="coTermsErr" role="alert">{msg('terms')}</div>}
              <label className={'co-terms' + (show('start') ? ' invalid' : '')}>
                <input id="coStart" type="checkbox" checked={form.start} {...ariaFor('start', 'coStart')} onChange={(e) => { set({ start: e.target.checked }); touch('start'); }} />
                <i className="co-box" aria-hidden="true" /><span>{t('pay.consent.start')}</span>
              </label>
              {show('start') && <div className="co-err-line" id="coStartErr" role="alert">{msg('start')}</div>}
              </fieldset>
              <div className={'checkout-error' + (err ? ' show' : '')} role="alert">{err}</div>

              <button type="submit" className={'checkout-pay-btn' + (busy ? ' loading' : '')} disabled={busy || !method} aria-busy={busy}>
                <span className="co-spinner"></span>
                {!busy && <span className="co-pay-lock" aria-hidden="true">{LOCK}</span>}
                <span className="co-pay-label" aria-live="polite">{payLabel}</span>
              </button>
              {method && <SecurityBadges t={t} method={method} />}
              {method === 'paymob' && <div className="co-secure-note">{LOCK}<span>{t('pay.secure')}</span></div>}
            </form>
          </div>
        </div>
      )}
    </>
  );
}
