import { openSafe } from '../../lib/safeUrl';
import { useEffect, useMemo, useState, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import useLiveRefresh from '../../lib/liveRefresh';
import { usePanel } from '../../components/panel/PanelContext';
import { Modal } from '../../components/panel/ui';
import { lessonsOnLocalDate, fmtHHMM } from '../../lib/tzTime';
import { useExamDays, isExamDay, tashkentDateKey } from '../../lib/examDays';

const DEFAULT_LESSON_MINUTES = 120;

function fmtCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), sec = total % 60;
  const mm = String(m).padStart(2, '0'), ss = String(sec).padStart(2, '0');
  return h > 0 ? h + ':' + mm + ':' + ss : mm + ':' + ss;
}

function lessonStatus(lesson, now) {
  if (now < lesson.start) return 'upcoming';
  if (now > lesson.end) return 'finished';
  return 'ongoing';
}

/** Every lesson that falls on the viewer's own calendar day today (schedules are stored in Tashkent time and converted
 *  to the viewer's zone, so a late Tashkent class can legitimately land on the neighbouring local day). */
function buildTodayLessons(myGroups, counts, examDaysBy) {
  const n = new Date();
  const lessons = [];
  myGroups.forEach((g) => {
    if (!g.is_active || !Array.isArray(g.schedule_days)) return;
    lessonsOnLocalDate(g.schedule_days, n.getFullYear(), n.getMonth(), n.getDate(), examDaysBy[g.code]).forEach(({ instant }) => {
      const minutes = g.duration_minutes || DEFAULT_LESSON_MINUTES;
      lessons.push({ group: g, start: instant, end: new Date(instant.getTime() + minutes * 60000), students: counts[g.code] || 0 });
    });
  });
  lessons.sort((a, b) => a.start - b.start);
  return lessons;
}

