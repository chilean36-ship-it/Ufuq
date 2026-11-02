import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import useScrollTop from '../../hooks/useScrollTop';
import tokensCss from '../../styles/tokens.css?inline';
import shellCss from '../../styles/app-shell.css?inline';
import pageCss from './dashboard.css?inline';
import profileViewCss from '../Profile/profile-view.css?inline';
import PageStyle from '../../components/PageStyle';
import { CabinetI18nProvider, useCabinetI18n } from '../../context/CabinetI18nContext';
import { DashboardDataProvider, useDashboardData } from '../../context/DashboardDataContext';
import { useTheme } from '../../hooks/useTheme';
import useSidebarCollapsed from '../../hooks/useSidebarCollapsed';
import dashboardDict from '../../i18n/cabinet-dashboard';
import examLevelsDict from '../../i18n/exam-levels';
import dashboardExtra from '../../i18n/dashboard-extra';
import examModeDict from '../../i18n/exam-mode';
import profileDict from '../../i18n/cabinet-profile';
import fillMissing from '../../i18n/fill-missing';
import Sidebar from './Sidebar';
import Topbar from '../Profile/Topbar';
import ProfileView from '../Profile/ProfileView';
import HomeView from './HomeView';
import MyGroupView from './MyGroupView';
import HifzLiveView from './Hifz/HifzLiveView';
import TasksView from './TasksView';
import AttendanceView from './AttendanceView';
import ProgressView from './ProgressView';
import LibraryView from './Library/LibraryView';
const CertificatesView = lazy(() => import('./Certificates/CertificatesView'));
import SettingsView from './SettingsView';
import BillingView, { BILLING_CSS } from './BillingView';
import PaywallGate from './PaywallGate';
import UpgradeModal from './UpgradeModal';
import PaymentBanner from './PaymentBanner';
import billingDict from '../../i18n/billing-cabinet';
import myGroupDict from '../../i18n/my-group';
import ExamView from './Exam/ExamView';
import NotificationsPanel from './Notifications/NotificationsPanel';
import LevelResultModal from './LevelResult/LevelResultModal';
import useLevelResult from './LevelResult/useLevelResult';
import { useNotifications } from './Notifications/useNotifications';
import AiChat from './AiChat/AiChat';
import ComingSoonModal from './ComingSoonModal';
import Pending from '../Pending/Pending';
import useHashView, { readHashView } from '../../hooks/useHashView';
import PillSelect, { GROUP_ICON } from '../../components/PillSelect';

const CRUMB_TITLES = {
  home: 'Home', myGroup: 'My Group', hifzLive: 'Hifz Mushaf', tasks: 'Tasks', exam: 'Exams', attendance: 'Attendance',
  progress: 'Progress', library: 'Library', certificates: 'Certificates', profile: 'Profile', settings: 'Settings', billing: 'Billing',
};

// A section listed here shows the "coming soon" window instead of opening (e.g. { tasks: 'tasksLink' }).
// Tasks is live now (Nov 2026).
const SECTIONS_COMING_SOON = {};

// Yangilashdan (F5) keyin qaytib ochilishi mumkin bo'lgan bo'limlar (#hash orqali). "Tez orada" bo'limlari kirmaydi.
const LEARNING_VIEWS = ['myGroup', 'hifzLive', 'tasks', 'exam', 'attendance', 'progress'];
const RESTORABLE_VIEWS = ['home', 'myGroup', 'hifzLive', 'tasks', 'attendance', 'progress', 'library', 'certificates', 'settings', 'profile', 'billing'];
// Sections that need a paid plan. Home, Billing, Settings and Profile stay open; My Group (and joining a group) needs a plan.
const NO_AI_VIEWS = ['myGroup', 'billing', 'settings']; // Ufuq AI is not offered on these sections
const PAID_VIEWS = ['tasks', 'hifzLive', 'attendance', 'progress', 'library', 'exam', 'certificates'];

// The Profile view reuses the profile dictionary; the dashboard's own strings win on any overlap.
const cabinetDict = Object.fromEntries(
  Object.keys(dashboardDict).map((lang) => [lang, { ...(examLevelsDict[lang] || {}), ...(fillMissing[lang] || {}), ...(profileDict[lang] || {}), ...dashboardDict[lang], ...(dashboardExtra[lang] || {}), ...(examModeDict[lang] || {}), ...(billingDict[lang] || {}), ...(myGroupDict[lang] || {}) }])
);

