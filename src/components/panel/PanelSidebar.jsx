import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCabinetI18n } from '../../context/CabinetI18nContext';
import { ufuqSignOut } from '../../lib/auth';
import '../../styles/sidebar-active.css';

const ic = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
const Chevron = () => <svg className="sb-chevron" {...ic} strokeWidth={2}><path d="M6 9l6 6 6-6" /></svg>;
const BackIcon = () => <svg {...ic}><path d="M12 4L3 8l9 4 9-4-9-4z" /><path d="M7 10v5c0 1.5 2.5 3 5 3s5-1.5 5-3v-5" /></svg>;
const ProfileIcon = () => <svg {...ic}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" /></svg>;
const OutIcon = () => <svg {...ic}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>;

/**
 * Sidebar shared by the Admin and Teacher panels — same behaviour as the student dashboard's sidebar:
 * sections open / close, the edge button collapses the bar to icons, and the nav list scrolls on its own.
 *
 * nav = [{ page, label, icon }                                   → a plain link
 *        { id, label, icon, items: [{ page, label }, …] }]       → a section that opens and closes
 */
export default function PanelSidebar({ variant = 'admin', brandSuffix, tag, nav, page, onNavigate, collapsed, onToggleCollapsed, onExpand, open, isMobile, studentLabel = 'Student panel', showStudentLink = true }) {
  const { t } = useCabinetI18n();
  const navigate = useNavigate();
  const [openIds, setOpenIds] = useState({});
  const iconOnly = collapsed && !isMobile;

  // The section that holds the current page is always open, so the active link is never hidden.
  useEffect(() => {
    const sec = nav.find((n) => n.items && n.items.some((i) => i.page === page));
    if (sec) setOpenIds((cur) => (cur[sec.id] ? cur : { ...cur, [sec.id]: true }));
  }, [page, nav]);

  const go = (target) => (e) => { e.preventDefault(); onNavigate(target); };
  const keyGo = (fn) => (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(e); } };
  const toggle = (id) => setOpenIds((cur) => ({ ...cur, [id]: !cur[id] }));
  const signOut = async () => { await ufuqSignOut(); navigate('/index', { replace: true }); };

  return (
    <aside className={'sidebar psb psb-' + variant + ' usb' + (open ? ' open' : '') + (iconOnly ? ' collapsed' : '')} id="sidebar">
      <div className="sb-brand">
        <img className="sb-emblem" src="/assets/images/logo-mark.png" alt="" />
        <div className="sb-brand-text">
          <div className="sb-name">Ufuq{brandSuffix ? <> <span>{brandSuffix}</span></> : null}</div>
          {tag ? <div className="sb-tag">{tag}</div> : null}
        </div>
        <button type="button" className="sb-collapse-btn" onClick={onToggleCollapsed} aria-expanded={!collapsed}
                aria-label={t(collapsed ? 'Expand menu' : 'Collapse menu')} title={t(collapsed ? 'Expand menu' : 'Collapse menu')}>
          <svg {...ic} strokeWidth={2.4}><path d="M15 18l-6-6 6-6" /></svg>
        </button>
      </div>

      <nav className="sb-nav" aria-label={tag || 'Menu'}>
        {nav.map((n) => {
          if (!n.items) {
            const active = page === n.page;
            return (
              <div className="sb-item" key={n.page}>
                <a href="#" className={'sb-link' + (active ? ' active' : '')} title={iconOnly ? t(n.label) : undefined} aria-current={active ? 'page' : undefined} onClick={go(n.page)}>
                  <span className="sb-icon">{n.icon}</span>
                  <span className="sb-label">{t(n.label)}</span>
                </a>
              </div>
            );
          }
          const isOpen = !!openIds[n.id];
          const hasActive = n.items.some((i) => i.page === page);
          const sectionBadge = n.items.reduce((sum, i) => sum + (i.badge || 0), 0);
          return (
            <div className={'sb-item' + (isOpen ? ' open' : '')} key={n.id}>
              <a href="#" className={'sb-link' + (hasActive ? ' active' : '')} title={iconOnly ? t(n.label) : undefined} aria-expanded={isOpen}
                 onClick={(e) => { e.preventDefault(); if (iconOnly) { onExpand(); setOpenIds((cur) => ({ ...cur, [n.id]: true })); return; } toggle(n.id); }}>
                <span className="sb-icon">{n.icon}</span>
                <span className="sb-label">{t(n.label)}</span>
                {!isOpen && sectionBadge > 0 && <span className="sb-badge" title={t('Waiting for your review')}>{sectionBadge > 99 ? '99+' : sectionBadge}</span>}
                <Chevron />
              </a>
              <div className="sb-submenu">
                {n.items.map((i) => (
                  <a key={i.page} href="#" className={'sb-sublink' + (page === i.page ? ' active' : '')} tabIndex={isOpen ? 0 : -1} onClick={go(i.page)}>
                    <span>{t(i.label)}</span>
                    {i.badge > 0 && <span className="sb-badge" title={t('Waiting for your review')}>{i.badge > 99 ? '99+' : i.badge}</span>}
                  </a>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="sb-foot">
        {showStudentLink && (
          <a href="/dashboard" className="sb-link" title={iconOnly ? t(studentLabel) : undefined}
             onClick={(e) => { e.preventDefault(); navigate('/dashboard'); }}>
            <span className="sb-icon"><BackIcon /></span><span className="sb-label">{t(studentLabel)}</span>
          </a>
        )}
        <a href="#" className={'sb-link' + (page === 'profile' ? ' active' : '')} title={iconOnly ? t('Profile') : undefined} onClick={go('profile')}>
          <span className="sb-icon"><ProfileIcon /></span><span className="sb-label">{t('Profile')}</span>
        </a>
        <a href="#" className="sb-link sb-signout" id="signOutLink" title={iconOnly ? t('Sign out') : undefined} role="button" tabIndex={0}
           onClick={(e) => { e.preventDefault(); signOut(); }} onKeyDown={keyGo(signOut)}>
          <span className="sb-icon"><OutIcon /></span><span className="sb-label">{t('Sign out')}</span>
        </a>
      </div>
    </aside>
  );
}
