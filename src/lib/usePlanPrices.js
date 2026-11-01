import { useEffect, useMemo, useState } from 'react';
import { getPaymentsConfig, detectCountry, currencyForCountry, displayAmount, formatMoney } from './payments';

/* Plans + prices for display only. Amounts come from the server (plans, fx rates); the browser never sets a price. */
export default function usePlanPrices(locale = 'en') {
  const [cfg, setCfg] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    getPaymentsConfig()
      .then((c) => { if (alive) setCfg(c); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  const ccy = useMemo(() => currencyForCountry(detectCountry()), []);
  const plans = cfg && Array.isArray(cfg.plans) ? cfg.plans : [];
  const monthly = plans.find((p) => p.id === 'monthly');
  const yearly = plans.find((p) => p.id === 'yearly');
  const savePct = monthly && yearly ? Math.round((1 - (yearly.usd_cents / yearly.months) / monthly.usd_cents) * 100) : 0;
  const price = (usdCents) => {
    const d = displayAmount(usdCents, cfg && cfg.fx, ccy);
    return formatMoney(d.amount, d.currency, locale);
  };
  return { plans, savePct, price, loading: !cfg && !failed, failed };
}
