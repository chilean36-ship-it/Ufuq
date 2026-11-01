import { useEffect } from 'react';
import { useCabinetI18n } from '../../context/CabinetI18nContext';

const LABELS = { tasksLink: 'Tasks', examLink: 'Exam', progressLink: 'Progress' };

/**
 * Port of #comingSoonOverlay. The original keeps its Tasks/Exam/Progress code fully built but
 * gates the sidebar link behind this modal via a `SECTIONS_COMING_SOON` flag — a temporary
 * product decision, not a sign the feature is unfinished (its own comment says "to re-enable a
 * section, just set its flag back to false"). Toggle `SECTIONS_COMING_SOON` in Dashboard.jsx.
 */
export default function ComingSoonModal({ linkId, onClose }) {
  const { t } = useCabinetI18n();
  const open = !!linkId;

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div className={'group-overlay' + (open ? ' open' : '')} id="comingSoonOverlay" aria-hidden={!open}
         onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="group-modal" style={{ maxWidth: '340px' }}>
        <button type="button" className="group-close" id="comingSoonCloseBtn" aria-label={t('Close')} onClick={onClose}>&times;</button>
        <h3 className="group-modal-title" id="comingSoonTitle">{t(LABELS[linkId] || 'Coming soon')}</h3>
        <p className="group-modal-sub" id="comingSoonSub">{t("This section isn't available yet — check back soon.")}</p>
        <button type="button" className="btn-join-group" id="comingSoonOkBtn" style={{ width: '100%' }} onClick={onClose}>OK</button>
      </div>
    </div>
  );
}
