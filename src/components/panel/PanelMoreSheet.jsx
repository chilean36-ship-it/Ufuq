import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useCabinetI18n } from '../../context/CabinetI18nContext';
import { ufuqSignOut } from '../../lib/auth';
import { outRoute } from '../../lib/panelAccess';

const s = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
const TONES = ['gold', 'violet', 'teal', 'rose', 'sky', 'amber'];

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
              <span className="pms-ic">{n.icon}</span>
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
