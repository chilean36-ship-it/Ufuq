import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCabinetI18n } from '../../context/CabinetI18nContext';
import { useDashboardData } from '../../context/DashboardDataContext';
import { ufuqSignOut } from '../../lib/auth';
import '../../styles/sidebar-active.css';

const ICONS = {
  home: <><path d="M3 11l9-8 9 8" /><path d="M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10" /></>,
  learning: <><path d="M12 4L3 8l9 4 9-4-9-4z" /><path d="M7 10v5c0 1.5 2.5 3 5 3s5-1.5 5-3v-5" /></>,
  library: <><path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" /></>,
  certificates: <><circle cx="12" cy="9" r="6" /><path d="m8.5 14-1.5 8 5-3 5 3-1.5-8" /></>,
  profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" /></>,
  admin: <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6M9 15l2 2 4-4" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9c.14.31.22.65.22 1H21a2 2 0 010 4h-.09c-.14.31-.22.65-.22 1z" /></>,
  billing: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>,
  signout: <><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></>,
  collapse: <path d="M15 18l-6-6 6-6" />,
};
const Icon = ({ name }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{ICONS[name]}</svg>
);

const LEARNING_LINKS = [
  { id: 'myGroup', key: 'My Group' },
  { id: 'hifzLive', key: 'Hifz Mushaf' },
  { id: 'tasks', key: 'Tasks' },
  { id: 'exam', key: 'Exam' },
  { id: 'attendance', key: 'Attendance' },
  { id: 'progress', key: 'Progress' },
];

/**
 * Cabinet sidebar for the student dashboard (port of dashboard.html's <aside class="sidebar">).
 * `active` is one of the DashboardShell view ids; `onNavigate(view)` switches the visible view
 * in place, matching the original's single-page "hide all, show one" behaviour.
 */
export default function Sidebar({ active, onNavigate, learningOpen, onToggleLearning, collapsed, onToggleCollapsed, onExpand, mobileOpen }) {
  const { t } = useCabinetI18n();
  const { role, groupData, access } = useDashboardData();
  const isIndividual = !!(groupData && groupData.type === 'individual'); // Hifz Mushaf is for 1:1 groups only
  const navigate = useNavigate();

  const go = (view) => (e) => { e.preventDefault(); onNavigate(view); };
  const isLearningActive = ['myGroup', 'hifzLive', 'tasks', 'exam', 'attendance', 'progress'].includes(active);

  return (
    <aside className={'sidebar usb' + (collapsed ? ' collapsed' : '') + (mobileOpen ? ' mobile-open' : '')} id="sidebar">
      <div className="sb-brand">
        <a href="dashboard" style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }} onClick={go('home')}>
          <div className="sb-emblem"><img src="/assets/images/logo-mark.png" alt="Ufuq logo" /></div>
          <div className="sb-name">Ufuq</div>
        </a>
        <button type="button" className="sb-collapse-btn" id="collapseBtn" aria-label={t(collapsed ? 'Expand sidebar' : 'Collapse sidebar')} aria-expanded={!collapsed} onClick={onToggleCollapsed}>
          <Icon name="collapse" />
        </button>
      </div>

      <nav className="sb-nav">
        <div className="sb-item">
          <a className={'sb-link' + (active === 'home' ? ' active' : '')} data-label={t('Home')} href="#" onClick={go('home')}>
            <span className="sb-icon"><Icon name="home" /></span>
            <span className="sb-label">{t('Home')}</span>
          </a>
        </div>

        <div className={'sb-item' + (learningOpen ? ' open' : '')} id="learningItem">
          <a className={'sb-link' + (isLearningActive ? ' active' : '')} data-label={t('My Learning')} href="#" onClick={(e) => { e.preventDefault(); if (collapsed) { onExpand(); if (!learningOpen) onToggleLearning(); return; } onToggleLearning(); }}>
            <span className="sb-icon"><Icon name="learning" /></span>
            <span className="sb-label">{t('My Learning')}</span>
            <svg className="sb-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
          </a>
          <div className="sb-submenu">
            {LEARNING_LINKS.filter((l) => l.id !== 'hifzLive' || isIndividual).map((l) => (
              <a key={l.id} className={'sb-sublink' + (active === l.id ? ' active' : '')} href="#" id={`${l.id}Link`} onClick={go(l.id)}>
                {t(l.key)}
              </a>
            ))}
          </div>
        </div>

        <div className="sb-item">
          <a className={'sb-link' + (active === 'library' ? ' active' : '')} data-label={t('Library')} href="#" id="libraryLink" onClick={go('library')}>
            <span className="sb-icon"><Icon name="library" /></span>
            <span className="sb-label">{t('Library')}</span>
          </a>
        </div>

        <div className="sb-item">
          <a className={'sb-link' + (active === 'certificates' ? ' active' : '')} data-label={t('Certificates')} href="#" id="certificatesLink" onClick={go('certificates')}>
            <span className="sb-icon"><Icon name="certificates" /></span>
            <span className="sb-label">{t('Certificates')}</span>
          </a>
        </div>

        <div className="sb-item">
          <a className={'sb-link' + (active === 'profile' ? ' active' : '')} data-label={t('Profile')} href="#" id="profileLink" onClick={go('profile')}>
            <span className="sb-icon"><Icon name="profile" /></span>
            <span className="sb-label">{t('Profile')}</span>
          </a>
        </div>

        {(role === 'student' || role === 'admin') && (
          <div className="sb-item">
            <a className={'sb-link' + (active === 'billing' ? ' active' : '')} data-label={t('Billing')} href="#" id="billingLink" onClick={go('billing')}>
              <span className="sb-icon"><Icon name="billing" /></span>
              <span className="sb-label">{t('Billing')}</span>
            </a>
          </div>
        )}

        {(role === 'teacher' || role === 'admin') && (
          <div className="sb-item" id="adminPanelItem">
            <a className="sb-link" href={role === 'admin' ? '/admin' : '/teacher'} id="adminPanelLink">
              <span className="sb-icon"><Icon name="admin" /></span>
              <span className="sb-label" id="adminPanelLabel">{t(role === 'admin' ? 'Admin panel' : 'Teacher panel')}</span>
            </a>
          </div>
        )}
      </nav>

      <div className="sb-foot">
        <a className={'sb-link' + (active === 'settings' ? ' active' : '')} href="#" id="settingsLink" onClick={go('settings')}>
          <span className="sb-icon"><Icon name="settings" /></span>
          <span className="sb-foot-label">{t('Settings')}</span>
        </a>
        <a className="sb-link sb-signout" id="signOutLink"
           onClick={async (e) => { e.preventDefault(); await ufuqSignOut(); navigate('/index', { replace: true }); }}>
          <span className="sb-icon"><Icon name="signout" /></span>
          <span className="sb-foot-label">{t('Sign out')}</span>
        </a>
      </div>
    </aside>
  );
}
