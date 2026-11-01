import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useCabinetI18n } from '../../context/CabinetI18nContext';
import { ufuqSignOut } from '../../lib/auth';
import '../../styles/sidebar-active.css';
import useSidebarCollapsed from '../../hooks/useSidebarCollapsed';

const ICONS = {
  home: <path d="M3 11l9-8 9 8M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10" />,
  learning: <><path d="M12 4L3 8l9 4 9-4-9-4z" /><path d="M7 10v5c0 1.5 2.5 3 5 3s5-1.5 5-3v-5" /></>,
  library: <path d="M4 19.5A2.5 2.5 0 016.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />,
  list: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></>,
  profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9c.14.31.22.65.22 1H21a2 2 0 010 4h-.09c-.14.31-.22.65-.22 1z" /></>,
  signout: <><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></>,
  collapse: <path d="M15 18l-6-6 6-6" />,
};
const Icon = ({ name, w = 24, h = 24, sw = 1.8 }) => (
  <svg viewBox="0 0 24 24" width={w} height={h} fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    {ICONS[name]}
  </svg>
);

/**
 * Student-cabinet sidebar (port of the <aside class="sidebar"> shared by
 * profile.html / dashboard.html). "My Learning" and "Library" open as
 * in-page submenus; every entry keeps its i18n label live.
 */
export default function Sidebar({ active, role }) {
  const { t } = useCabinetI18n();
  const [openItem, setOpenItem] = useState(null);
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  const toggle = (id) => setOpenItem((cur) => (cur === id ? null : id));

  // Teachers/admins have no student cabinet: give them only what makes sense here.
  if (role === 'teacher' || role === 'admin') {
    const panel = role === 'admin' ? '/admin' : '/teacher';
    return (
      <aside className="sidebar usb" id="sidebar">
        <div className="sb-brand">
          <Link to={panel} style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
            <div className="sb-emblem"><img src="/assets/images/logo-mark.png" alt="Ufuq logo" /></div>
            <div className="sb-name">Ufuq</div>
          </Link>
        </div>
        <nav className="sb-nav">
          <div className="sb-item">
            <Link className="sb-link" data-label="Panel" to={panel}>
              <span className="sb-icon"><Icon name="home" /></span>
              <span className="sb-label">{t(role === 'admin' ? 'Admin panel' : 'Teacher panel')}</span>
            </Link>
          </div>
          <div className="sb-item">
            <Link className={'sb-link' + (active === 'profile' ? ' active' : '')} data-label="Profile" to="/profile">
              <span className="sb-icon"><Icon name="profile" /></span>
              <span className="sb-label">{t('Profile')}</span>
            </Link>
          </div>
        </nav>
        <div className="sb-foot"><SignOutLink /></div>
      </aside>
    );
  }

  return (
    <aside className={'sidebar usb' + (collapsed ? ' collapsed' : '')} id="sidebar">
      <div className="sb-brand">
        <Link to="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
          <div className="sb-emblem"><img src="/assets/images/logo-mark.png" alt="Ufuq logo" /></div>
          <div className="sb-name">Ufuq</div>
        </Link>
        <button type="button" className="sb-collapse-btn" id="collapseBtn" aria-label={t(collapsed ? 'Expand sidebar' : 'Collapse sidebar')} aria-expanded={!collapsed} onClick={toggleCollapsed}>
          <Icon name="collapse" w={undefined} h={undefined} sw={2} />
        </button>
      </div>

      <nav className="sb-nav">
        <div className="sb-item">
          <Link className={'sb-link' + (active === 'home' ? ' active' : '')} data-label="Home" to="/dashboard">
            <span className="sb-icon"><Icon name="home" /></span>
            <span className="sb-label">{t('Home')}</span>
          </Link>
        </div>

        <div className={'sb-item' + (openItem === 'learning' ? ' open' : '')} id="learningItem">
          <a className={'sb-link' + (active === 'learning' ? ' active' : '')} data-label="My Learning" onClick={() => toggle('learning')}>
            <span className="sb-icon"><Icon name="learning" /></span>
            <span className="sb-label">{t('My Learning')}</span>
            <svg className="sb-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
          </a>
          <div className="sb-submenu">
            <a className="sb-sublink" href="#">{t('Timetable')}</a>
            <a className="sb-sublink" href="#">{t('Attendance')}</a>
            <a className="sb-sublink" href="#">{t('Progress')}</a>
            <a className="sb-sublink" href="#">{t('Certificates')}</a>
          </div>
        </div>

        <div className={'sb-item' + (openItem === 'library' ? ' open' : '')} id="libraryItem">
          <a className="sb-link" data-label="Library" onClick={() => toggle('library')}>
            <span className="sb-icon"><Icon name="library" /></span>
            <span className="sb-label">{t('Library')}</span>
            <svg className="sb-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
          </a>
          <div className="sb-submenu">
            <a className="sb-sublink" href="#">{t('Stories')}</a>
            <a className="sb-sublink" href="#">{t('Morals')}</a>
            <a className="sb-sublink" href="#">{t('Culture')}</a>
          </div>
        </div>

        <div className="sb-item">
          <a className="sb-link" data-label="My list">
            <span className="sb-icon"><Icon name="list" /></span>
            <span className="sb-label">{t('My list')}</span>
          </a>
        </div>
        <div className="sb-item">
          <Link className={'sb-link' + (active === 'profile' ? ' active' : '')} data-label="Profile" to="/profile">
            <span className="sb-icon"><Icon name="profile" /></span>
            <span className="sb-label">{t('Profile')}</span>
          </Link>
        </div>
      </nav>

      <div className="sb-foot">
        <a className="sb-link" data-label="Settings">
          <span className="sb-icon"><Icon name="settings" /></span>
          <span className="sb-foot-label">{t('Settings')}</span>
        </a>
        <SignOutLink />
      </div>
    </aside>
  );
}

function SignOutLink() {
  const { t } = useCabinetI18n();
  const navigate = useNavigate();
  return (
    <a className="sb-link sb-signout" id="signOutLink" data-label="Sign out"
       onClick={async (e) => { e.preventDefault(); await ufuqSignOut(); navigate('/index', { replace: true }); }}>
      <span className="sb-icon"><Icon name="signout" /></span>
      <span className="sb-foot-label">{t('Sign out')}</span>
    </a>
  );
}
