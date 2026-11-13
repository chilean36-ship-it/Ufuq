import { useCallback, useEffect, useMemo, useState } from 'react';
import BackToApp from '../../components/BackToApp';
import { useNavigate } from 'react-router-dom';
import useScrollTop from '../../hooks/useScrollTop';
import useHashView, { readHashView } from '../../hooks/useHashView';
import Loader from '../../components/Loader';
import PageStyle from '../../components/PageStyle';
import CabinetLangSelect from '../../components/CabinetLangSelect';
import PillSelect, { GROUP_ICON } from '../../components/PillSelect';
import pageCss from './teacher.css?inline';
import pageCssV2 from './teacher-v2.css?inline';
import designCss from './teacher-design.css?inline';
import materialsCss from './materials-design.css?inline';
import mediaCss from './media-design.css?inline';
import sidebarCss from '../../components/panel/panel-sidebar.css?inline';
import PanelSidebar from '../../components/panel/PanelSidebar';
import AiChat from '../Dashboard/AiChat/AiChat';
import CommandPalette from '../../components/panel/CommandPalette';
import usePendingWork from '../../components/panel/usePendingWork';
import teacherExtra from '../../i18n/teacher-extra';
import examModeDict from '../../i18n/exam-mode';
import { CabinetI18nProvider, useCabinetI18n } from '../../context/CabinetI18nContext';
import teacherDictBase from '../../i18n/cabinet-teacher';
import fillMissing from '../../i18n/fill-missing';
import { supabase } from '../../lib/supabaseClient';
import { getFreshUser, resolveFullName, useLiveName } from '../../lib/profileName';
import { useLiveAvatar } from '../../lib/avatarSync';
import useLiveRefresh from '../../lib/liveRefresh';
import { clearCachedRole, ufuqGetSession } from '../../lib/auth';
import { fetchPanelProfile, isSuperAdmin, PANEL_ROUTES, verifySuperAdmin } from '../../lib/panelAccess';
import panelSwitchDict from '../../i18n/panel-switch';
import teacherClassDict from '../../i18n/teacher-class';
import examLevelsDict from '../../i18n/exam-levels';
import ProfileMenu from '../../components/panel/ProfileMenu';
import { PanelContext } from '../../components/panel/PanelContext';
import ProfilePage from '../../components/panel/ProfilePage';
import { ConfirmModal, MenuIcon, ProfileNavIcon, TeacherRoleIcon, AdminRoleIcon, Toasts, useConfirm, useIsMobile, useToasts } from '../../components/panel/ui';
import AttendancePage from '../../components/panel/AttendancePage';
import OverviewPage from './OverviewPage';
import GroupsPage from './GroupsPage';
import TasksPage from './TasksPage';
import SlotsPage from './SlotsPage';
import CalendarPage from './CalendarPage';
import ExamsPage from './ExamsPage';
import MaterialsPage from './MaterialsPage';
import MediaPage from './MediaPage';
import AnnouncementsPage from './AnnouncementsPage';
import PanelPending from './PanelPending';

// New strings of the redesigned panel, merged over the base dictionary (EN falls back to the key itself).
const teacherDict = Object.keys({ ...teacherDictBase, ...teacherExtra }).reduce((acc, k) => { acc[k] = { ...(examLevelsDict[k] || {}), ...(teacherClassDict[k] || {}), ...(panelSwitchDict[k] || {}), ...(fillMissing[k] || {}), ...(teacherDictBase[k] || {}), ...(teacherExtra[k] || {}), ...(examModeDict[k] || {}) }; return acc; }, {});
const COLLAPSE_KEY = 'ufuq-panel-collapsed';

const GROUP_KEY = 'ufuq-admin-group'; // same key the legacy admin/teacher panels shared
const svg = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };

const I = {
  overview: <svg {...svg}><rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" /><rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" /></svg>,
  teaching: <svg {...svg}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  coursework: <svg {...svg}><path d="M12 4L3 8l9 4 9-4-9-4z" /><path d="M7 10v5c0 1.5 2.5 3 5 3s5-1.5 5-3v-5" /></svg>,
  messages: <svg {...svg}><path d="M3 11l18-5v12L3 14v-3z" /><path d="M11.6 16.8a2 2 0 0 1-3.6 1.2" /></svg>,
};

const PAGE_LABEL = {
  overview: 'Overview', groups: 'Group', attendance: 'Attendance', slots: 'Slots', calendar: 'Calendar',
  tasks: 'Tasks', exams: 'Exams', materials: 'Materials', media: 'Media', announcements: 'Messages', profile: 'Profile',
};