export default function OverviewPage() {
  const { t, myGroups, myName, showPage, pending, currentGroup, setCurrentGroupCode } = usePanel();
  const [data, setData] = useState(null);   // null = loading
  const examDaysBy = useExamDays();          // an exam day replaces that group's lesson
  const [now, setNow] = useState(() => new Date());
  const [earlyJoin, setEarlyJoin] = useState({ open: false, msg: '' });

  const [liveTick, setLiveTick] = useState(0);
  const silentRef = useRef(false);
  useLiveRefresh(() => { silentRef.current = true; setLiveTick((n) => n + 1); });

  useEffect(() => {
    let cancelled = false;
    if (!silentRef.current) setData(null);
    silentRef.current = false;
    (async () => {
      if (myGroups.length === 0) { setData({ empty: true, counts: {}, joinCodes: {}, total: 0 }); return; }
      const codes = myGroups.map((g) => g.code);
      const [{ data: members }, { data: codeRows }] = await Promise.all([
        supabase.from('group_members').select('group_code, user_id').in('group_code', codes),
        supabase.from('group_access_codes').select('code, group_code').in('group_code', codes),
      ]);
      // Count STUDENTS, each once: a student in two groups was counted twice, and teacher / admin accounts that sit in a
      // group were counted as students (77 here vs 68 real students). Unknown roles (profile not readable) still count.
      const ids = [...new Set((members || []).map((m) => m.user_id))];
      const staff = new Set();
      if (ids.length) {
        const { data: profs } = await supabase.from('profiles').select('id, role').in('id', ids);
        (profs || []).forEach((p) => { if (p.role && p.role !== 'student') staff.add(p.id); });
      }
      const studentRows = (members || []).filter((m) => !staff.has(m.user_id));
      const counts = {};
      studentRows.forEach((m) => { counts[m.group_code] = (counts[m.group_code] || 0) + 1; });
      // The code students actually type to join is group_access_codes.code (NOT the internal groups.code).
      const joinCodes = {};
      (codeRows || []).forEach((r) => { if (!joinCodes[r.group_code]) joinCodes[r.group_code] = r.code; });
      if (!cancelled) setData({ empty: false, counts, joinCodes, total: new Set(studentRows.map((m) => m.user_id)).size });
    })();
    return () => { cancelled = true; };
  }, [myGroups, liveTick]);

  // Recompute lesson statuses + countdown every second without a refetch.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const todayKey = tashkentDateKey(new Date());
  const examToday = myGroups.filter((g) => g.is_active && isExamDay(examDaysBy[g.code], todayKey));   // exam day = no lesson, the exam takes its place
  const examTodayText = examToday.length ? t('Exam day today: {groups}').replace('{groups}', examToday.map((g) => g.name).join(', ')) : '';
  const todayLessons = useMemo(() => (data ? buildTodayLessons(myGroups, data.counts, examDaysBy) : []), [data, myGroups, examDaysBy]);

  function attemptJoinLesson(lesson) {
    if (!lesson || !lesson.group.zoom_link) return;
    const n = new Date();
    if (n < lesson.start) { setEarlyJoin({ open: true, msg: t('Class has not started yet.') + ' ' + t('Class time:') + ' ' + fmtHHMM(lesson.start) }); return; }
    if (n > lesson.end) { setEarlyJoin({ open: true, msg: t('This class has already ended.') }); return; }
    openSafe(lesson.group.zoom_link);
  }

  const ongoing = todayLessons.filter((l) => lessonStatus(l, now) === 'ongoing');
  const nextLesson = todayLessons.find((l) => lessonStatus(l, now) === 'upcoming') || null;
  // The running lesson lives in its own card above; the list below shows the rest of today's lessons.
  const listLessons = todayLessons.filter((l) => lessonStatus(l, now) !== 'ongoing');

  const statusLabel = { ongoing: t('Ongoing'), upcoming: t('Upcoming'), finished: t('Finished') };
  const ic = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const joinIcon = <svg {...ic}><rect x="2" y="6" width="14" height="12" rx="2" /><path d="m22 8-6 4 6 4V8Z" /></svg>;
  const lockIcon = <svg {...ic}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;
  const clockIcon = <svg {...ic}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>;
  const usersIcon = <svg {...ic}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
  const camIcon = <svg {...ic}><path d="M15 10l5-3v10l-5-3z" /><rect x="3" y="6" width="12" height="12" rx="2" /></svg>;
  const ic2 = <svg {...ic}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>;
  const layersIcon = <svg {...ic}><path d="m12 2 10 5-10 5L2 7l10-5Z" /><path d="m2 17 10 5 10-5M2 12l10 5 10-5" /></svg>;

  function lessonChips(lesson) {
    return (
      <div className="ready-chips">
        <span className="ready-chip">{clockIcon}{fmtHHMM(lesson.start) + ' \u2013 ' + fmtHHMM(lesson.end)}</span>
        <span className="ready-chip">{usersIcon}{lesson.students} {t('students')}</span>
        {lesson.group.zoom_link && <span className="ready-chip ready-chip-zoom">{camIcon}{t('Zoom ready')}</span>}
      </div>
    );
  }

  const hour = now.getHours();
  const hello = hour < 12 ? t('Good morning') : hour < 18 ? t('Good afternoon') : t('Good evening');
  const first = (myName || '').trim().split(/\s+/)[0];
  const qIc = (d) => <svg {...ic}>{d}</svg>;
  const QUICK = [
    { page: 'attendance', label: 'Take attendance', sub: 'Mark who came', icon: qIc(<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>) },
    { page: 'tasks', label: 'New task', sub: 'Assign homework', icon: qIc(<><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>) },
    { page: 'exams', label: 'Create an exam', sub: 'Questions and answer key', icon: qIc(<><path d="M9 2h6a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" /><path d="M9 8h6M9 12h6M9 16h4" /></>) },
    { page: 'announcements', label: 'Message students', sub: 'Group or one student', icon: qIc(<><path d="M3 11l18-5v12L3 14v-3z" /><path d="M11.6 16.8a2 2 0 0 1-3.6 1.2" /></>) },
    { page: 'media', label: 'Upload media', sub: 'Videos and audio', icon: qIc(<><rect x="2" y="5" width="14" height="14" rx="3" /><path d="M16 10l6-3v10l-6-3z" /></>) },
  ];
  const needsReview = pending.tasks;   // exam reminders are intentionally not shown to teachers

  return (
    <section className="page active" id="page-overview">
      <div className="greet">
        <div>
          <h1>{hello}{first ? ', ' + first : ''}</h1>
        </div>
      </div>
      <div className="kpi-row">
        {[
          { ico: usersIcon, num: data ? data.total : '\u2013', lbl: t('Students'), go: 'groups' },
          { ico: layersIcon, num: myGroups.length, lbl: t('Groups'), go: 'groups' },
          { ico: clockIcon, num: data ? todayLessons.length : '\u2013', lbl: t("Today's classes"), go: 'calendar' },
          { ico: ic2, num: pending.loaded ? pending.tasks : '\u2013', lbl: t('Tasks'), go: 'tasks', alert: pending.tasks > 0 },
        ].map((k, ki) => (
          <button type="button" className={'kpi' + (k.alert ? ' is-alert' : '')} key={ki + ':' + k.go} onClick={() => showPage(k.go)}>
            <span className="kpi-ico">{k.ico}</span>
            <span><span className="kpi-num">{k.num}</span><span className="kpi-lbl">{k.lbl}</span></span>
          </button>
        ))}
      </div>
      <div className="ov-top">
      <div className="ov-hero-col">
      {ongoing.length > 0 ? ongoing.map((lesson, i) => {
        const total = lesson.end - lesson.start;
        const pct = Math.min(100, Math.max(0, ((now - lesson.start) / total) * 100));
        return (
          <div className="ready-hero is-live" key={lesson.group.code + ':' + i}>
            <span className="ready-blob b1" /><span className="ready-blob b2" />
            <div className="ready-main">
              <div className="ready-eyebrow"><span className="ready-dot" />{t('Ready to teach')}<span className="ready-live-tag">{t('Live now')}</span></div>
              <div className="ready-title">{lesson.group.name}</div>
              <div className="ready-sub">{t('Time to join')}</div>
              {lessonChips(lesson)}
              <div className="ready-progress" role="progressbar" aria-label={t('Class progress')} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
                <span style={{ width: pct + '%' }} />
              </div>
              <div className="ready-progress-lbl"><span>{t('Class progress')} &middot; {Math.round(pct)}%</span><span>{t('Ends in')} {fmtCountdown(lesson.end - now)}</span></div>
            </div>
            <div className="ready-side">
              {lesson.group.zoom_link
                ? <button type="button" className="btn-join btn-join-live" onClick={() => attemptJoinLesson(lesson)}><span className="btn-join-ico">{joinIcon}</span><span>{t('Join class')}</span></button>
                : <div className="hero-empty">{t('Add a Zoom link to a group to enable quick join.')}</div>}
            </div>
          </div>
        );
      }) : (
        <div className={'ready-hero ' + (nextLesson ? 'is-next' : 'is-idle')}>
          <span className="ready-blob b1" /><span className="ready-blob b2" />
          <div className="ready-main">
            <div className="ready-eyebrow"><span className="ready-dot" />{t('Ready to teach')}{nextLesson && <span className="ready-live-tag soft">{t('Next class')}</span>}</div>
            <div className="ready-title">{nextLesson ? nextLesson.group.name : (examTodayText || t('No class to join right now'))}</div>
            {nextLesson && lessonChips(nextLesson)}
          </div>
          {nextLesson && (
            <div className="ready-side">
              <div className="ready-countdown"><span className="ready-countdown-lbl">{t('Starts in')}</span><span className="ready-countdown-num">{fmtCountdown(nextLesson.start - now)}</span></div>
              {nextLesson.group.zoom_link
                ? <button type="button" className="btn-join is-locked" aria-disabled="true" title={t('Locked until class time')} onClick={() => attemptJoinLesson(nextLesson)}><span className="btn-join-ico">{lockIcon}</span><span>{t('Join class')}</span></button>
                : <div className="hero-empty">{t('Add a Zoom link to a group to enable quick join.')}</div>}
            </div>
          )}
        </div>
      )}
      </div>

    <div className="panel panel-fancy ov-today">
      <div className="panel-head"><h3><span className="panel-head-bar" />{t("Today's classes")}</h3></div>
      <div className="lesson-grid" id="todayClassesGrid">
        {data === null ? <div className="empty-block">{t('Loading…')}</div>
          : data.empty ? <div className="empty-block">{t('No group has been assigned to you yet.')}</div>
          : todayLessons.length === 0 ? <div className="empty-block">{examTodayText || t('No classes scheduled for today.')}</div>
          : listLessons.length === 0 ? <div className="empty-block">{t('No more classes today.')}</div>
          : listLessons.map((lesson, i) => {
            const status = lessonStatus(lesson, now);
            const g = lesson.group;
            const roomLabel = g.room || (g.zoom_link ? t('Online') : t('In-person'));
            return (
              <div className={'lesson-card is-' + status} key={g.code + ':' + i}>
                <div className="lesson-card-top">
                  <div className="lesson-card-name">{g.name}</div>
                  <span className={'lesson-status ' + status}>{statusLabel[status]}</span>
                </div>
                <div className="lesson-card-time">{fmtHHMM(lesson.start)} {'\u2013'} {fmtHHMM(lesson.end)}</div>
                <div className="lesson-card-meta">
                  <span>{roomLabel}</span>
                  <span>{lesson.students} {t('students')}</span>
                </div>
                <div className="lesson-card-foot"><div className="lesson-code" title={t('Join code')}>{(data.joinCodes && data.joinCodes[g.code]) || '—'}</div></div>
              </div>
            );
          })}
      </div>
    </div>
      </div>

      <div className="two-col">
        <div className="panel panel-fancy">
          <div className="panel-head"><h3><span className="panel-head-bar" />{t('Quick actions')}</h3></div>
          <div className="qa-grid">
            {QUICK.map((q) => (
              <button type="button" className="qa" key={q.page} onClick={() => showPage(q.page)}>
                <span className="qa-ico">{q.icon}</span>
                <span>{t(q.label)}<small>{t(q.sub)}</small></span>
              </button>
            ))}
          </div>
        </div>
        <div className="panel panel-fancy">
          <div className="panel-head"><h3><span className="panel-head-bar" />{t('Needs your attention')}</h3></div>
          <div className="attn-list">
            {!pending.loaded ? <div className="empty-block">{t('Loading…')}</div> : (
              <>
                {pending.tasks > 0 && <button type="button" className="attn" onClick={() => showPage('tasks')}><b>{pending.tasks}</b><span>{t('Task submissions waiting for a grade')}</span><svg {...ic}><path d="m9 18 6-6-6-6" /></svg></button>}
                {needsReview === 0 && <div className="attn ok" style={{ cursor: 'default' }}><b>{'\u2713'}</b><span>{t('All caught up — nothing is waiting for review.')}</span></div>}
                {currentGroup && !currentGroup.zoom_link && <button type="button" className="attn" onClick={() => showPage('groups')}><b>!</b><span>{t('The selected group has no Zoom link yet.')}</span><svg {...ic}><path d="m9 18 6-6-6-6" /></svg></button>}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="panel panel-fancy">
        <div className="panel-head"><h3><span className="panel-head-bar" />{t('My groups')}<span className="mg-count" title={t('Groups')}>{myGroups.length}</span></h3></div>
        <div className="group-list-grid" id="scheduleStrip">
          {myGroups.map((g) => (
            <div className={'group-list-card' + (g.is_active ? ' is-active' : '')} key={g.code} role="button" tabIndex={0}
                 title={t('Open this group')}
                 onClick={() => { setCurrentGroupCode(g.code); showPage('groups'); }}
                 onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCurrentGroupCode(g.code); showPage('groups'); } }}>
              <div className="group-list-top">
                <div className="group-list-name">{g.name}</div>
                {g.is_active ? <span className="chip chip-active">{t('Active')}</span> : <span className="chip chip-inactive">{t('Inactive')}</span>}
              </div>
              <div className="group-list-sched">{g.schedule || '\u2014'}</div>
            </div>
          ))}
        </div>
      </div>

      <Modal open={earlyJoin.open} onClose={() => setEarlyJoin((s) => ({ ...s, open: false }))} id="earlyJoinOverlay" style={{ maxWidth: 420 }}>
        <div className="early-join">
          <div className="early-join-ico">{lockIcon}</div>
          <h3>{t('Ready to teach')}</h3>
          <p className="hint" style={{ fontSize: 14, color: 'var(--text)' }}>{earlyJoin.msg}</p>
          <div className="modal-actions"><button type="button" className="btn btn-gold" onClick={() => setEarlyJoin((s) => ({ ...s, open: false }))}>{t('Close')}</button></div>
        </div>
      </Modal>
    </section>
  );
}
