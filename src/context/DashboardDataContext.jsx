import { getFreshUser, resolveFullName, useLiveName } from '../lib/profileName';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import useLiveRefresh from '../lib/liveRefresh';
import useLiveProfileRow from '../hooks/useLiveRefresh';
import { getMyAccess } from '../lib/payments';
import { supabase } from '../lib/supabaseClient';
import { fetchExamDays } from '../lib/examDays';
import { imageMime } from '../lib/imageCompress';
import { useLiveAvatar } from '../lib/avatarSync';
import { useAuth } from './AuthContext';

export const DashboardDataContext = createContext(null);

/** Port of UFUQ_LEVEL_NAMES / getUserLevel() — one source of truth for the student's level (1–14). */
export const LEVEL_NAMES = ['Beginner', 'Elementary', 'Pre-Intermediate', 'Intermediate', 'Upper-Intermediate', 'Advanced', 'Proficient', 'Mastery', 'Expert', 'Scholar', 'Distinguished', 'Elite', 'Sage', 'Luminary'];
export function clampLevel(raw) {
  const n = parseInt(raw || 1, 10);
  return Math.min(Math.max(Number.isNaN(n) ? 1 : n, 1), LEVEL_NAMES.length);
}

/** The group the student last picked in the topbar switcher (a student can now belong to several groups). */
const activeGroupKey = (uid) => 'ufuq-active-group:' + uid;
function readActiveGroup(uid) { try { return localStorage.getItem(activeGroupKey(uid)); } catch (e) { return null; } }
function writeActiveGroup(uid, code) {
  try { if (code) localStorage.setItem(activeGroupKey(uid), code); else localStorage.removeItem(activeGroupKey(uid)); } catch (e) { /* storage blocked */ }
}

/**
 * Loads what every cabinet view needs once: the user's profile row (name, role,
 * avatar) and real group membership from Supabase (never trusted from localStorage).
 * Port of the boot sequence in dashboard.html's inline script.
 */