function DashboardInner({ initialView = 'home' }) {
  const { t } = useCabinetI18n();
  const { user, name, isPaid, locked, accessPending, avatarUrl, setAvatarUrl, groupData, groupReady, groups, groupCode, switchGroup, refreshGroup, role, access } = useDashboardData();
  const isIndividual = !!(groupData && groupData.type === 'individual');
  const [theme, toggleTheme, themeMode, setThemeMode] = useTheme();
  const [sbCollapsed, toggleSbCollapsed, setSbCollapsed] = useSidebarCollapsed();
  const [view, setView] = useState(() => readHashView(initialView, (v) => RESTORABLE_VIEWS.includes(v)));
  useHashView(view, initialView); // F5 qilinganda shu bo'limda qoladi
  const [switchNonce, setSwitchNonce] = useState(0); // bumped on a topbar group switch: remounts the open view so it reloads for the new group
  const [identity, setIdentity] = useState(null); // name/photo edited on the Profile view, so the topbar follows at once
  // ProfileView remounts empty every time it is opened — never let that blank out a photo we already know.
  const onIdentityChange = useCallback((next) => {
    setIdentity((prev) => ({ ...(prev || {}), ...next, avatarUrl: next.avatarKnown ? (next.avatarUrl || null) : (next.avatarUrl || (prev && prev.avatarUrl) || null) }));
  }, []);
  const [learningOpen, setLearningOpen] = useState(() => LEARNING_VIEWS.includes(view));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [comingSoon, setComingSoon] = useState(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [gcChatOpen, setGcChatOpen] = useState(false);
  useScrollTop(view); // every section (My Group, Settings, …) opens at the top, not at the previous section's scroll offset
  // Notifications are a paid feature: the bell is hidden for accounts whose profiles.status isn't 'active'
  // (teachers and admins keep it).
  const notifs = useNotifications(user && user.id, isPaid);
  const { refresh: refreshNotifs } = notifs;
  // Level result window (passed -> celebration, failed -> "you left the group"); closing it re-reads level + groups.
  const levelResult = useLevelResult(user && user.id, role === 'student');
  const closeLevelResult = useCallback(async () => {
    const it = levelResult.item;
    await levelResult.dismiss();
    await refreshGroup();
    if (it && it.to_group) { switchGroup(it.to_group); setSwitchNonce((n) => n + 1); }
  }, [levelResult, refreshGroup, switchGroup]);
  const closeNotif = useCallback(() => setNotifOpen(false), []);
  const toggleNotif = useCallback(() => {
    if (notifOpen) { setNotifOpen(false); return; }
    setNotifOpen(true);
    refreshNotifs(); // opening the panel re-fetches, like the original openNotifPanel()
  }, [notifOpen, refreshNotifs]);
  useEffect(() => { if (!isPaid) setNotifOpen(false); }, [isPaid]);

  useEffect(() => { document.title = 'Ufuq — Cabinet'; }, []);

  // Hifz Mushaf exists only for individual (1:1) groups: anyone else who lands on it (old link, left the group) goes Home.
  useEffect(() => { if (view === 'hifzLive' && groupReady && !isIndividual) setView('home'); }, [view, groupReady, isIndividual]);

  // Phone drawer: Escape closes it, and it closes itself if the window grows back to desktop width.
  useEffect(() => {
    if (!sidebarOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setSidebarOpen(false); };
    const onResize = () => { if (window.innerWidth > 860) setSidebarOpen(false); };
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => { document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); };
  }, [sidebarOpen]);

  const navigate = useCallback((next) => {
    if (SECTIONS_COMING_SOON[next]) { setComingSoon(SECTIONS_COMING_SOON[next]); return; }
    setView(next);
    if (LEARNING_VIEWS.includes(next)) setLearningOpen(true);
    setSidebarOpen(false);
  }, []);

  // ?openGroup=1 (e.g. coming back from checkout) lands straight on My Group.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('openGroup') !== '1') return undefined;
    const id = setTimeout(() => navigate('myGroup'), 200);
    return () => clearTimeout(id);
  }, [navigate]);

  // Share a freshly uploaded photo with every other view (My Group, chat, ranking…).
  useEffect(() => {
    if (!identity) return;
    if (identity.avatarUrl && identity.avatarUrl !== avatarUrl && !identity.avatarUrl.startsWith('data:')) setAvatarUrl(identity.avatarUrl);
    else if (!identity.avatarUrl && identity.avatarKnown) setAvatarUrl(null); // photo removed
  }, [identity]); // eslint-disable-line react-hooks/exhaustive-deps
  const shownName = (identity && identity.name) || name || t('Student');
  const shownAvatar = identity && identity.avatarKnown ? identity.avatarUrl : ((identity && identity.avatarUrl) || avatarUrl);
  const initial = shownName.charAt(0).toUpperCase();

  // Group switcher (like the teacher panel's) — only for students who belong to more than one group.
  // Upgrade button in the topbar (students without a running plan, or whose plan ends within a week)
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const endsInDays = access && access.active && access.ends_at ? Math.ceil((new Date(access.ends_at).getTime() - Date.now()) / 86400000) : null;
  const upgradeLabel = role !== 'student' || !access || access.exempt ? null : !access.active ? t('Upgrade plan') : (endsInDays !== null && endsInDays <= 7 ? t('Renew plan') : null);
  const upgrade = upgradeLabel ? { label: upgradeLabel, onClick: () => setUpgradeOpen(true) } : null;

  const groupSwitcher = groups.length > 1 ? (
    <PillSelect icon={GROUP_ICON} ariaLabel={t('Group')} value={groupCode || ''} hideCurOnMobile
                options={groups.map((g) => ({ value: g.code, label: g.name }))}
                onChange={(code) => { switchGroup(code); setSwitchNonce((n) => n + 1); }} />
  ) : null;

  return (
    <>
      <PageStyle css={tokensCss} />
      <PageStyle css={shellCss} />
      <PageStyle css={pageCss} />
      <PageStyle css={profileViewCss} />

      <div className={'sidebar-backdrop' + (sidebarOpen ? ' open' : '')} id="sidebarBackdrop" onClick={() => setSidebarOpen(false)} />
      <Sidebar active={view} onNavigate={navigate} learningOpen={learningOpen} onToggleLearning={() => setLearningOpen((o) => !o)}
               collapsed={sbCollapsed} onToggleCollapsed={toggleSbCollapsed} onExpand={() => setSbCollapsed(false)} mobileOpen={sidebarOpen} />

      <div className={'main' + (gcChatOpen && view === 'myGroup' ? ' gc-focus' : '')}>
        <Topbar
          crumb={t(CRUMB_TITLES[view] || 'Home')} name={shownName} avatarInitial={initial} avatarUrl={shownAvatar} role="student" onProfile={() => navigate('profile')}
          theme={theme} onToggleTheme={toggleTheme} onMobileMenu={() => setSidebarOpen((o) => !o)}
          onNotif={toggleNotif} notifCount={notifs.unread} notifHidden={!isPaid} notifOpen={notifOpen}
          groupSwitcher={groupSwitcher} upgrade={upgrade}
        />
        <div className="content" key={switchNonce}>
          {view !== 'billing' && <PaymentBanner onUpgrade={() => setUpgradeOpen(true)} />}
          {locked && PAID_VIEWS.includes(view) && <PaywallGate onNavigate={navigate} />}
          {locked && view === 'myGroup' && <PaywallGate variant="group" onNavigate={navigate} />}
          {view === 'home' && <HomeView onNavigate={navigate} />}
          {view === 'myGroup' && !locked && !accessPending && <MyGroupView onNavigate={navigate} onChatOpenChange={setGcChatOpen} />}
          {view === 'hifzLive' && isIndividual && !locked && <HifzLiveView />}
          {view === 'tasks' && !locked && <TasksView />}
          {view === 'certificates' && !locked && <Suspense fallback={null}><CertificatesView /></Suspense>}
          {view === 'attendance' && !locked && <AttendanceView />}
          {view === 'progress' && !locked && <ProgressView />}
          {view === 'library' && !locked && <LibraryView />}
          {view === 'exam' && !locked && <ExamView />}
          {view === 'billing' && <BillingView onUpgrade={() => setUpgradeOpen(true)} />}
          <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
          {view === 'settings' && <SettingsView theme={theme} onToggleTheme={toggleTheme} themeMode={themeMode} onSetThemeMode={setThemeMode} onNavigate={navigate} />}
          {view === 'profile' && <ProfileView onIdentityChange={onIdentityChange} />}
          {!['home', 'myGroup', 'hifzLive', 'tasks', 'attendance', 'progress', 'library', 'certificates', 'settings', 'exam', 'profile', 'billing'].includes(view) && <Pending name={t(CRUMB_TITLES[view] || view)} />}
        </div>
      </div>

      {!locked && <AiChat hideLauncher={gcChatOpen || view === 'hifzLive'} suppress={NO_AI_VIEWS.includes(view)} />}
      <LevelResultModal item={levelResult.item} onClose={closeLevelResult} />
      <ComingSoonModal linkId={comingSoon} onClose={() => setComingSoon(null)} />
      {isPaid && (
        <NotificationsPanel open={notifOpen} onClose={closeNotif} items={notifs.items} onMarkRead={notifs.markRead} onMarkAll={notifs.markAllRead} onNavigate={navigate} />
      )}
    </>
  );
}

/** Route entry: `/dashboard` and `/` (any signed-in student; RequireRole wraps this in App.jsx). */
export default function Dashboard({ initialView }) {
  return (
    <CabinetI18nProvider dict={cabinetDict}>
      <DashboardDataProvider>
        <DashboardInner initialView={initialView} />
      </DashboardDataProvider>
    </CabinetI18nProvider>
  );
}
