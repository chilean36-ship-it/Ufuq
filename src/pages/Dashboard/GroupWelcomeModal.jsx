import { lockScroll, unlockScroll } from '../../lib/scrollLock';
import { useEffect } from 'react';
import { useCabinetI18n } from '../../context/CabinetI18nContext';

/** Shown right after joining a group (port of #groupWelcomeOverlay). */
export default function GroupWelcomeModal({ open, groupName, onSee }) {
  const { t } = useCabinetI18n();
  useEffect(() => {
    if (!open) return undefined;
    lockScroll();
    return unlockScroll;
  }, [open]);
  return (
    <div className={'group-welcome-overlay' + (open ? ' open' : '')} id="groupWelcomeOverlay" aria-hidden={!open}>
      <div className="group-welcome-modal" role="dialog" aria-modal="true" aria-label={t('Your Group')}>
        <div className="gw-burst" aria-hidden="true">{Array.from({ length: 16 }, (_, i) => <i key={i} style={{ '--a': (i * 22.5) + 'deg', '--d': (70 + (i % 4) * 22) + 'px', '--s': (5 + (i % 3) * 2) + 'px', animationDelay: (i % 5) * 30 + 'ms' }} />)}</div>
        <div className="group-welcome-brand"><img src="/assets/images/logo-mark.png" alt="Ufuq logo" /><span>Ufuq</span></div>
        <div className="group-welcome-content">
          <div className="gw-sun" aria-hidden="true"><svg viewBox="0 0 64 40" width="64" height="40"><path d="M6 36a26 26 0 0152 0" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="1.5 6" /><circle cx="32" cy="20" r="7" fill="currentColor" /><line x1="2" y1="37" x2="62" y2="37" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".5" /></svg></div>
          <div className="group-welcome-kicker">{t('Your Group')}</div>
          <h2 id="groupWelcomeTitle">{groupName ? `${t('Welcome to')} ${groupName}` : t('Welcome to your group')}</h2>
          <p className="group-welcome-text">{t('Your schedule, classmates and group chat.')}</p>
          <div className="group-welcome-actions"><button type="button" className="group-see-btn" id="groupSeeBtn" onClick={onSee}>{t('See Group')}</button></div>
        </div>
      </div>
    </div>
  );
}
