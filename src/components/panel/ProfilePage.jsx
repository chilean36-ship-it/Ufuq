import { useCallback } from 'react';
import PageStyle from '../PageStyle';
import { usePanel } from './PanelContext';
import { AuthContext } from '../../context/AuthContext';
import { CabinetI18nBridge } from '../../context/CabinetI18nContext';
import profileDict from '../../i18n/cabinet-profile';
import ProfileView from '../../pages/Profile/ProfileView';
import profilePanelCss from '../../pages/Profile/profile-panel.css?inline';
import profileViewCss from '../../pages/Profile/profile-view.css?inline';

/**
 * "Profile" inside the Admin / Teacher panels (opens in place, like every other section — no jump to /profile).
 * Renders the same <ProfileView/> the student dashboard uses; name / photo changes are pushed back to the panel
 * so the topbar follows them.
 */
export default function ProfilePage() {
  const { user, myName, setMyName, setMyAvatarUrl, myRole } = usePanel();
  const inTeacherPanel = myRole !== undefined; // only the teacher panel provides myRole
  const onIdentityChange = useCallback((who) => {
    if (who && who.name && setMyName) setMyName(who.name);
    if (who && setMyAvatarUrl) {
      if (who.avatarUrl && !String(who.avatarUrl).startsWith('data:')) setMyAvatarUrl(who.avatarUrl);
      else if (!who.avatarUrl && who.avatarKnown) setMyAvatarUrl(null); // the photo was removed
    }
  }, [setMyName, setMyAvatarUrl]);

  return (
    <AuthContext.Provider value={{ user, role: null, fullName: myName }}>
      <CabinetI18nBridge dict={profileDict}>
        <PageStyle css={profilePanelCss} />
        <PageStyle css={profileViewCss} />
        <section className="page active" id="page-profile">
          <ProfileView onIdentityChange={onIdentityChange} asTeacher={inTeacherPanel} />
        </section>
      </CabinetI18nBridge>
    </AuthContext.Provider>
  );
}
