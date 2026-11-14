import { usePanel } from '../../components/panel/PanelContext';

/** Inline "not yet ported" placeholder for a panel page — sits inside .content, unlike the full-page <Pending/>. */
export default function PanelPending({ titleKey, descKey }) {
  const { t } = usePanel();
  return (
    <section className="page active">
      <div className="page-head"><h2>{t(titleKey)}</h2></div>
      <div className="empty-block">{t('This section is still being migrated to the new dashboard — coming soon.')}</div>
    </section>
  );
}
