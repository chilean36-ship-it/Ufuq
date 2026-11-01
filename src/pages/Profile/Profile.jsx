import { useEffect, useState } from 'react';
import tokensCss from '../../styles/tokens.css?inline';
import shellCss from '../../styles/app-shell.css?inline';
import pageCss from './profile.css?inline';
import profileViewCss from './profile-view.css?inline';
import PageStyle from '../../components/PageStyle';
import { CabinetI18nProvider, useCabinetI18n } from '../../context/CabinetI18nContext';
import { useTheme } from '../../hooks/useTheme';
import baseProfileDict from '../../i18n/cabinet-profile';
import fillMissing from '../../i18n/fill-missing';

const cabinetDict = Object.fromEntries(
  Object.keys(baseProfileDict).map((l) => [l, { ...(fillMissing[l] || {}), ...baseProfileDict[l] }])
);
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import ProfileView from './ProfileView';

function ProfileInner({ role }) {
  const { t } = useCabinetI18n();
  const [theme, toggleTheme] = useTheme();
  const [who, setWho] = useState({ name: '', avatarUrl: null });
  useEffect(() => { document.title = 'Ufuq — Cabinet'; }, []);
  const displayName = who.name || t(role === 'admin' ? 'Admin' : 'Teacher');

  return (
    <>
      <PageStyle css={tokensCss} />
      <PageStyle css={shellCss} />
      <PageStyle css={pageCss} />
      <PageStyle css={profileViewCss} />
      <div className="sidebar-backdrop" id="sidebarBackdrop" />
      <Sidebar active="profile" role={role} />
      <div className="main">
        <Topbar
          crumb={t('Profile')} name={displayName} avatarInitial={displayName.charAt(0).toUpperCase()} avatarUrl={who.avatarUrl}
          role={role} theme={theme} onToggleTheme={toggleTheme} notifHidden
        />
        <div className="content">
          <ProfileView onIdentityChange={setWho} asTeacher={role === 'teacher'} />
        </div>
      </div>
    </>
  );
}

/** Standalone `/profile` for teachers and admins. Students see it inside the dashboard (see ProfileRoute). */
export default function Profile({ role = 'teacher' }) {
  return (
    <CabinetI18nProvider dict={cabinetDict}>
      <ProfileInner role={role} />
    </CabinetI18nProvider>
  );
}