const SUB = {
  overview: 'Your day at a glance', groups: 'Schedule, students and group chat',
  tasks: 'Homework, submissions and grades', attendance: 'Mark and review who came', slots: 'Individual lesson slots',
  calendar: 'Lessons by month', exams: 'Written exams', materials: 'Audio lessons and board photos',
  media: 'Videos and audio for your groups', announcements: 'Notify the group or one student',
  profile: 'Your account',
};

const PAGES = {
  overview: OverviewPage, groups: GroupsPage, tasks: TasksPage, attendance: AttendancePage,
  slots: SlotsPage,
  calendar: CalendarPage,
  exams: ExamsPage,
  materials: MaterialsPage,
  media: MediaPage,
  announcements: AnnouncementsPage,
  profile: ProfilePage,
};

function readSavedGroup() { try { return localStorage.getItem(GROUP_KEY); } catch (e) { return null; } }
function saveGroup(code) { try { localStorage.setItem(GROUP_KEY, code); } catch (e) { /* ignore */ } }

function TeacherInner() {
  const { t, lang } = useCabinetI18n();
  const navigate = useNavigate();
  const [toasts, toast] = useToasts();
  const [confirmState, askConfirm, closeConfirm] = useConfirm();
  const isMobile = useIsMobile();

  const [guard, setGuard] = useState({ ok: false, msgKey: 'Checking…' });
  const [user, setUser] = useState(null);
  const [myName, setMyName] = useState('Teacher');
  useLiveName(user && user.id, setMyName); // a rename anywhere (Profile page, other tab / device) shows up here at once
  const [myAvatarUrl, setMyAvatarUrl] = useState(null);
  useLiveAvatar(user && user.id, setMyAvatarUrl); // photo changed on the Profile page / other tab shows here at once
  const [myRole, setMyRole] = useState('teacher');
  const [myTier, setMyTier] = useState(null); // 'super' | 'standard' for admins, null for teachers
  const [allGroups, setMyGroups] = useState([]);   // every linked group, inactive ones too (only Admin → Groups shows those)
  const myGroups = useMemo(() => allGroups.filter((g) => g.is_active), [allGroups]); // everywhere else only ACTIVE groups exist
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [currentGroupCode, setCode] = useState(null);
  const [page, setPage] = useState(() => readHashView('overview', (v) => Object.prototype.hasOwnProperty.call(PAGES, v)));
  useHashView(page, 'overview'); // F5 qilinganda shu bo'limda qoladi
  const [nonce, setNonce] = useState(0);
  useScrollTop(page + ':' + nonce);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch (e) { return false; } });
  const [cmdOpen, setCmdOpen] = useState(false);
  const expandSidebar = useCallback(() => { setCollapsed(false); try { localStorage.setItem(COLLAPSE_KEY, '0'); } catch (e) { /* ignore */ } }, []);
  const toggleCollapsed = useCallback(() => setCollapsed((c) => { const v = !c; try { localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0'); } catch (e) { /* ignore */ } return v; }), []);

  useEffect(() => { document.title = 'Ufuq — Teacher'; }, []);

  useEffect(() => {
    let cancelled = false;
    let redirectTimer;
    (async () => {
      let session = null;
      try { session = await ufuqGetSession(); } catch (e) { session = null; }
      if (cancelled) return;
      if (!session) { clearCachedRole(); navigate('/index', { replace: true }); return; }
      setUser(session.user);
      setGuard({ ok: false, msgKey: 'Checking permissions…' });
      const { data, error } = await fetchPanelProfile(session.user.id);
      if (cancelled) return;
      if (error || !data) { // the profile could not be read: never guess "student", go to sign-in
        setGuard({ ok: false, msgKey: 'Checking permissions…' });
        redirectTimer = setTimeout(() => navigate('/index', { replace: true }), 800);
        return;
      }
      if (data.role !== 'teacher' && data.role !== 'admin') {
        setGuard({ ok: false, msgKey: "You don't have access to the teacher panel. Redirecting to your dashboard…" });
        redirectTimer = setTimeout(() => navigate('/dashboard', { replace: true }), 1400);
        return;
      }
      setMyRole(data.role);
      setMyTier(data.admin_tier);
      const savedName = resolveFullName(await getFreshUser(session.user), data.full_name);
      if (savedName) setMyName(savedName);
      const savedAvatar = data.avatar_url || (session.user.user_metadata && session.user.user_metadata.avatar_url) || null;
      setMyAvatarUrl(savedAvatar);
      try {
        if (savedAvatar) localStorage.setItem('ufuq-avatar:' + session.user.id, savedAvatar);
        else localStorage.removeItem('ufuq-avatar:' + session.user.id);
      } catch (e) { /* storage blocked */ }
      setGuard({ ok: true, msgKey: '' });
    })();
    return () => { cancelled = true; clearTimeout(redirectTimer); };
  }, [navigate]);

  const reloadGroups = useCallback(async (opts) => {
    const silent = !!(opts && opts.silent);
    if (!user) return;
    const { data: tg, error: tgErr } = await supabase.from('teacher_groups').select('group_code').eq('teacher_id', user.id);
    if (tgErr) { if (!silent) toast(t('Error loading groups:') + ' ' + tgErr.message, 'err'); return; }
    const codes = (tg || []).map((r) => r.group_code);
    let groups = [];
    if (codes.length > 0) {
      const { data, error: gErr } = await supabase.from('groups').select('*').in('code', codes).order('name');
      if (gErr) { if (!silent) toast(t('Error loading group data:') + ' ' + gErr.message, 'err'); return; }
      groups = (data || []).slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true, sensitivity: 'base' }));
    }
    setMyGroups((cur) => (JSON.stringify(cur) === JSON.stringify(groups) ? cur : groups)); // same data → same reference → no re-render
    setGroupsLoaded(true);
    if (groups.length === 0) { setCode(null); return; }
    // A group that closes by itself (its level's final-exam deadline passed) leaves the list and the panel moves to an active one.
    const firstOpen = (groups.find((gg) => gg.is_active) || groups[0]).code;
    setCode((cur) => {
      const saved = cur || readSavedGroup();
      const g0 = groups.find((gg) => gg.code === saved);
      const keep = g0 && g0.is_active ? saved : firstOpen;   // an inactive group is never the working group
      saveGroup(keep);
      return keep;
    });
  }, [user, t, toast]);

  useEffect(() => { if (guard.ok && user) reloadGroups(); }, [guard.ok, user]); // eslint-disable-line react-hooks/exhaustive-deps
  useLiveRefresh(reloadGroups);

  const pending = usePendingWork(guard.ok ? myGroups.map((g) => g.code) : []);

  useEffect(() => {
    const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmdOpen((o) => !o); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const setCurrentGroupCode = useCallback((code) => { setCode(code); saveGroup(code); }, []);
  const currentGroup = useMemo(() => allGroups.find((gg) => gg.code === currentGroupCode) || null, [allGroups, currentGroupCode]);
  const showPage = useCallback((name) => { setPage(name); setNonce((n) => n + 1); setSidebarOpen(false); }, []);
  const [announcePrefill, setAnnouncePrefill] = useState(null);
  const goToAnnouncements = useCallback((userId, name) => { setAnnouncePrefill({ userId, name }); showPage('announcements'); }, [showPage]);
  const clearAnnouncePrefill = useCallback(() => setAnnouncePrefill(null), []);

  // Only a Super Admin may jump from the teacher panel to the admin panel (teachers and standard admins never see it).
  const canSwitchToAdmin = guard.ok && isSuperAdmin(myRole, myTier);

  const switchToAdmin = useCallback(async () => {
    if (await verifySuperAdmin()) { navigate(PANEL_ROUTES.admin); return; }
    setMyTier('standard'); // rights changed since load: the entry disappears, no navigation
    toast(t('You do not have access to the admin panel.'), 'err');
  }, [navigate, toast, t]);

  const ctx = useMemo(() => ({
    t, lang, toast, askConfirm, user, myName, myAvatarUrl, setMyName, setMyAvatarUrl, myGroups, allGroups, currentGroup, currentGroupCode, setCurrentGroupCode, reloadGroups,
    announcePrefill, clearAnnouncePrefill, goToAnnouncements, showPage, pending,
    myRole, canSwitchToAdmin,
  }), [myRole, canSwitchToAdmin, t, lang, toast, askConfirm, user, myName, myAvatarUrl, setMyName, setMyAvatarUrl, myGroups, allGroups, currentGroup, currentGroupCode, setCurrentGroupCode, reloadGroups, announcePrefill, clearAnnouncePrefill, goToAnnouncements, showPage, pending]);

  const isIndividual = !!(currentGroup && currentGroup.type === 'individual');
  const nav = useMemo(() => [
    { page: 'overview', label: 'Overview', icon: I.overview },
    { id: 'teaching', label: 'Teaching', icon: I.teaching, items: [
      { page: 'groups', label: 'Group' }, { page: 'attendance', label: 'Attendance' },
      ...(isIndividual ? [{ page: 'slots', label: 'Slots' }] : []), { page: 'calendar', label: 'Calendar' },
    ] },
    { id: 'coursework', label: 'Coursework', icon: I.coursework, items: [
      { page: 'tasks', label: 'Tasks', badge: pending.tasks }, { page: 'exams', label: 'Exams' },
      { page: 'materials', label: 'Materials' }, { page: 'media', label: 'Media' },
    ] },
    { page: 'announcements', label: 'Messages', icon: I.messages },
  ], [isIndividual, pending.tasks]);
  const flatNav = useMemo(() => nav.flatMap((n) => (n.items ? n.items.map((i) => ({ ...i, icon: n.icon })) : [n])), [nav]);
  const Page = (flatNav.some((n) => n.page === page) || page === 'profile') ? PAGES[page] : PAGES.overview;
  const activePage = Page === PAGES[page] ? page : 'overview';
  const navLabel = PAGE_LABEL[activePage] || activePage;

  return (
    <PanelContext.Provider value={ctx}>
      <PageStyle css={pageCss} />
      <PageStyle css={pageCssV2} />
      <PageStyle css={sidebarCss} />
      <PageStyle css={designCss} />
      <PageStyle css={materialsCss} />
      <PageStyle css={mediaCss} />

      {!guard.ok && (
        <div className="guard-overlay">
          <Loader label={t(guard.msgKey)} />
        </div>
      )}

      <div style={{ display: sidebarOpen ? 'block' : 'none', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40 }} onClick={() => setSidebarOpen(false)} />
      <PanelSidebar variant="teacher" showStudentLink={false} brandSuffix={t('Teacher')} nav={nav} page={activePage} onNavigate={showPage}
                    collapsed={collapsed} onToggleCollapsed={toggleCollapsed} onExpand={expandSidebar} open={sidebarOpen} isMobile={isMobile} />

      <div className="main">
        <div className="topbar">
          <button className="icon-btn menu-toggle-btn" aria-label={t('Menu')} style={{ display: isMobile ? 'inline-flex' : 'none' }} onClick={() => setSidebarOpen((o) => !o)}><MenuIcon /></button>
          <div className="crumb">
            <span className="crumb-title">{t(navLabel)}</span>
            <span className="crumb-sub">{t(SUB[activePage] || 'Teacher dashboard')}{currentGroup ? ' \u00b7 ' + currentGroup.name : ''}</span>
          </div>
          <div className="top-right">
            <button type="button" className="top-search" onClick={() => setCmdOpen(true)} aria-label={t('Search pages…')}>
              <svg {...svg}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg><span>{t('Search pages…')}</span><kbd>Ctrl K</kbd>
            </button>
            <CabinetLangSelect />
            <PillSelect icon={GROUP_ICON} ariaLabel={t('Group')} value={currentGroupCode || ''}
                        disabled={!groupsLoaded || myGroups.length === 0}
                        placeholder={!groupsLoaded ? t('Loading groups…') : t('No group assigned')}
                        emptyText={t('No group assigned')}
                        options={myGroups.map((g) => ({ value: g.code, label: g.name }))}
                        onChange={(code) => { setCurrentGroupCode(code); setNonce((n) => n + 1); }} />
            <ProfileMenu avatarUrl={myAvatarUrl} initial={(myName || 'T').trim().charAt(0).toUpperCase()} name={myName}
                         roleIcon={<TeacherRoleIcon />} roleLabel={t('Teacher')}
                         profileLabel={t('Profile')} chipTitle={t('Account menu')} onOpenProfile={() => showPage('profile')}
                         switchItem={canSwitchToAdmin ? { label: t('Switch to Admin panel'), onSelect: switchToAdmin } : null} />
          </div>
        </div>
        <div className="content">
          {guard.ok && groupsLoaded && <Page key={page + ':' + nonce} />}
        </div>
      </div>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} placeholder={t('Search pages…')} emptyText={t('No pages match.')}
                      items={[...flatNav, { page: 'profile', label: 'Profile', icon: <ProfileNavIcon /> }].map((n) => ({ page: n.page, icon: n.icon, label: t(n.label) }))}
                      onPick={showPage} />
      {guard.ok && <AiChat mode="teacher" user={user} name={myName} />}
      <ConfirmModal state={confirmState} onClose={closeConfirm} />
      <Toasts items={toasts} />
    </PanelContext.Provider>
  );
}

/** Route entry: `/teacher` (teacher or admin role — anyone else is sent to their dashboard, as in teacher.html). */
export default function Teacher() {
  return (
    <CabinetI18nProvider dict={teacherDict}>
      <TeacherInner />
      <BackToApp />
    </CabinetI18nProvider>
  );
}
