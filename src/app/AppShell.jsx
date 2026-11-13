import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import PageStyle from '../components/PageStyle';
import Loader from '../components/Loader';
import NameGate from '../components/NameGate';
import { AuthContext } from '../context/AuthContext';
import { CabinetI18nProvider, useCabinetI18n } from '../context/CabinetI18nContext';
import { DashboardDataProvider, useDashboardData } from '../context/DashboardDataContext';
import tokensCss from '../styles/tokens.css?inline';
import shellCss from '../styles/app-shell.css?inline';
import pageCss from '../pages/Dashboard/dashboard.css?inline';
import profileViewCss from '../pages/Profile/profile-view.css?inline';
import cabinetDict from '../pages/Dashboard/cabinetDict';
import { useApp } from './AppContext';
import { Ico } from './ui';
import HomeScreen from './HomeScreen';
import MeScreen from './MeScreen';
import LearnScreen from './LearnScreen';
import AiScreen from './AiScreen';

import ViewHost from './ViewHost';

const AiChat = lazy(() => import('../pages/Dashboard/AiChat/AiChat'));
const LevelResultModal = lazy(() => import('../pages/Dashboard/LevelResult/LevelResultModal'));
const CertificateWinModal = lazy(() => import('../pages/Dashboard/Certificates/CertificateWinModal'));
const UpgradeModal = lazy(() => import('../pages/Dashboard/UpgradeModal'));

/** Where each cabinet view lives inside the app (the reused views call onNavigate('<cabinet view name>')). */
export const VIEW_ROUTE = {
  home: '/app', myGroup: '/app/group', billing: '/app/me/billing', profile: '/app/me/profile', settings: '/app/me/settings',
  library: '/app/learn/library', tasks: '/app/learn/tasks', exam: '/app/learn/exam', progress: '/app/learn/progress',
  attendance: '/app/learn/attendance', certificates: '/app/learn/certificates', hifzLive: '/app/learn/hifz',
};

