import { useEffect } from 'react';
import { useCabinetI18n } from '../../context/CabinetI18nContext';

/** Shown when "Join Class" is clicked but no session is live right now (port of #noClassOverlay). */
export default function NoClassModal({ open, onClose, nextInfo, title }) {
  const { t } = useCabinetI18n();
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div className={'no-class-overlay' + (open ? ' open' : '')} id="noClassOverlay" aria-hidden={!open}
         onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="no-class-modal" role="dialog" aria-modal="true" aria-label={title || t('No class right now')}>
        <button type="button" className="no-class-close" aria-label={t('Close')} onClick={onClose}>&times;</button>
        <div className="no-class-icon">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path className="nc-hand nc-hand-m" d="M12 12V6.5" /><path className="nc-hand nc-hand-h" d="M12 12l3.2 2" /></svg>
        </div>
        <h3>{title || t('No class right now')}</h3>
        <p>{nextInfo || t("Your next class hasn't started yet.")}</p>
        <button type="button" className="plan-cta" onClick={onClose}>{t('Got it')}</button>
      </div>
    </div>
  );
}
