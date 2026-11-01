import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import tokensCss from '../../styles/tokens.css?inline';
import pageCss from './checkout.css?inline';
import PageStyle from '../../components/PageStyle';
import LangSelect from '../../components/LangSelect';
import { useI18n } from '../../context/I18nContext';
import { getInvoice, formatMoney, minorToMajor, fill } from '../../lib/payments';

const LOCALE = { EN: 'en', UZ: 'uz', RU: 'ru', AR: 'ar' };

/** Printable tax invoice (browser "Save as PDF"). Numbers come from the stored order, never recomputed. */
export default function Invoice() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const locale = LOCALE[lang] || 'en';
  const [inv, setInv] = useState(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => { document.title = 'Ufuq — Invoice'; }, []);
  useEffect(() => {
    getInvoice(id).then(setInv).catch(() => setMissing(true));
  }, [id]);

  const d = (v) => (v ? new Date(v).toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' }) : '—');
  const money = (c) => formatMoney(minorToMajor(c, inv.currency), inv.currency, locale);
  const methodLabel = inv && (inv.method === 'paymob' ? t('pay.invoice.methodCard') : inv.method === 'bank_transfer' ? t('pay.invoice.methodBank') : t('pay.invoice.methodAdmin'));
  const net = inv ? inv.total_cents - inv.tax_cents : 0;

  return (
    <>
      <PageStyle css={tokensCss} /><PageStyle css={pageCss} />
      <div className="co-topbar no-print">
        <div className="co-topbar-left">
          <Link className="co-back-arrow" to="/dashboard#billing" aria-label={t('pay.invoice.back')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>
          </Link>
          <Link className="co-brand" to="/dashboard"><img src="/assets/images/logo-checkout.png" alt="Ufuq" width="16" height="28" />Ufuq</Link>
        </div>
        <div className="co-topbar-right"><LangSelect variant="checkout" /></div>
      </div>

      {missing && <div className="co-narrow"><p className="co-muted">{t('pay.invoice.notFound')}</p></div>}
      {inv && (
        <div className="co-invoice-wrap">
          <button type="button" className="checkout-pay-btn co-print no-print" onClick={() => window.print()}>{t('pay.invoice.print')}</button>
          <article className="co-invoice">
            <header>
              <div><h1>{t('pay.invoice.title')}</h1>{inv.status === 'refunded' && <span className="co-badge">{t('pay.invoice.refunded')}</span>}</div>
              <dl>
                <dt>{t('pay.invoice.number')}</dt><dd>{inv.invoice_no}</dd>
                <dt>{t('pay.invoice.date')}</dt><dd>{d(inv.issued_at)}</dd>
                <dt>{t('pay.invoice.ref')}</dt><dd className="mono">{inv.reference}</dd>
              </dl>
            </header>
            <section className="co-inv-parties">
              <div>
                <h3>{t('pay.invoice.seller')}</h3>
                <p><b>{inv.seller.name || '—'}</b></p>
                {inv.seller.address && <p>{inv.seller.address}</p>}
                {inv.seller.country && <p>{inv.seller.country}</p>}
                {inv.seller.tax_id && <p>{t('pay.invoice.taxId')}: {inv.seller.tax_id}</p>}
                {inv.seller.email && <p>{inv.seller.email}</p>}
              </div>
              <div>
                <h3>{t('pay.invoice.buyer')}</h3>
                <p><b>{inv.buyer.name}</b></p>
                <p>{inv.buyer.email}</p>
                {inv.buyer.country && <p>{inv.buyer.country}</p>}
              </div>
            </section>
            <table className="co-inv-table">
              <thead><tr><th>{t('pay.invoice.item')}</th><th>{t('pay.invoice.period')}</th><th className="r">{inv.currency}</th></tr></thead>
              <tbody>
                <tr>
                  <td>{fill(t('pay.invoice.desc'), { plan: inv.item.plan })}</td>
                  <td>{d(inv.item.from)} – {d(inv.item.to)}</td>
                  <td className="r">{money(net)}</td>
                </tr>
              </tbody>
              <tfoot>
                {inv.tax_cents > 0 && <tr><td colSpan="2">{t('pay.invoice.net')}</td><td className="r">{money(net)}</td></tr>}
                {inv.tax_cents > 0 && <tr><td colSpan="2">{inv.tax_label || 'VAT'} {Number(inv.tax_rate)}%</td><td className="r">{money(inv.tax_cents)}</td></tr>}
                <tr className="tot"><td colSpan="2">{t('pay.invoice.total')}</td><td className="r">{money(inv.total_cents)}</td></tr>
              </tfoot>
            </table>
            <p className="co-inv-meta">{t('pay.invoice.method')}: {methodLabel}</p>
            {inv.display_currency && inv.display_currency !== inv.currency && (
              <p className="co-inv-meta">{t('pay.invoice.shown')}: {formatMoney(Number(inv.display_amount), inv.display_currency, locale)}</p>
            )}
            {inv.tax_note && <p className="co-inv-note">{inv.tax_note}</p>}
          </article>
        </div>
      )}
    </>
  );
}
