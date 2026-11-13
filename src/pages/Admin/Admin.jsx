import { useCallback, useEffect, useMemo, useState } from 'react';
import BackToApp from '../../components/BackToApp';
import { useNavigate } from 'react-router-dom';
import useScrollTop from '../../hooks/useScrollTop';
import useHashView, { readHashView } from '../../hooks/useHashView';
import Loader from '../../components/Loader';
import PageStyle from '../../components/PageStyle';
import CabinetLangSelect from '../../components/CabinetLangSelect';
import PillSelect, { GROUP_ICON } from '../../components/PillSelect';
import pageCss from './admin.css?inline';
import uiCss from './admin-ui.css?inline';
import chatCss from './admin-chat.css?inline';
import responsiveCss from './admin-responsive.css?inline';
import teacherCss from '../Teacher/teacher.css?inline';
import teacherCssV2 from '../Teacher/teacher-v2.css?inline';
import materialsCss from '../Teacher/materials-design.css?inline';
import teacherDesignCss from '../Teacher/teacher-design.css?inline';
import sidebarCss from '../../components/panel/panel-sidebar.css?inline';
import PanelSidebar from '../../components/panel/PanelSidebar';
import AiChat from '../Dashboard/AiChat/AiChat';
import CommandPalette from '../../components/panel/CommandPalette';
import teacherDictBase from '../../i18n/cabinet-teacher';
import teacherExtra from '../../i18n/teacher-extra';
import AnnouncementsPage from '../Teacher/AnnouncementsPage';
import AdminsPage from './AdminsPage';
import ResourcesPage from './ResourcesPage';
import LandingMediaPage from './LandingMediaPage';
import PaymentsPage from './PaymentsPage';
import PaywallGate from '../Dashboard/PaywallGate';
import { getMyAccess } from '../../lib/payments';
import useTableRefresh from '../../hooks/useLiveRefresh';
import paymentsDict from '../../i18n/admin-payments';
import { canOpenPage } from '../../lib/adminTiers';
import { fetchPanelProfile, inApp, outRoute, panelRoute, verifySuperAdmin } from '../../lib/panelAccess';
import PanelTabBar from '../../components/panel/PanelTabBar';
import panelSwitchDict from '../../i18n/panel-switch';
import examLevelsDict from '../../i18n/exam-levels';
import adminFill from '../../i18n/admin-fill';
import ProfileMenu from '../../components/panel/ProfileMenu';
import { CabinetI18nProvider, useCabinetI18n } from '../../context/CabinetI18nContext';
import adminDictBase from '../../i18n/cabinet-admin';
import fillMissing from '../../i18n/fill-missing';
import adminExtra from '../../i18n/admin-extra';
import adminRedesign from '../../i18n/admin-redesign';
import adminStaff from '../../i18n/admin-staff';

// Admin shares several pages with the teacher panel, so its dictionary = teacher + new strings + admin (admin wins).
import examModeDict from '../../i18n/exam-mode';
const adminDict = ['EN', 'UZ', 'RU', 'AR'].reduce((acc, k) => { acc[k] = { ...(adminFill[k] || {}), ...(examLevelsDict[k] || {}), ...(panelSwitchDict[k] || {}), ...(fillMissing[k] || {}), ...(teacherDictBase[k] || {}), ...(teacherExtra[k] || {}), ...(adminDictBase[k] || {}), ...(adminExtra[k] || {}), ...(adminRedesign[k] || {}), ...(adminStaff[k] || {}), ...(examModeDict[k] || {}), ...(paymentsDict[k] || {}) }; return acc; }, {});
const COLLAPSE_KEY = 'ufuq-panel-collapsed';
import { supabase } from '../../lib/supabaseClient';
import { getFreshUser, resolveFullName, useLiveName } from '../../lib/profileName';
import { useLiveAvatar } from '../../lib/avatarSync';
import useLiveRefresh from '../../lib/liveRefresh';
import { clearCachedRole, homeRoute, ufuqGetSession } from '../../lib/auth';
import { PanelContext } from '../../components/panel/PanelContext';
import ProfilePage from '../../components/panel/ProfilePage';
import { AdminRoleIcon, ConfirmModal, MenuIcon, ProfileNavIcon, Toasts, useConfirm, useIsMobile, useToasts } from '../../components/panel/ui';
import OverviewPage from './OverviewPage';
import GroupsPage from './GroupsPage';
import StudentsPage from './StudentsPage';
import ExamsPage from './ExamsPage';
import { AudioLessonsPage } from '../Teacher/MaterialsPage';