function TabBar() {
  const { t } = useApp();
  const tabs = [
    { to: '/app', end: true, icon: 'home', label: 'tabHome' },
    { to: '/app/learn', icon: 'learn', label: 'tabLearn' },
    { to: '/app/ai', icon: 'ai', label: 'tabAi', center: true },
    { to: '/app/group', icon: 'group', label: 'tabGroup' },
    { to: '/app/me', icon: 'me', label: 'tabMe' },
  ];
  return (
    <nav className="ua-tabbar" aria-label="Main">
      {tabs.map((x) => (
        <NavLink key={x.to} to={x.to} end={x.end} className={({ isActive }) => 'ua-tab' + (x.center ? ' center' : '') + (isActive ? ' on' : '')}>
          <span className="ua-tab-ic"><Ico n={x.icon} size={x.center ? 24 : 23} sw={x.center ? 1.9 : 1.8} /></span>
          <span className="ua-tab-l">{t(x.label)}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function OfflineBar() {
  const { t } = useApp();
  const [off, setOff] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);
  useEffect(() => {
    const on = () => setOff(false); const offf = () => setOff(true);
    window.addEventListener('online', on); window.addEventListener('offline', offf);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', offf); };
  }, []);
  return off ? <div className="ua-offline" role="status">{t('offline')}</div> : null;
}

function Inner() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { refreshGroup, switchGroup, role } = useDashboardData();
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [aiSuppress, setAiSuppress] = useState(false);
  const { lang } = useCabinetI18n();
  const { setLang } = useApp();

  // The cabinet language provider and the app share one storage key; keep the app in step if a reused view changes it.
  useEffect(() => { setLang(lang, { sync: false }); }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const onNavigate = useCallback((view) => { navigate(VIEW_ROUTE[view] || '/app'); }, [navigate]);
  const openUpgrade = useCallback(() => setUpgradeOpen(true), []);

  useEffect(() => { setAiSuppress(pathname.startsWith('/app/me/billing')); }, [pathname]);
  useEffect(() => { document.title = 'Ufuq'; }, []);

  return (
    <div className="ua-app">
      <PageStyle css={tokensCss} />
      <PageStyle css={shellCss} />
      <PageStyle css={pageCss} />
      <PageStyle css={profileViewCss} />
      <OfflineBar />
      <div className="ua-scroll" id="uaScroll">
        <Routes>
          <Route index element={<HomeScreen onNavigate={onNavigate} onUpgrade={openUpgrade} />} />
          <Route path="learn" element={<LearnScreen onNavigate={onNavigate} />} />
          <Route path="learn/:view" element={<ViewRoute section="learn" onNavigate={onNavigate} onUpgrade={openUpgrade} />} />
          <Route path="ai" element={<AiScreen />} />
          <Route path="group" element={<ViewHost view="myGroup" back={false} onNavigate={onNavigate} onUpgrade={openUpgrade} />} />
          <Route path="me" element={<MeScreen onNavigate={onNavigate} role={role} />} />
          <Route path="me/:view" element={<ViewRoute section="me" onNavigate={onNavigate} onUpgrade={openUpgrade} />} />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </div>
      <TabBar />
      <Suspense fallback={null}>
        <AiChat hideLauncher suppress={aiSuppress} />
        <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
      </Suspense>
      <ResultModals refreshGroup={refreshGroup} switchGroup={switchGroup} onNavigate={onNavigate} />
    </div>
  );
}

const ROUTE_TO_VIEW = { library: 'library', tasks: 'tasks', exam: 'exam', progress: 'progress', attendance: 'attendance', certificates: 'certificates', hifz: 'hifzLive', profile: 'profile', settings: 'settings', billing: 'billing' };

function ViewRoute({ section, onNavigate, onUpgrade }) {
  const { view } = useParams();
  const v = ROUTE_TO_VIEW[view];
  if (!v) return <Navigate to={section === 'me' ? '/app/me' : '/app/learn'} replace />;
  return <ViewHost view={v} back backTo={section === 'me' ? '/app/me' : '/app/learn'} onNavigate={onNavigate} onUpgrade={onUpgrade} />;
}

/** Level-result window and certificate celebration (same behaviour as the website cabinet). */
function ResultModals({ refreshGroup, switchGroup, onNavigate }) {
  const [Hooks, setHooks] = useState(null);
  useEffect(() => { import('../pages/Dashboard/LevelResult/useLevelResult').then((m) => setHooks(() => m.default)); }, []);
  if (!Hooks) return null;
  return <ResultModalsInner useLevelResult={Hooks} refreshGroup={refreshGroup} switchGroup={switchGroup} onNavigate={onNavigate} />;
}
function ResultModalsInner({ useLevelResult, refreshGroup, switchGroup, onNavigate }) {
  const { user, role } = useDashboardData();
  const levelResult = useLevelResult(user && user.id, role === 'student');
  const close = useCallback(async () => {
    const it = levelResult.item;
    await levelResult.dismiss();
    await refreshGroup();
    if (it && it.to_group) switchGroup(it.to_group);
  }, [levelResult, refreshGroup, switchGroup]);
  return (
    <Suspense fallback={null}>
      <LevelResultModal item={levelResult.item} onClose={close} />
      {!levelResult.item && <CertificateWinModal onOpen={() => onNavigate('certificates')} />}
    </Suspense>
  );
}

/** The signed-in app. `auth` = { user, role, fullName } already verified by AppRoot. */
export default function AppShell({ auth }) {
  return (
    <AuthContext.Provider value={auth}>
      <NameGate>
        <CabinetI18nProvider dict={cabinetDict}>
          <DashboardDataProvider>
            <Suspense fallback={<Loader />}><Inner /></Suspense>
          </DashboardDataProvider>
        </CabinetI18nProvider>
      </NameGate>
    </AuthContext.Provider>
  );
}