export function DashboardDataProvider({ children }) {
  const { user } = useAuth();
  const [name, setName] = useState(() => localStorage.getItem('ufuq-profile-name') || '');
  useLiveName(user && user.id, setName);
  const [role, setRole] = useState(null);
  const [level, setLevel] = useState(1);
  const [levelFree, setLevelFree] = useState(false);   // a free (test) account: its level does not limit exams / groups
  const [status, setStatus] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState(() => { try { return (user && localStorage.getItem('ufuq-avatar:' + user.id)) || null; } catch (e) { return null; } });
  useLiveAvatar(user && user.id, setAvatarUrl); // a new / removed photo shows up in every panel at once
  const [notif, setNotif] = useState({ notif_lessons: true, notif_tasks: true, notif_group: true });
  const [groupCode, setGroupCode] = useState(null);
  const [groupData, setGroupData] = useState(null);
  const [groupReady, setGroupReady] = useState(false);
  const [groups, setGroups] = useState([]); // every active group the student belongs to: [{ code, name, type }]
  const [access, setAccess] = useState(null); // my_access(): { enforced, exempt, active, ends_at, has_access } — null until loaded
  const groupRowsRef = useRef({}); // code -> groupData, so switching groups is instant

  /**
   * Port of UfuqSecurity.refresh(): re-reads the real membership + `groups` row from Supabase (the single source of
   * truth). Also called right after joining, because join_group()'s snapshot may lack group.type / slot settings.
   */
  const loadGroup = useCallback(async (isCancelled = () => false, silent = false) => {
    if (!user) return;
    try {
      // A student can belong to several groups: read all memberships, then the group rows.
      const { data: memberships, error: membershipError } = await supabase
        .from('group_members').select('group_code, joined_at').eq('user_id', user.id).order('joined_at', { ascending: true });
      if (membershipError) throw membershipError;
      const codes = (memberships || []).map((m) => m.group_code);
      let rows = [];
      if (codes.length) {
        const { data: groupRows, error: groupError } = await supabase
          .from('groups')
          .select('code, name, schedule, schedule_days, zoom_link, type, slot_minutes, buffer_minutes, no_show_minutes')
          .in('code', codes).eq('is_active', true);
        if (groupError) throw groupError;
        rows = groupRows || [];
      }
      const examDaysByGroup = codes.length ? await fetchExamDays(codes) : {};   // exam days replace that day's lesson
      if (isCancelled()) return;
      const byCode = {};
      rows.forEach((r) => {
        byCode[r.code] = {
          name: r.name, schedule: r.schedule, scheduleDays: r.schedule_days || [], examDays: examDaysByGroup[r.code] || [],
          zoomLink: r.zoom_link, type: r.type || 'class',
          slotMinutes: r.slot_minutes || 10, bufferMinutes: r.buffer_minutes || 2,
          noShowMinutes: r.no_show_minutes || 3,
        };
      });
      groupRowsRef.current = byCode;
      // Alifbo tartibida: Guruh A, keyin Guruh B ... (raqamlar ham to'g'ri tartiblanadi: 2 < 10)
      const list = codes.filter((c) => byCode[c]).map((c) => ({ code: c, name: byCode[c].name, type: byCode[c].type }))
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true, sensitivity: 'base' }));
      setGroups((cur) => (JSON.stringify(cur) === JSON.stringify(list) ? cur : list));

      // Working group = the one picked last time (if still a member and running), else the first running one.
      // Only RUNNING groups count: a student whose group is switched off has no working group at all, so nothing of the
      // closed group is shown (Home explains why with the "Your group is closed" card). It used to fall back to the
      // switched-off group's code, which kept its tasks, lessons and chat on screen.
      const candidates = list.map((g) => g.code);
      const preferred = readActiveGroup(user.id);
      const code = candidates.includes(preferred) ? preferred : (candidates[0] || null);
      writeActiveGroup(user.id, code);
      setGroupCode(code);
      const nextData = code && byCode[code] ? byCode[code] : null;
      setGroupData((cur) => (JSON.stringify(cur) === JSON.stringify(nextData) ? cur : nextData)); // unchanged → same reference

      // join_group() also flips profiles.status to 'active' server-side — pick that up now, not only after a reload
      // (otherwise the notifications bell etc. stay hidden until F5).
      try {
        const { data: prof } = await supabase.from('profiles').select('status, level, level_free').eq('id', user.id).maybeSingle();
        if (!isCancelled() && prof) { setStatus(prof.status || null); setLevel(clampLevel(prof.level)); setLevelFree(!!prof.level_free); }
      } catch (e) { /* non-fatal */ }
    } catch (err) {
      console.error("Guruh a'zoligini olishda xatolik:", err.message);
      if (!isCancelled() && !silent) { setGroupCode(null); setGroupData(null); setGroups([]); } // a network blip during a silent refresh must not kick the student out
    } finally {
      if (!isCancelled()) setGroupReady(true);
    }
  }, [user]);

  useLiveRefresh(() => loadGroup(() => false, true));

  // Level / status set by an admin: pick it up at once (Realtime + focus + poll), independent of the group loader.
  const pullProfileRow = useCallback(async () => {
    if (!user) return;
    try {
      const { data: prof } = await supabase.from('profiles').select('status, level, level_free').eq('id', user.id).maybeSingle();
      if (prof) { setStatus(prof.status || null); setLevel(clampLevel(prof.level)); setLevelFree(!!prof.level_free); }
    } catch (e) { /* keep the last known values */ }
  }, [user]);
  useLiveProfileRow(pullProfileRow, user ? [{ table: 'profiles', filter: 'id=eq.' + user.id }] : [], { enabled: !!user });

  // Paid access (prepaid period). Re-read quietly so a just-approved bank transfer unlocks the cabinet without a reload.
  const loadAccess = useCallback(async () => {
    if (!user) return;
    try { setAccess(await getMyAccess()); } catch (e) { /* keep the last known state */ }
  }, [user]);
  useEffect(() => { loadAccess(); }, [loadAccess]);
  useLiveRefresh(() => loadAccess());

  // Attendance lock (supabase/migrations/20261202_attendance_lock.sql): 3 missed lessons in a month close the lesson sections like an
  // unpaid plan, until a teacher / admin allows access. Dormant until that migration is installed: if the server function does not
  // exist, nobody is ever locked by it.
  const [attLock, setAttLock] = useState(null);
  const loadAttLock = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase.rpc('my_attendance_lock');
      setAttLock(!error && data && typeof data === 'object' ? data : null);
    } catch (e) { /* keep the last known state */ }
  }, [user]);
  useEffect(() => { loadAttLock(); }, [loadAttLock]);
  useLiveRefresh(() => loadAttLock());

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const fallbackName = (user.user_metadata && user.user_metadata.full_name) || user.email.split('@')[0] || 'Student';
    setName((cur) => cur || fallbackName);
    localStorage.setItem('ufuq-profile-email', user.email || '');

    (async () => {
      try {
        const { data: profileRow, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();
        if (error) throw error;
        if (cancelled || !profileRow) return;
        const fresh = await getFreshUser(user);
        if (cancelled) return;
        const savedName = resolveFullName(fresh, profileRow.full_name);
        if (savedName) {
          setName(savedName);
          localStorage.setItem('ufuq-profile-name', savedName);
        }
        setRole(profileRow.role || null);
        setLevel(clampLevel(profileRow.level));
        setLevelFree(!!profileRow.level_free);
        setStatus(profileRow.status || null);
        const savedAvatar = profileRow.avatar_url || (user.user_metadata && user.user_metadata.avatar_url) || null;
        if (savedAvatar) {
          setAvatarUrl(savedAvatar);
          try { localStorage.setItem('ufuq-avatar:' + user.id, savedAvatar); } catch (e) { /* storage blocked */ }
        } else {
          setAvatarUrl(null);
          try { localStorage.removeItem('ufuq-avatar:' + user.id); } catch (e) { /* storage blocked */ }
        }
        setNotif({
          notif_lessons: profileRow.notif_lessons !== false,
          notif_tasks: profileRow.notif_tasks !== false,
          notif_group: profileRow.notif_group !== false,
        });
      } catch (err) {
        console.error('Profil ma\'lumotlarini olishda xatolik:', err.message);
      }
    })();

    loadGroup(() => cancelled);

    return () => { cancelled = true; };
  }, [user, loadGroup]);

  /** Make `code` the active group (topbar switcher, or right after joining one). Remembered across refreshes. */
  const switchGroup = useCallback((code, fallbackData) => {
    if (!user || !code) return;
    if (fallbackData && !groupRowsRef.current[code]) groupRowsRef.current = { ...groupRowsRef.current, [code]: fallbackData }; // e.g. join_group() snapshot
    writeActiveGroup(user.id, code);
    setGroupCode(code);
    setGroupData(groupRowsRef.current[code] || null);
    // A group the student has just joined appears in the topbar switcher at once (the re-read of memberships follows).
    const row = groupRowsRef.current[code];
    if (row) setGroups((cur) => (cur.some((g) => g.code === code) ? cur
      : [...cur, { code, name: row.name, type: row.type }].sort((x, y) => String(x.name || '').localeCompare(String(y.name || ''), undefined, { numeric: true, sensitivity: 'base' }))));
  }, [user]);

  const value = useMemo(
    () => ({ user, name, setName, role, level, levelFree, status, avatarUrl, setAvatarUrl, isPaid: status === 'active' || role === 'teacher' || (access ? !!access.exempt : role === 'admin'), access, refreshAccess: loadAccess, payLocked: !!(access && access.enforced && access.has_access === false), attLock, attendanceLocked: !!(attLock && attLock.locked && role === 'student'), lockReason: (access && access.enforced && access.has_access === false) ? 'payment' : (attLock && attLock.locked && role === 'student' ? 'attendance' : null), refreshAttLock: loadAttLock, locked: !!(access && access.enforced && access.has_access === false) || !!(attLock && attLock.locked && role === 'student'), accessPending: !!user && access === null, notif, setNotif, groupCode, groupData, groupReady, groups, switchGroup, setGroupCode, setGroupData, refreshGroup: (silent) => loadGroup(() => false, silent === true) }),
    [user, name, setName, role, level, levelFree, status, avatarUrl, notif, access, loadAccess, attLock, loadAttLock, groupCode, groupData, groupReady, groups, switchGroup, loadGroup]
  );
  return <DashboardDataContext.Provider value={value}>{children}</DashboardDataContext.Provider>;
}

