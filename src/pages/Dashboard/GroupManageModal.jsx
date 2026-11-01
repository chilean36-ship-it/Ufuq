import { lockScroll, unlockScroll } from '../../lib/scrollLock';
import { useEffect, useState } from 'react';
import { useCabinetI18n } from '../../context/CabinetI18nContext';
import { gcCopyText } from './GroupChat/chatUtils';

const Ico = ({ children, size = 20 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

/**
 * "Manage Group" dialog: group summary (name, members, copyable code) + join another group / leave.
 * Leaving asks for confirmation inside the dialog (no browser confirm()).
 */
export default function GroupManageModal({ open, onClose, onJoinAnother, onLeave, groupName, groupCode, memberCount }) {
  const { t } = useCabinetI18n();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => { if (!open) { setConfirmLeave(false); setCopied(false); } }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    lockScroll();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { unlockScroll(); window.removeEventListener('keydown', onKey); };
  }, [open, onClose]);
  useEffect(() => {
    if (!copied) return undefined;
    const id = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(id);
  }, [copied]);

  const copyCode = async () => { if (!groupCode) return; await gcCopyText(String(groupCode)); setCopied(true); };
  const initial = (groupName || 'G').trim().charAt(0).toUpperCase();

  return (
    <div className={'group-manage-overlay' + (open ? ' open' : '')} id="groupManageOverlay" aria-hidden={!open}
         onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="group-manage-modal" role="dialog" aria-modal="true" aria-label={t('Manage Group')}>
        <button type="button" className="group-manage-close" id="groupManageClose" aria-label={t('Close')} onClick={onClose}>
          <Ico size={15}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></Ico>
        </button>

        <div className="gm-hero">
          <div className="gm-hero-avatar" aria-hidden="true">{initial}</div>
          <div className="gm-hero-text">
            <div className="gm-eyebrow">{t('Manage Group')}</div>
            <h3 className="gm-hero-name">{groupName || '—'}</h3>
          </div>
        </div>

        <div className="gm-stats">
          <div className="gm-stat">
            <span className="gm-stat-label">{t('Members')}</span>
            <span className="gm-stat-value">{memberCount == null ? '—' : memberCount}</span>
          </div>
          <button type="button" className={'gm-stat gm-stat-code' + (copied ? ' is-copied' : '')} onClick={copyCode} disabled={!groupCode}
                  title={t('Copy code')} aria-label={t('Copy code')}>
            <span className="gm-stat-label">{copied ? t('Code copied') : t('Group code')}</span>
            <span className="gm-stat-value gm-code">
              {groupCode || '—'}
              <span className="gm-copy-ico">
                {copied
                  ? <Ico size={14}><polyline points="20 6 9 17 4 12" /></Ico>
                  : <Ico size={14}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></Ico>}
              </span>
            </span>
          </button>
        </div>

        {!confirmLeave ? (
          <div className="group-manage-actions">
            <button type="button" className="gm-action btn-join-another" id="joinAnotherGroupBtn" onClick={onJoinAnother}>
              <span className="gm-action-ico"><Ico><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 11h-6M19 8v6" /></Ico></span>
              <span className="gm-action-text">
                <span className="gm-action-title">{t('Join another group')}</span>
                <span className="gm-action-sub">{t('Enter a group code to join one more group')}</span>
              </span>
              <span className="gm-action-chev"><Ico size={16}><polyline points="9 18 15 12 9 6" /></Ico></span>
            </button>
            <button type="button" className="gm-action btn-leave-group-action" id="leaveGroupActionBtn" onClick={() => setConfirmLeave(true)}>
              <span className="gm-action-ico"><Ico><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></Ico></span>
              <span className="gm-action-text">
                <span className="gm-action-title">{t('Leave group')}</span>
                <span className="gm-action-sub">{t('You will lose access to this group\'s schedule and chat')}</span>
              </span>
              <span className="gm-action-chev"><Ico size={16}><polyline points="9 18 15 12 9 6" /></Ico></span>
            </button>
          </div>
        ) : (
          <div className="gm-confirm" role="alertdialog" aria-live="polite">
            <div className="gm-confirm-ico"><Ico size={22}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></Ico></div>
            <div className="gm-confirm-title">{t('Leave group')}?</div>
            <p className="gm-confirm-text">{t('Leave this group? You can rejoin any time with a group code.')}</p>
            <div className="gm-confirm-btns">
              <button type="button" className="gm-btn gm-btn-ghost" onClick={() => setConfirmLeave(false)}>{t('Cancel')}</button>
              <button type="button" className="gm-btn gm-btn-danger" id="leaveGroupConfirmBtn" onClick={onLeave}>{t('Yes, leave')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
