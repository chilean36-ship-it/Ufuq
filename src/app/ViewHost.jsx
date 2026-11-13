import { lazy, Suspense, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCabinetI18n } from '../context/CabinetI18nContext';
import { useDashboardData } from '../context/DashboardDataContext';
import { useTheme } from '../hooks/useTheme';
import { useApp } from './AppContext';
import { Ico } from './ui';
import MyGroupView from '../pages/Dashboard/MyGroupView';
import TasksView from '../pages/Dashboard/TasksView';
import AttendanceView from '../pages/Dashboard/AttendanceView';
import ProgressView from '../pages/Dashboard/ProgressView';
import BillingView from '../pages/Dashboard/BillingView';
import PaywallGate from '../pages/Dashboard/PaywallGate';
import ProfileView from '../pages/Profile/ProfileView';

const HifzLiveView = lazy(() => import('../pages/Dashboard/Hifz/HifzLiveView'));
const LibraryView = lazy(() => import('../pages/Dashboard/Library/LibraryView'));
const CertificatesView = lazy(() => import('../pages/Dashboard/Certificates/CertificatesView'));
const SettingsView = lazy(() => import('../pages/Dashboard/SettingsView'));
const ExamView = lazy(() => import('../pages/Dashboard/Exam/ExamView'));

const TITLES = {
  myGroup: 'tabGroup', library: 'q_library', tasks: 'q_tasks', exam: 'q_exam', progress: 'q_progress', attendance: 'q_attendance',
  certificates: 'q_certs', hifzLive: 'q_hifz', profile: 'profile', settings: 'settings', billing: 'billing',
};
const PAID = ['tasks', 'hifzLive', 'attendance', 'progress', 'library', 'exam', 'certificates'];

/**
 * Runs one of the cabinet's working views (group + chat, tasks, exams, library …) inside the app's own page chrome:
 * the app's header with a back arrow replaces the website's sidebar and top bar. The views keep their logic and data.
 */
export default function ViewHost({ view, back, backTo = '/app', onNavigate, onUpgrade }) {
  const navigate = useNavigate();
  const { t } = useApp();
  const { t: tc } = useCabinetI18n();
  const { locked, accessPending, groupReady, groupData } = useDashboardData();
  const [theme, toggleTheme, themeMode, setThemeMode] = useTheme();
  const isIndividual = !!(groupData && groupData.type === 'individual');

  useEffect(() => { const el = document.getElementById('uaScroll'); if (el) el.scrollTop = 0; }, [view]);
  // Hifz Mushaf is only for 1:1 groups; anyone else who lands here goes Home.
  useEffect(() => { if (view === 'hifzLive' && groupReady && !isIndividual) navigate('/app', { replace: true }); }, [view, groupReady, isIndividual, navigate]);

  const title = TITLES[view] ? t(TITLES[view]) : '';
  const gated = !!locked && (PAID.includes(view) || view === 'myGroup');

  let body = null;
  if (gated) body = <PaywallGate variant={view === 'myGroup' ? 'group' : undefined} onNavigate={onNavigate} />;
  else if (view === 'myGroup') body = accessPending ? null : <MyGroupView onNavigate={onNavigate} onChatOpenChange={() => {}} />;
  else if (view === 'tasks') body = <TasksView />;
  else if (view === 'attendance') body = <AttendanceView />;
  else if (view === 'progress') body = <ProgressView />;
  else if (view === 'library') body = <LibraryView />;
  else if (view === 'exam') body = <ExamView />;
  else if (view === 'certificates') body = <CertificatesView />;
  else if (view === 'hifzLive') body = <HifzLiveView />;
  else if (view === 'billing') body = <BillingView onUpgrade={onUpgrade} />;
  else if (view === 'profile') body = <ProfileView onIdentityChange={() => {}} />;
  else if (view === 'settings') body = <SettingsView theme={theme} onToggleTheme={toggleTheme} themeMode={themeMode} onSetThemeMode={setThemeMode} onNavigate={onNavigate} />;

  return (
    <div className="ua-host" data-view={view}>
      <header className="ua-bar">
        {back
          ? <button type="button" className="ua-icon-btn" onClick={() => navigate(backTo)} aria-label={t('back')}><Ico n="back" /></button>
          : <span className="ua-bar-sp" />}
        <h1>{title || tc('Home')}</h1>
        <span className="ua-bar-sp" />
      </header>
      <div className="main"><div className="content">
        <Suspense fallback={<div className="ua-loading">{t('loading')}</div>}>{body}</Suspense>
      </div></div>
    </div>
  );
}