const GROUP_KEY = 'ufuq-admin-group';
const svg = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };

const I = {
  audio: <svg {...svg}><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>,
  overview: <svg {...svg}><rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" /><rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" /></svg>,
  teaching: <svg {...svg}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  students: <svg {...svg}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
  messages: <svg {...svg}><path d="M3 11l18-5v12L3 14v-3z" /><path d="M11.6 16.8a2 2 0 0 1-3.6 1.2" /></svg>,
  payments: <svg {...svg}><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>,
  admin: <svg {...svg}><path d="M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5l8-3z" /><path d="m9 12 2 2 4-4" /></svg>,
};

// Main admin: sections that open and close (like "My Learning" in the student panel).
const NAV_SUPER = [
  { page: 'overview', label: 'Overview', icon: I.overview },
  { id: 'teaching', label: 'Teaching', icon: I.teaching, items: [{ page: 'groups', label: 'Group' }, { page: 'students', label: 'Students' }, { page: 'exams', label: 'Exams' }] },
  { page: 'announcements', label: 'Messages', icon: I.messages },
  { page: 'payments', label: 'Payments', icon: I.payments },
  { id: 'administration', label: 'Administration', icon: I.admin, items: [{ page: 'landing', label: 'Landing page' }, { page: 'admins', label: 'Admins' }, { page: 'resources', label: 'Resources' }] },
];
// Ordinary admin: a short flat list — no section headings.
const NAV_STANDARD = [
  { page: 'overview', label: 'Overview', icon: I.overview },
  { page: 'materials', label: 'Audio lessons', icon: I.audio },
  { page: 'announcements', label: 'Messages', icon: I.messages },
];

const PAGE_LABEL = {
  overview: 'Overview', groups: 'Group', students: 'Students', exams: 'Exams', announcements: 'Messages', payments: 'Payments', landing: 'Landing page', admins: 'Admins', resources: 'Resources', profile: 'Profile', materials: 'Audio lessons',
};
const SUB = {
  overview: 'Your day at a glance', groups: 'Create and manage groups', students: 'Status and level of every student',
  exams: 'Written exams', announcements: 'Notify the group or one student', payments: 'Orders, access and payment settings', resources: 'Storage and API budget left', profile: 'Your account', materials: 'Audio for your own group',
};

const PAGES = {
  overview: OverviewPage, groups: GroupsPage, students: StudentsPage,
  exams: ExamsPage, profile: ProfilePage,
  announcements: AnnouncementsPage, payments: PaymentsPage, admins: AdminsPage, resources: ResourcesPage, landing: LandingMediaPage,
  materials: AudioLessonsPage,
};

function readSavedGroup() { try { return localStorage.getItem(GROUP_KEY); } catch (e) { return null; } }
function saveGroup(code) { try { localStorage.setItem(GROUP_KEY, code); } catch (e) { /* ignore */ } }

