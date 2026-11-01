import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import tokensCss from '../../styles/tokens.css?inline';
import pageCss from './checkout.css?inline';
import PageStyle from '../../components/PageStyle';
import LangSelect from '../../components/LangSelect';
import { useI18n } from '../../context/I18nContext';
import { fetchOrder, fill } from '../../lib/payments';

const LOCALE = { EN: 'en', UZ: 'uz', RU: 'ru', AR: 'ar' };

/** Where Paymob sends the browser back to. The webhook (not this page) grants access; here we just wait for it and show the outcome. */
export default function CheckoutResult() {
  const { t, lang } = useI18n();
  const [params] = useSearchParams();
  const id = params.get('order');
  const [order, setOrder] = useState(null);
  const [tries, setTries] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const timer = useRef(null);

  useEffect(() => { document.title = 'Ufuq — Payment'; }, []);
  useEffect(() => {
    if (!id) return undefined;
    let alive = true;
    const tick = async (n) => {
      let o = null;
      try { o = await fetchOrder(id); } catch (e) { /* retry */ }
      if (!alive) return;
      setOrder(o); setTries(n);
      const final = o && ['paid', 'failed', 'cancelled', 'rejected', 'refunded'].includes(o.status);
      if (!final && n < 30) timer.current = setTimeout(() => tick(n + 1), 2500);
    };
    tick(1);
    return () => { alive = false; clearTimeout(timer.current); };
  }, [id, attempt]);

  const status = order && order.status;
  const kind = status === 'paid' ? 'ok' : ['failed', 'cancelled', 'rejected'].includes(status) ? 'failed' : tries >= 30 ? 'waiting' : 'checking';
  const date = order && order.ends_at ? new Date(order.ends_at).toLocaleDateString(LOCALE[lang] || 'en', { year: 'numeric', month: 'long', day: 'numeric' }) : '';

  return (
    <>
      <PageStyle css={tokensCss} /><PageStyle css={pageCss} />
      <div className="co-topbar">
        <div className="co-topbar-left"><Link className="co-brand" to="/dashboard"><img src="/assets/images/logo-checkout.png" alt="Ufuq" width="16" height="28" />Ufuq</Link></div>
        <div className="co-topbar-right"><LangSelect variant="checkout" /></div>
      </div>
      <div className="co-success-wrap show" aria-live="polite">
        <div className={'co-check' + (kind === 'failed' ? ' bad' : '') + (kind === 'checking' ? ' wait' : '')}>
          {kind === 'ok' && <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>}
          {kind === 'failed' && <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>}
          {(kind === 'checking' || kind === 'waiting') && <span className="co-spinner" style={{ display: 'inline-block' }} />}
        </div>
        <h1>{t(kind === 'ok' ? 'pay.result.ok' : kind === 'failed' ? 'pay.result.failed' : 'pay.result.checking')}</h1>
        <p>
          {kind === 'ok' && fill(t('pay.result.okSub'), { date })}
          {kind === 'failed' && t('pay.result.failedSub')}
          {kind === 'checking' && t('pay.result.checkingSub')}
          {kind === 'waiting' && t('pay.result.waiting')}
        </p>
        <div className="co-result-actions">
          {kind === 'ok' && <>
            <Link className="co-success-btn" to="/dashboard"><span>{t('pay.result.dashboard')}</span></Link>
            {order && order.invoice_no && <Link className="co-success-link" to={`/invoice/${order.id}`}>{t('pay.result.invoice')}</Link>}
          </>}
          {kind === 'failed' && <Link className="co-success-btn" to="/checkout"><span>{t('pay.result.retry')}</span></Link>}
          {kind === 'waiting' && <button type="button" className="co-success-btn" onClick={() => { setTries(0); setAttempt((a) => a + 1); }}><span>{t('pay.result.again')}</span></button>}
          {kind === 'waiting' && <Link className="co-success-link" to="/dashboard#billing">{t('pay.result.billing')}</Link>}
        </div>
      </div>
    </>
  );
}
