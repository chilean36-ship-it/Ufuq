import { Link } from 'react-router-dom';
import CabinetLangSelect from '../../components/CabinetLangSelect';
import { useCabinetI18n } from '../../context/CabinetI18nContext';

const MOON = <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />;
const SUN = (
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </>
);

const ROLE_META = {
  student: {
    label: 'Student',
    // graduation cap — kept intentionally simple at this size
    icon: <><path d="M12 3 2 8l10 5 10-5-10-5Z" /><path d="M6 10v5c0 1.66 2.69 3 6 3s6-1.34 6-3v-5" /></>,
  },
  teacher: {
    label: 'Teacher',
    // open book
    icon: <><path d="M12 7c-1.5-1.5-4-2-8-1.5v13c4-.5 6.5 0 8 1.5 1.5-1.5 4-2 8-1.5v-13c-4-.5-6.5 0-8 1.5Z" /><path d="M12 7v13" /></>,
  },
  admin: {
    label: 'Admin',
    // shield with a check
    icon: <><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></>,
  },
};

/**
 * Cabinet topbar: mobile-menu button, breadcrumb, language select, notifications,
 * theme toggle, and the profile chip. Shared by profile.html / dashboard.html-style pages.
 * `role` ('student' | 'teacher' | 'admin') draws a small badge under the name so it's always
 * clear whose account — and which kind of account — is signed in (Profile is shared by every role).
 */
export default function Topbar({ crumb, onMobileMenu, theme, onToggleTheme, name, avatarInitial, avatarUrl, role, onProfile, onNotif, notifCount, notifHidden, notifOpen, groupSwitcher }) {
  const { t } = useCabinetI18n();
  const roleMeta = ROLE_META[role];
  return (
    <div className="topbar">
      <button className="mobile-menu-btn" id="mobileMenuBtn" aria-label={t('Open menu')} onClick={onMobileMenu}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
      </button>
      <div className="crumb"><span>{t('Cabinet')}</span> / <b>{crumb}</b></div>
      <div className="top-right">
        <CabinetLangSelect />
        {groupSwitcher /* only passed when the student belongs to 2+ groups */}

        {/* Dashboard passes live values (notifCount/notifHidden/notifOpen); Profile omits them and keeps the static badge. */}
        <button className="icon-btn" id="notifBtn" aria-label={t('Notifications')} aria-haspopup="true" aria-expanded={notifOpen ? 'true' : 'false'}
                style={notifHidden ? { display: 'none' } : undefined} onClick={onNotif}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></svg>
          {notifCount === undefined
            ? <span className="notif-badge" id="notifBadge">3</span>
            : <span className="notif-badge" id="notifBadge" style={{ display: notifCount > 0 && !notifHidden ? 'flex' : 'none' }}>{notifCount > 9 ? '9+' : String(notifCount)}</span>}
        </button>

        <button className="theme-toggle" id="themeToggle" aria-label={t('Toggle dark / light mode')} onClick={onToggleTheme}>
          <span className="theme-track">
            <span className="theme-thumb">
              <svg className="icon-moon" viewBox="0 0 24 24" fill="currentColor">{MOON}</svg>
              <svg className="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">{SUN}</svg>
            </span>
          </span>
        </button>

        <Link className="top-profile" to="/profile" style={{ color: 'inherit' }}
              onClick={onProfile ? (e) => { e.preventDefault(); onProfile(); } : undefined}>
          <div className="top-avatar" id="avatarInitial">
            {avatarUrl
              ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
              : avatarInitial}
          </div>
          <span className="top-user-info">
            <span className="top-username" id="topUserName">{name}</span>
            {roleMeta && (
              <span className="top-role">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{roleMeta.icon}</svg>
                {t(roleMeta.label)}
              </span>
            )}
          </span>
          <svg className="top-chevron" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
        </Link>
      </div>
    </div>
  );
}