export function useDashboardData() {
  const ctx = useContext(DashboardDataContext);
  if (!ctx) throw new Error('useDashboardData must be used inside <DashboardDataProvider>');
  return ctx;
}

/* ---- Supabase reads shared by several cabinet views (Home, My Group, Tasks…) ---- */

export async function getGroupMembers(code) {
  try {
    const { data, error } = await supabase
      .from('group_members').select('user_id, name, avatar_url').eq('group_code', code).order('joined_at', { ascending: true });
    if (error) throw error;
    return (data || []).map((row) => ({ user_id: row.user_id, name: row.name, avatar_url: row.avatar_url || null }));
  } catch (err) {
    console.error("Guruh a'zolarini olishda xatolik:", err.message);
    return [];
  }
}

export async function getTasksForGroup(code) {
  try {
    const { data, error } = await supabase
      .from('tasks').select('id, title, description, due_date').eq('group_code', code).order('due_date');
    if (error) throw error;
    return (data || []).map((t) => ({ id: t.id, title: t.title, desc: t.description || '', due: t.due_date }));
  } catch (err) {
    console.error('Tasks olishda xatolik:', err.message);
    return [];
  }
}

// A homework submission may hold up to MAX_TASK_PHOTOS photos: the first one in file_path / file_name, the others in the jsonb column
// extra_files (migration 20261125). Until that migration is applied the column does not exist; this is detected on the first read and
// the page then accepts ONE photo, exactly as before.
export const MAX_TASK_PHOTOS = 5;
let EXTRA_FILES_OK = null;   // null = not known yet, true / false after the first read
export const manyPhotosSupported = () => EXTRA_FILES_OK !== false;

