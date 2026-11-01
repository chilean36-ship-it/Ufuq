/* Phase 3 — trust & security visuals. Only claims that are true for this checkout:
   TLS in transit, card data handled by the PCI DSS-compliant payment partner (never by Ufuq), manual verification for bank transfers. */

const ico = (children) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
export const ICON_LOCK = ico(<><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /><path d="M12 14v2" /></>);
export const ICON_SHIELD = ico(<><path d="M12 3l8 3v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></>);
export const ICON_EYE_OFF = ico(<><path d="M3 3l18 18" /><path d="M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 8.5 4 9.5 6a14 14 0 0 1-2.6 3.4M6.5 7.6A14.6 14.6 0 0 0 2.5 12c1 2 4.5 6 9.5 6 1.5 0 2.8-.4 4-1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>);
export const ICON_CHECK_DOC = ico(<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 14l2 2 4-4" /></>);

export default function SecurityBadges({ t, method }) {
  const items = method === 'paymob'
    ? [['ssl', ICON_LOCK], ['pci', ICON_SHIELD], ['nostore', ICON_EYE_OFF]]
    : [['ssl', ICON_LOCK], ['manual', ICON_CHECK_DOC]];
  return (
    <div className="co-trustwrap">
      <ul className="co-trustb-list" aria-label={t('pay.trust.title')}>
        {items.map(([k, icon]) => (
          <li key={k} className="co-trustb">
            <span className="co-trustb-ico">{icon}</span>
            <span className="co-trustb-txt"><b>{t(`pay.trust.${k}`)}</b><small>{t(`pay.trust.${k}Sub`)}</small></span>
          </li>
        ))}
      </ul>
      {method === 'paymob' && (
        <div className="co-accepts">
          <span>{t('pay.trust.accepts')}</span>
          <span className="ci ci-visa">VISA</span>
          <span className="ci ci-mc"><i /><i /></span>
          <span className="co-accepts-sep" aria-hidden="true">·</span>
          <span>{t('pay.trust.processedBy')}</span>
        </div>
      )}
    </div>
  );
}
