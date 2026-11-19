import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useCabinetI18n } from '../../context/CabinetI18nContext';
import { ufuqSignOut } from '../../lib/auth';
import { outRoute } from '../../lib/panelAccess';

const s = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
const TONES = ['gold', 'violet', 'teal', 'rose', 'sky', 'amber'];
// one icon per page (the admin nav gives a whole section the same icon, which made Group / Students / Exams look alike)
const PAGE_ICON = {
  overview: <svg {...s}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>,
  groups: <svg {...s}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></svg>,
  students: <svg {...s}><path d="M22 10L12 5 2 10l10 5 10-5z" /><path d="M6 12v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5" /></svg>,
  exams: <svg {...s}><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>,
  announcements: <svg {...s}><path d="M3 11l18-5v12L3 14v-3z" /><path d="M11.6 16.8a2 2 0 01-3.6 1.2" /></svg>,
  payments: <svg {...s}><rect x="2" y="5" width="20" height="14" rx="3" /><path d="M2 10h20M6 15h4" /></svg>,
  landing: <svg {...s}><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="2" /><path d="M21 16l-5-5-8 8" /></svg>,
  admins: <svg {...s}><path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3z" /><path d="M9 12l2 2 4-4" /></svg>,
  resources: <svg {...s}><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></svg>,
  attendance: <svg {...s}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18M9 16l2 2 4-4" /></svg>,
  tasks: <svg {...s}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>,
  materials: <svg {...s}><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>,
  media: <svg {...s}><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M10 9l5 3-5 3V9z" /></svg>,
  calendar: <svg {...s}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>,
  slots: <svg {...s}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  hifz: <svg {...s}><path d="M12 6.5C10.5 5 8 4.5 4 4.5v14c4 0 6.5.5 8 2 1.5-1.5 4-2 8-2v-14c-4 0-6.5.5-8 2zM12 6.5v14" /></svg>,
};

/**
 * "Menu" of the admin / teacher panels inside the Ufuq app: a sheet that rises from the bottom with every page as a coloured
 * tile (instead of the website's side drawer), then the account actions (profile, switch panel, student app, sign out).
 */
export default function PanelMoreSheet({ open, onClose, nav, page, onNavigate, onProfile, switchItem, studentItem, name, roleLabel, avatarUrl }) {
  const { t } = useCabinetI18n();
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const signOut = async () => { onClose(); await ufuqSignOut(); navigate(outRoute('/index'), { replace: true }); };
  const go = (p) => { onNavigate(p); onClose(); };

  return createPortal(
    <div className={'pms' + (open ? ' open' : '')} aria-hidden={open ? 'false' : 'true'}>
      <div className="pms-scrim" onClick={onClose} />
      <div className="pms-sheet" role="dialog" aria-modal="true" aria-label={t('Menu')}>
        <div className="pms-grab" aria-hidden="true" />
        <div className="pms-me">
          <span className="pms-av">{avatarUrl ? <img src={avatarUrl} alt="" /> : (name || '?').trim().charAt(0).toUpperCase()}</span>
          <span className="pms-who"><b>{name || ''}</b><small>{roleLabel || ''}</small></span>
          <button type="button" className="pms-x" onClick={onClose} aria-label={t('Close')}>
            <svg {...s} strokeWidth={2.4}><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div className="pms-grid">
          {nav.map((n, i) => (
            <button type="button" key={n.page} className={'pms-tile ' + TONES[i % TONES.length] + (n.page === page ? ' on' : '')} style={{ '--k': i }} onClick={() => go(n.page)}>
              <span className="pms-ic">{PAGE_ICON[n.page] || n.icon}</span>
              <span className="pms-l">{t(n.label)}</span>
            </button>
          ))}
        </div>
        <div className="pms-rows">
          <button type="button" className="pms-row" onClick={() => { onClose(); onProfile(); }}>
            <svg {...s}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" /></svg><span>{t('Profile')}</span>
          </button>
          {switchItem && (
            <button type="button" className="pms-row" onClick={() => { onClose(); switchItem.onSelect(); }}>
              <svg {...s}><path d="M7 7h11l-3-3M17 17H6l3 3" /></svg><span>{switchItem.label}</span>
            </button>
          )}
          {studentItem && (
            <a className="pms-row" href={studentItem.href} onClick={onClose}>
              <svg {...s}><path d="M12 4L3 8l9 4 9-4-9-4z" /><path d="M7 10v5c0 1.5 2.5 3 5 3s5-1.5 5-3v-5" /></svg><span>{studentItem.label}</span>
            </a>
          )}
          <button type="button" className="pms-row danger" onClick={signOut}>
            <svg {...s}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /></svg><span>{t('Sign out')}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