function AdminInner() {
  const { t, lang } = useCabinetI18n();
  const navigate = useNavigate();
  const [toasts, toast] = useToasts();
  const [confirmState, askConfirm, closeConfirm] = useConfirm();
  const isMobile = useIsMobile();

  const [guard, setGuard] = useState({ ok: false, msgKey: 'Checking…' });
  const [user, setUser] = useState(null);
  const [myName, setMyName] = useState('Admin');
  const [adminTier, setAdminTier] = useState('super'); // 'super' = main admin, 'standard' = limited admin
  const isSuper = adminTier !== 'standard';
  const [myAvatarUrl, setMyAvatarUrl] = useState(null);
  useLiveAvatar(user && user.id, setMyAvatarUrl); // photo changed on the Profile page / other tab shows here at once
  useLiveName(user && user.id, setMyName); // a rename anywhere (Profile page, other tab / device) shows up here at once
  const [allGroups, setMyGroups] = useState([]);   // every linked group, inactive ones too (only Admin → Groups shows those)
  const myGroups = useMemo(() => allGroups.filter((g) => g.is_active), [allGroups]); // everywhere else only ACTIVE groups exist
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [currentGroupCode, setCode] = useState(null);
  const [page, setPage] = useState(() => readHashView('overview', (v) => Object.prototype.hasOwnProperty.call(PAGES, v)));
  useHashView(page, 'overview'); // F5 qilinganda shu bo'limda qoladi
  const [nonce, setNonce] = useState(0);            // bumped on every navigation so a page re-fetches (old showPage())
  useScrollTop(page + ':' + nonce);                 // each sidebar click starts the section at the top
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch (e) { return false; } });
  const [cmdOpen, setCmdOpen] = useState(false);
  const toggleCollapsed = useCallback(() => setCollapsed((c) => { const v = !c; try { localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0'); } catch (e) { /* ignore */ } return v; }), []);
  const expandSidebar = useCallback(() => { setCollapsed(false); try { localStorage.setItem(COLLAPSE_KEY, '0'); } catch (e) { /* ignore */ } }, []);
  useEffect(() => {
    const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmdOpen((o) => !o); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => { document.title = 'Ufuq — Admin'; }, []);
  // admin-ui.css is scoped to body.adm so the Teacher panel (which shares some pages) keeps its own look
  useEffect(() => { document.body.classList.add('adm-shell'); return () => document.body.classList.remove('adm-shell'); }, []);
  // The Payments section keeps its original look: the page-level kit is switched off while it is open.
  useEffect(() => { document.body.classList.toggle('adm', page !== 'payments'); return () => document.body.classList.remove('adm'); }, [page]);

  /* ---- paywall for STANDARD admins: same rule as a student. Main admins and teachers are always free (server: user_has_access). ----
     null = not checked yet. Fails closed: if the access check cannot be read, a standard admin stays locked until it can. */
  const [payLock, setPayLock] = useState(null);
  const loadPayLock = useCallback(async () => {
    if (!guard.ok || adminTier !== 'standard') { setPayLock(null); return; }
    try {
      const a = await getMyAccess();
      setPayLock({ locked: !!(a && a.enforced && a.has_access === false) });
    } catch (e) {
      setPayLock({ locked: true });
    }
  }, [guard.ok, adminTier]);
  useEffect(() => { loadPayLock(); }, [loadPayLock]);
  // A payment confirmed anywhere (webhook, admin approval) reopens the panel without a reload.
  useTableRefresh(loadPayLock, [{ table: 'subscriptions', filter: user ? 'user_id=eq.' + user.id : undefined }], { enabled: !!user && adminTier === 'standard' });
  const payPending = adminTier === 'standard' && payLock === null;
  const payBlocked = adminTier === 'standard' && !!(payLock && payLock.locked);

  /* ---- auth + role guard: admin only ---- */
  useEffect(() => {
    let cancelled = false;
    let redirectTimer;
    (async () => {
      let session = null;
      try { session = await ufuqGetSession(); } catch (e) { session = null; }
      if (cancelled) return;
      if (!session) { clearCachedRole(); navigate(outRoute('/index'), { replace: true }); return; }
      setUser(session.user);
      setGuard({ ok: false, msgKey: 'Checking permissions…' });
      // Right after a Google sign-in the first read can fail for a moment: fetchPanelProfile retries before giving up.
      const { data, error } = await fetchPanelProfile(session.user.id);
      if (cancelled) return;
      if (error || !data) { // unreadable profile: never guess "student", go to sign-in
        setGuard({ ok: false, msgKey: 'Checking permissions…' });
        redirectTimer = setTimeout(() => navigate(outRoute('/index'), { replace: true }), 800);
        return;
      }
      if (data.role !== 'admin') {
        setGuard({ ok: false, msgKey: "You don't have access to the admin panel. Redirecting to your dashboard…" });
        redirectTimer = setTimeout(() => navigate(outRoute(homeRoute(data.role, data.admin_tier)), { replace: true }), 1400);
        return;
      }
      setAdminTier(data.admin_tier === 'standard' ? 'standard' : 'super');
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

  /* ---- the admin's groups (teacher_groups → groups) ---- */
  const reloadGroups = useCallback(async (opts) => {
    const silent = !!(opts && opts.silent);
    if (!user) return;
    let codes = [];
    // Every admin — main or ordinary — works with the groups linked to them (teacher_groups) and nothing else.
    {
      const { data: tg, error: tgErr } = await supabase.from('teacher_groups').select('group_code').eq('teacher_id', user.id);
      if (tgErr) { if (!silent) toast(t('Error loading groups:') + ' ' + tgErr.message, 'err'); return; }
      codes = (tg || []).map((r) => r.group_code);
    }
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
    const firstOpen = (groups.find((g) => g.is_active) || groups[0]).code;
    setCode((cur) => {
      const saved = cur || readSavedGroup();
      const g0 = groups.find((g) => g.code === saved);
      const keep = g0 && g0.is_active ? saved : firstOpen;   // an inactive group is never the working group
      saveGroup(keep);
      return keep;
    });
  }, [user, t, toast, adminTier]);

  useEffect(() => { if (guard.ok && user) reloadGroups(); }, [guard.ok, user]); // eslint-disable-line react-hooks/exhaustive-deps
  useLiveRefresh(reloadGroups);

  const setCurrentGroupCode = useCallback((code) => { setCode(code); saveGroup(code); }, []);
  const currentGroup = useMemo(() => allGroups.find((g) => g.code === currentGroupCode) || null, [allGroups, currentGroupCode]);

  const showPage = useCallback((name) => { setPage(name); setNonce((n) => n + 1); setSidebarOpen(false); }, []);

  const [announcePrefill, setAnnouncePrefill] = useState(null);
  const clearAnnouncePrefill = useCallback(() => setAnnouncePrefill(null), []);
  const goToAnnouncements = useCallback((userId, name) => { setAnnouncePrefill({ userId, name }); showPage('announcements'); }, [showPage]);

  // Only a Super Admin (main admin) may jump from the admin panel to the teacher panel.
  const canSwitchToTeacher = guard.ok && isSuper;

  const switchToTeacher = useCallback(async () => {
    if (await verifySuperAdmin()) { navigate(panelRoute('teacher')); return; }
    setAdminTier('standard'); // rights changed since load: the entry disappears, no navigation
    toast(t('You do not have access to the teacher panel.'), 'err');
  }, [navigate, toast, t]);

  const ctx = useMemo(() => ({
    t, lang, toast, askConfirm, user, myName, myAvatarUrl, setMyName, setMyAvatarUrl, myGroups, allGroups, currentGroup, currentGroupCode, setCurrentGroupCode, reloadGroups,
    announcePrefill, clearAnnouncePrefill, goToAnnouncements, showPage, pending: { tasks: 0, exams: 0, loaded: true },
    adminTier, isSuper, canSwitchToTeacher, can: (pg) => canOpenPage(adminTier, pg) && (isSuper || (pg !== 'admins' && pg !== 'landing' && pg !== 'resources')),
  }), [adminTier, isSuper, canSwitchToTeacher, t, lang, toast, askConfirm, user, myName, myAvatarUrl, setMyName, setMyAvatarUrl, myGroups, allGroups, currentGroup, currentGroupCode, setCurrentGroupCode, reloadGroups, announcePrefill, clearAnnouncePrefill, goToAnnouncements, showPage]);

  const nav = isSuper ? NAV_SUPER : NAV_STANDARD;
  const flatNav = useMemo(() => nav.flatMap((n) => (n.items ? n.items.map((i) => ({ ...i, icon: n.icon })) : [n])), [nav]);
  const Page = (flatNav.some((n) => n.page === page) || page === 'profile') ? PAGES[page] : PAGES.overview;
  const activePage = Page === PAGES[page] ? page : 'overview';
  const navLabel = PAGE_LABEL[activePage] || activePage;

  return (
    <PanelContext.Provider value={ctx}>
      <PageStyle css={pageCss} />
      <PageStyle css={chatCss} />
      <PageStyle css={teacherCss} />
      <PageStyle css={teacherCssV2} />
      <PageStyle css={teacherDesignCss} />
      <PageStyle css={materialsCss} />
      <PageStyle css={sidebarCss} />
      <PageStyle css={uiCss} />
      <PageStyle css={responsiveCss} />

      {!guard.ok && (
        <div className="guard-overlay" id="guardOverlay">
          <Loader label={t(guard.msgKey)} />
        </div>
      )}

      <div className="sidebar-backdrop" id="sidebarBackdrop" onClick={() => setSidebarOpen(false)}
           style={{ display: sidebarOpen ? 'block' : 'none', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40 }} />
      <PanelSidebar variant="admin" showStudentLink={!isSuper} brandSuffix={t('Admin')} tag={t('Admin panel')} nav={nav} page={activePage} onNavigate={showPage}
                    collapsed={collapsed} onToggleCollapsed={toggleCollapsed} onExpand={expandSidebar} open={sidebarOpen} isMobile={isMobile} />

      <div className="main">
        <div className="topbar">
          <button className="icon-btn menu-toggle-btn" id="menuToggle" aria-label={t('Menu')} style={{ display: isMobile ? 'inline-flex' : 'none' }}
                  onClick={() => setSidebarOpen((o) => !o)}><MenuIcon /></button>
          <div className="crumb">
            <span className="crumb-title" id="crumbLabel">{t(navLabel)}</span>
            <span className="crumb-sub">{t(SUB[page] || 'Admin panel')}{currentGroup ? ' \u00b7 ' + currentGroup.name : ''}</span>
          </div>
          <div className="top-right">
            <button type="button" className="top-search" onClick={() => setCmdOpen(true)} aria-label={t('Search pages…')}>
              <svg {...svg}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg><span>{t('Search pages…')}</span><kbd>Ctrl K</kbd>
            </button>
            <CabinetLangSelect />
            <PillSelect id="groupSelect" icon={GROUP_ICON} ariaLabel={t('Group')} value={currentGroupCode || ''}
                        disabled={!groupsLoaded || myGroups.length === 0}
                        placeholder={!groupsLoaded ? t('Loading groups…') : t('No group assigned')}
                        emptyText={t('No group assigned')}
                        options={myGroups.map((g) => ({ value: g.code, label: g.name }))}
                        onChange={(code) => { setCurrentGroupCode(code); setNonce((n) => n + 1); }} />
            <ProfileMenu avatarUrl={myAvatarUrl} initial={(myName || 'A').trim().charAt(0).toUpperCase()} name={myName}
                         roleIcon={<AdminRoleIcon />} roleLabel={t(isSuper ? 'Main admin' : 'Admin')}
                         profileLabel={t('Profile')} chipTitle={t('Account menu')} onOpenProfile={() => showPage('profile')}
                         switchItem={canSwitchToTeacher ? { label: t('Switch to Teacher panel'), onSelect: switchToTeacher } : null} />
          </div>
        </div>

        <div className="content">
          {guard.ok && groupsLoaded && !payPending && (payBlocked
            ? <PaywallGate onNavigate={() => navigate(outRoute('/dashboard#billing'))} />
            : <Page key={page + ':' + nonce} />)}
        </div>
      </div>

      {inApp() && isMobile && guard.ok && <PanelTabBar items={isSuper ? ['overview', 'groups', 'students', 'announcements'] : ['overview', 'materials', 'announcements']} nav={flatNav} page={activePage} onNavigate={showPage} onMore={() => setSidebarOpen((o) => !o)} moreOpen={sidebarOpen} />}
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} placeholder={t('Search pages…')} emptyText={t('No pages match.')}
                      items={[...flatNav, { page: 'profile', label: 'Profile', icon: <ProfileNavIcon /> }].map((n) => ({ page: n.page, icon: n.icon, label: t(n.label) }))}
                      onPick={showPage} />
      {guard.ok && !payBlocked && <AiChat mode="teacher" user={user} name={myName} />}
      <ConfirmModal state={confirmState} onClose={closeConfirm} />
      <Toasts items={toasts} />
    </PanelContext.Provider>
  );
}

/** Route entry: `/admin` (admin role only — anyone else is sent to their dashboard, as in admin.html). */
export default function Admin() {
  return (
    <CabinetI18nProvider dict={adminDict}>
      <AdminInner />
      <BackToApp />
    </CabinetI18nProvider>
  );
}