export async function getTaskSubmissions(userId) {
  if (!userId) return {};
  try {
    const cols = 'task_id, file_name, file_path, submitted_at, grade, feedback, graded_at';
    let res = await supabase.from('task_submissions').select(cols + ', extra_files').eq('user_id', userId);
    if (res.error && /extra_files/i.test(res.error.message || '')) {
      EXTRA_FILES_OK = false;
      res = await supabase.from('task_submissions').select(cols).eq('user_id', userId);
    } else if (!res.error) {
      EXTRA_FILES_OK = true;
    }
    if (res.error) throw res.error;
    const map = {};
    (res.data || []).forEach((s) => {
      const extra = Array.isArray(s.extra_files) ? s.extra_files.filter((x) => x && x.path) : [];
      const files = s.file_path ? [{ path: s.file_path, name: s.file_name }, ...extra.map((x) => ({ path: x.path, name: x.name || '' }))] : [];   // [] = cleaned up after 2 months
      map[s.task_id] = { fileName: s.file_name, filePath: s.file_path, files, submittedAt: s.submitted_at, grade: s.grade || '', feedback: s.feedback || '', gradedAt: s.graded_at || null };
    });
    return map;
  } catch (err) {
    console.error('Topshirilgan vazifalarni olishda xatolik:', err.message);
    return {};
  }
}
export async function getAttendanceData(code, userId) {
  if (!userId) return [];
  try {
    const { data: sessions, error: sessErr } = await supabase
      .from('attendance_sessions').select('id, session_date').eq('group_code', code).order('session_date');
    if (sessErr) throw sessErr;
    if (!sessions || !sessions.length) return [];
    const ids = sessions.map((s) => s.id);
    const { data: records, error: recErr } = await supabase
      .from('attendance_records').select('session_id, present').eq('user_id', userId).in('session_id', ids);
    if (recErr) throw recErr;
    const byId = {};
    (records || []).forEach((r) => { byId[r.session_id] = r.present; });
    // Only sessions the teacher has actually marked for this student are counted.
    return sessions.filter((s) => byId[s.id] !== undefined).map((s) => ({ date: s.session_date, present: !!byId[s.id] }));
  } catch (err) {
    console.error("Attendance ma'lumotini olishda xatolik:", err.message);
    return [];
  }
}

export async function getAttendanceRate(code, userId) {
  const sessions = await getAttendanceData(code, userId);
  if (!sessions.length) return 0;
  return Math.round((sessions.filter((s) => s.present).length / sessions.length) * 100);
}

const EMPTY_PROGRESS = { Listening: 0, Speaking: 0, Reading: 0, Writing: 0 };

/** Port of getProgressData(): the student's own `student_progress` row for this group (zeros if none yet). */
export async function getProgressData(code, userId) {
  if (!userId) return { ...EMPTY_PROGRESS };
  try {
    const { data, error } = await supabase
      .from('student_progress').select('listening, speaking, reading, writing')
      .eq('user_id', userId).eq('group_code', code).maybeSingle();
    if (error) throw error;
    if (!data) return { ...EMPTY_PROGRESS };
    return { Listening: data.listening, Speaking: data.speaking, Reading: data.reading, Writing: data.writing };
  } catch (err) {
    console.error("Progress ma'lumotini olishda xatolik:", err.message);
    return { ...EMPTY_PROGRESS };
  }
}

/** Port of getOverallProgress(): average of the four skills, rounded. */
export function overallFromProgress(data) {
  const vals = Object.values(data);
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
}

/** Uploads the photos (1..MAX_TASK_PHOTOS) to the private "task-submissions" bucket (folder = the student's id; files older than 2 months
 *  are removed automatically by the cleanup-task-files function) and records them. A new submission REPLACES the previous photos.
 *  Resolves { ok, error? } — never throws. */
export async function saveTaskSubmission(userId, taskId, files) {
  if (!userId) return { ok: false, error: 'NOT_SIGNED_IN' };
  const list = (Array.isArray(files) ? files : [files]).filter(Boolean).slice(0, MAX_TASK_PHOTOS);
  if (list.length === 0) return { ok: false, error: 'NO_FILE' };
  const mimes = list.map((f) => imageMime(f));                    // homework is photos only (any image format)
  if (mimes.some((m) => !m)) return { ok: false, error: 'NOT_AN_IMAGE' };
  if (list.length > 1 && EXTRA_FILES_OK === false) return { ok: false, error: 'MANY_NOT_SUPPORTED' };
  try {
    const stamp = Date.now();
    const uploaded = await Promise.all(list.map(async (file, i) => {
      const safe = String(file.name || 'photo').replace(/[^\w.\-]+/g, '_').slice(-70);
      const path = `${userId}/${taskId}-${stamp}-${i + 1}-${safe}`;
      const { error: uploadError } = await supabase.storage.from('task-submissions').upload(path, file, { upsert: true, contentType: mimes[i] });
      if (uploadError) throw uploadError;
      return { path, name: file.name || 'photo' };
    }));
    const row = { task_id: taskId, user_id: userId, file_path: uploaded[0].path, file_name: uploaded[0].name, submitted_at: new Date().toISOString() };
    if (EXTRA_FILES_OK !== false) row.extra_files = uploaded.slice(1);   // also clears the extras of an earlier submission
    let { error } = await supabase.from('task_submissions').upsert(row, { onConflict: 'task_id,user_id' });
    if (error && row.extra_files && list.length === 1 && /extra_files/i.test(error.message || '')) {   // column not there yet
      EXTRA_FILES_OK = false;
      delete row.extra_files;
      ({ error } = await supabase.from('task_submissions').upsert(row, { onConflict: 'task_id,user_id' }));
    }
    if (error) throw error;
    return { ok: true, paths: uploaded.map((u) => u.path) };
  } catch (err) {
    console.error('Vazifani topshirishda xatolik:', err.message);
    return { ok: false, error: (err && err.message) || String(err) };
  }
}