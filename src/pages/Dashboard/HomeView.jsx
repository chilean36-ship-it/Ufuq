import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCabinetI18n } from '../../context/CabinetI18nContext';
import { useDashboardData, LEVEL_NAMES, getGroupMembers, getTasksForGroup, getTaskSubmissions, getAttendanceData } from '../../context/DashboardDataContext';
import useLiveRefresh from '../../hooks/useLiveRefresh';
import { getCurrentWeekDates, scheduleDaysToWeekArray, fmtDueDate, isOverdue, MONTH_NAMES } from './weekUtils';
import { computeMonthAttendance, fmtPct, LEVEL_COLORS } from '../../lib/attendanceMonth';
import { LessonBlocks, statusMessage } from './AttendanceView';
import { getExamHistory, fetchGroupRanking } from './Exam/examData';
import ProgressLine, { LINE_CSS } from '../../components/ProgressLine';
import PageStyle from '../../components/PageStyle';
import ClosedGroupNotice from './ClosedGroupNotice';

import { fmtDate } from '../../lib/dateLocale';
const LOCK_ICON = (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
  </svg>
);

const HOME_CSS = `
.home-panel{ transition:transform .18s ease, border-color .18s ease, box-shadow .18s ease; }
.home-panel:hover{ transform:translateY(-3px); border-color:var(--gold); box-shadow:0 14px 34px rgba(0,0,0,.28); }
.home-panel.is-link{ cursor:pointer; }
.hp-mini{ transition:transform .15s ease, border-color .15s ease; } .hp-mini:hover{ transform:translateY(-2px); border-color:var(--gold); }
.hp-row,.hr-row{ transition:background .15s ease, transform .15s ease; } .hp-row:hover,.hr-row:hover{ transform:translateX(3px); }
@media (prefers-reduced-motion:reduce){ .home-panel,.hp-mini,.hp-row,.hr-row{ transition:none; } .home-panel:hover{ transform:none; } }
/* alignment: panel titles/notes stay on one visual line, long text wraps inside its own box */
#homeView .panel-head{ display:flex; align-items:center; justify-content:space-between; gap:8px; min-width:0; }
#homeView .panel-head h3{ min-width:0; text-align:start; overflow-wrap:anywhere; }
#homeView .panel-head-note{ white-space:nowrap; }
#homeView .sched-row .title, #homeView .hr-name, #homeView .hp-row-title{ min-width:0; overflow-wrap:anywhere; text-align:start; }
/* micro-interaction: locked state settles in softly */
@keyframes hpLockIn{ from{ opacity:0; transform:translateY(6px); } to{ opacity:1; transform:none; } }
.hp-locked{ animation:hpLockIn .35s ease both; }
.hp-locked-orb{ transition:transform .25s ease; }
.home-panel:hover .hp-locked-orb{ transform:scale(1.06); }
@media (max-width:640px){ .hp-locked{ min-height:120px; padding:14px 6px; } }
@media (prefers-reduced-motion:reduce){ .hp-locked, .hp-locked-orb{ animation:none; transition:none; } .home-panel:hover .hp-locked-orb{ transform:none; } }
.hp-locked{ flex:1 1 auto; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; min-height:150px; padding:18px 8px; text-align:center; }
.hp-locked-orb{ width:46px; height:46px; border-radius:50%; display:grid; place-items:center; color:var(--gold-bright); background:var(--gold-dim); border:1px solid rgba(201,162,75,.35); margin-bottom:4px; }
.hp-locked-title{ margin:0; font-family:'Fraunces',serif; font-size:15px; font-weight:600; color:var(--text); }
.hp-locked-sub{ margin:0; font-size:12.5px; line-height:1.55; color:var(--text-muted); max-width:28ch; text-wrap:balance; }
`;

/** Unified lock state for every Home panel: no buttons, just the reason and where to see it. */
function Locked({ noGroup }) {
  const { t } = useCabinetI18n();
  // A paid student who is in no running group (removed, or his group was switched off) is not asked to pay again.
  return (
    <div className="hp-locked" role="status">
      <span className="hp-locked-orb" aria-hidden="true">{LOCK_ICON}</span>
      <p className="hp-locked-title">{noGroup ? t('No group yet') : t('Payment not made')}</p>
      <p className="hp-locked-sub">{noGroup ? t('You will see this section as soon as you are in a running group.') : t('Pay to see this section.')}</p>
    </div>
  );
}

/** Link props only when the panel is actually open — locked panels are not clickable. */
const linkProps = (onNavigate, joined, view) => (joined
  ? { role: 'link', tabIndex: 0, onClick: () => onNavigate(view), onKeyDown: (e) => { if (e.key === 'Enter') onNavigate(view); } }
  : {});

function PanelHead({ title, note }) {
  return (
    <div className="panel-head">
      <h3 style={{ margin: 0 }}>{title}</h3>
      {note && <div className="panel-head-right"><span className="panel-head-note">{note}</span></div>}
    </div>
  );
}

/** Home dashboard — welcome banner + Tasks / Schedule / Attendance / Ranking / Progress panels. */
export default function HomeView({ onNavigate }) {
  const { t, lang } = useCabinetI18n();
  const { user, name, level, groupCode, groupData, groupReady, refreshGroup, locked, isPaid } = useDashboardData();
  const joined = !!groupCode && !locked; // unpaid (expired) members stay in the group, but its content stays closed until they pay
  const noGroup = groupReady && !groupCode && !locked && !!isPaid;   // paid, but in no running group
  const userId = user && user.id;

  // Re-render once a minute so "Now / Done / Upcoming" and the week strip follow the clock (and midnight).
  const [, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick((n) => n + 1), 60000); return () => clearInterval(id); }, []);
  const dayKey = new Date().toDateString();
  const currentWeek = useMemo(() => getCurrentWeekDates(), [dayKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [dayIndex, setDayIndex] = useState(() => { const i = currentWeek.findIndex((w) => w.isToday); return i < 0 ? 0 : i; });

  // null = still loading. Every number below comes from Supabase and is re-read whenever it changes.
  const [tasks, setTasks] = useState(null);
  const [members, setMembers] = useState(null);
  const [att, setAtt] = useState(null);       // chronological [{ date, present }] the teacher has marked
  const [examHistory, setExamHistory] = useState(null); // every exam result, oldest first — the Progress panel shows the last 30 days

  const [ranking, setRanking] = useState(null); // { [userId]: { avg, taken } } from the exam results

  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const load = useCallback(async () => {
    if (!groupReady) return;
    if (!joined) { setTasks([]); setMembers([]); setAtt(null); setExamHistory([]); return; }
    const [rows, submissions, memberRows, sessions, hist, rankRows] = await Promise.all([
      getTasksForGroup(groupCode), getTaskSubmissions(userId), getGroupMembers(groupCode),
      getAttendanceData(groupCode, userId), getExamHistory(groupCode, userId), fetchGroupRanking(groupCode),
    ]);
    if (!alive.current) return;
    const rmap = {};
    (rankRows || []).forEach((r) => { rmap[r.userId] = { avg: r.avg, taken: r.taken }; });
    setRanking(rmap);

    const withStatus = rows.map((row) => {
      const sub = submissions[row.id];
      const overdue = !sub && isOverdue(row.due);
      // Status text is plain English in the original (never wrapped in TT()) — kept as-is.
      return { ...row, sub, overdue, statusText: sub ? 'Submitted' : overdue ? 'Overdue' : 'Pending' };
    });
    withStatus.sort((a, b) => (!!a.sub !== !!b.sub ? (a.sub ? 1 : -1) : new Date(a.due) - new Date(b.due)));
    setTasks(withStatus);
    setMembers(memberRows);

    setAtt(sessions);
    setExamHistory(hist);
  }, [groupReady, joined, groupCode, userId]);

  // First load, and a fresh load every time the group or user changes.
  useEffect(() => { load(); }, [load]);

  // Live: a change made anywhere (teacher marks attendance, a task is added or submitted, an exam is taken,
  // progress is graded, someone joins the group) updates the Home panels without a reload.
  const gf = groupCode ? 'group_code=eq.' + groupCode : undefined;
  const uf = userId ? 'user_id=eq.' + userId : undefined;
  useLiveRefresh(load, [
    { table: 'tasks', filter: gf }, { table: 'task_submissions', filter: uf },
    { table: 'group_members', filter: gf },
    { table: 'attendance_sessions', filter: gf }, { table: 'attendance_records', filter: uf },
    { table: 'written_exam_submissions', filter: uf },
  ], { enabled: joined && !!userId });
  // The class schedule lives on the `groups` row (context) — re-read it when the teacher edits it.
  useLiveRefresh(refreshGroup, [{ table: 'groups', filter: groupCode ? 'code=eq.' + groupCode : undefined }], { enabled: joined, interval: 60000 });

  // ---- Schedule widget ----
  const minuteKey = Math.floor(Date.now() / 60000);
  const scheduleByDay = useMemo(() => {
    const items = { Sunday: [], Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [] };
    if (!joined || !groupData) return items;
    const now = new Date();
    scheduleDaysToWeekArray(groupData.scheduleDays, currentWeek).forEach((entry) => {
      if (!entry.time || !entry.instant) return;
      const start = entry.instant;
      const end = new Date(start.getTime() + 120 * 60000);
      const status = now >= start && now <= end ? 'live' : now > end ? 'done' : 'upcoming';
      // "Live Class" is plain English in the original (never run through TT()) — kept as-is.
      items[entry.day] = [{ time: entry.time, title: `${groupData.name} — Live Class`, status }];
    });
    return items;
  }, [joined, groupData, currentWeek, minuteKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeDay = currentWeek[dayIndex];
  const dayItems = scheduleByDay[activeDay.day] || [];
  const statusText = { done: t('Done'), live: t('Now'), upcoming: t('Upcoming') };
  const statusDot = { done: 'var(--text-muted)', live: '#6FCF97', upcoming: 'var(--gold)' };

  // Attendance: this month's lessons = 100 %, each missed lesson takes an equal share off (see lib/attendanceMonth.js).
  const today = new Date();
  const monthStats = useMemo(
    () => (att === null ? null : computeMonthAttendance({ scheduleDays: groupData && groupData.scheduleDays, records: att, year: today.getFullYear(), month: today.getMonth() })),
    [att, groupData, dayKey] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const recentAtt = att ? att.slice().reverse().slice(0, 3) : [];

  const myName = localStorage.getItem('ufuq-profile-name') || name;
  // Ranked by exam results (average graded score); classmates without results follow, alphabetically.
  const scoreOf = (m) => (m.user_id && ranking && ranking[m.user_id]) || null;
  const sortedMembers = members ? [...members].sort((a, b) => {
    const sa = scoreOf(a), sb = scoreOf(b);
    const pa = sa && sa.taken ? sa.avg : -1, pb = sb && sb.taken ? sb.avg : -1;
    return pb - pa || a.name.localeCompare(b.name);
  }) : [];

  const norm = (v) => String(v || '').trim().toLowerCase();
  const rankRef = useRef(null);
  // The ranking window always opens at the top (1st place first); the student scrolls down to see the rest.
  useEffect(() => {
    if (rankRef.current) rankRef.current.scrollTop = 0;
  }, [members]);

  const goto = (view) => () => onNavigate(view);

  return (
    <div id="homeView">
      <PageStyle css={LINE_CSS + HOME_CSS} />
      <ClosedGroupNotice />
      <div className="welcome">
        <div className="eyebrow">{t('Your cabinet')}</div>
        <h1>{t('Welcome back,')} <span id="userName" style={{ color: 'var(--gold-bright)' }}>{name || t('Student')}</span></h1>
        <p>{t("Here's what's happening with your Arabic learning journey.")}</p>
      </div>

      <div className="three-col-grid">
        {/* Tasks */}
        <div className="panel panel-compact home-panel">
          <PanelHead title={t('Tasks')} note={joined && tasks && tasks.length ? `${tasks.filter((x) => x.sub).length}/${tasks.length}` : t('Homework')} />
          {!joined ? (
            <Locked noGroup={noGroup} />
          ) : (
            <div className="schedule-list-simple panel-body-scroll" id="homeTasksList">
              {tasks === null ? null : tasks.length === 0 ? (
                <div className="empty-state">{t('No tasks assigned yet.')}</div>
                /* English in the original, never run through TT() */
              ) : tasks.map((task) => (
                <div key={task.id} className={'sched-row ' + (task.sub ? 'done' : task.overdue ? 'overdue' : 'upcoming')}
                     style={{ cursor: 'pointer' }} onClick={goto('tasks')}>
                  <span className="t">{fmtDueDate(task.due)}</span>
                  <span className="title">{task.title}</span>
                  <span className="status-txt">{task.statusText}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Today's schedule */}
        <div className="panel panel-compact home-panel">
          <PanelHead title={t("Today's schedule")} />
          {!joined ? (
            <Locked noGroup={noGroup} />
          ) : (
            <div id="scheduleContent">
              <div className="group-week-strip" id="homeWeekStrip">
                {currentWeek.map((w, i) => {
                  const hasClass = !!(scheduleByDay[w.day] && scheduleByDay[w.day].length);
                  const cls = ['group-week-day', hasClass && 'has-class', w.isToday && 'is-today', i === dayIndex && 'active'].filter(Boolean).join(' ');
                  return (
                    <button type="button" key={w.day} className={cls} onClick={() => setDayIndex(i)}>
                      <span className="gwd-name">{t(w.day.slice(0, 3))}</span>
                      <span className="gwd-num">{w.dateNum}</span>
                      <span className="gwd-dot"></span>
                    </button>
                  );
                })}
              </div>
              <div className="group-schedule-day" id="schedDateLabel" style={{ margin: '8px 0 6px' }}>
                {t(activeDay.day)}, {t(activeDay.dateLabel.split(' ')[0])} {activeDay.dateLabel.split(' ')[1]}
              </div>
              <div className="schedule-list-simple panel-body-scroll" id="scheduleList">
                {dayItems.length === 0 ? (
                  <div className="empty-state">{t('No class on this day — check the week strip for class days.')}</div>
                ) : dayItems.map((it, i) => (
                  <div className="group-schedule-event" key={i}>
                    <div>
                      <div className="group-schedule-time">{it.time}</div>
                      <div className="group-schedule-label">{it.title} · {statusText[it.status]}</div>
                    </div>
                    <span className="group-schedule-dot" style={{ background: statusDot[it.status] }} aria-hidden="true"></span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Attendance — Home fills in a real stat block once joined (port of renderHomeAttendanceProgress());
            "Progress" has no counterpart on Home in the original, only on the Progress page itself. */}
        <div className={'panel panel-compact home-panel' + (joined ? ' is-link' : '')} {...linkProps(onNavigate, joined, 'attendance')}>
          <PanelHead title={t('Attendance')} note={`${t(MONTH_NAMES[today.getMonth()])} ${today.getFullYear()}`} />
          {!joined ? (
            <Locked noGroup={noGroup} />
          ) : monthStats === null ? null : (
            <div className={'hp-body am-home lvl-' + monthStats.level} id="gateAttendance" style={{ '--am-color': LEVEL_COLORS[monthStats.level] }}>
              <div>
                {/* Nothing marked yet this month: show a dash instead of a "100%" that no lesson backs up. */}
                <div className="hp-big am-home-big">{monthStats.marked ? fmtPct(monthStats.rate) + '%' : '—'}</div>
                <div className="hp-sub">{t('Attendance this month')}</div>
                {monthStats.total > 0 && <LessonBlocks lessons={monthStats.lessons} thin />}
              </div>
              <div className="am-banner small" role="status">{statusMessage(t, monthStats)}</div>
              <div className="hp-minis three">
                <div className="hp-mini"><b>{monthStats.present}</b><span>{t('Present')}</span></div>
                <div className="hp-mini"><b>{monthStats.absent}</b><span>{t('Absent')}</span></div>
                <div className="hp-mini am-left"><b>{Math.max(0, monthStats.left)}</b><span>{t('Absences left')}</span></div>
              </div>
              <div className="hp-list">
                {recentAtt.length === 0 ? (
                  <div className="empty-state" style={{ padding: '14px 0' }}>{t('No attendance recorded yet.')}</div>
                ) : recentAtt.map((x, i) => (
                  <div className="hp-row" key={x.date + i}>
                    <span className="hp-row-title">{fmtDate(x.date + 'T00:00:00', lang, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    <span className={'attendance-status ' + (x.present ? 'present' : 'absent')}>{x.present ? t('Present') : t('Absent')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="three-col-grid home-two">
        {/* Class ranking */}
        <div className={'panel panel-compact home-panel' + (joined ? ' is-link' : '')} {...linkProps(onNavigate, joined, 'myGroup')}>
          <PanelHead title={t('Class ranking')} />
          {!joined ? (
            <Locked noGroup={noGroup} />
          ) : (
            <div className="hr-list panel-body-scroll" id="homeRankingList" ref={rankRef}>
              {members === null ? null : sortedMembers.length === 0 ? (
                <div className="empty-state">{t('No classmates have joined yet.')}</div>
              ) : sortedMembers.map((m, i) => {
                const pos = i + 1;
                const medal = pos === 1 ? 'gold' : pos === 2 ? 'silver' : pos === 3 ? 'bronze' : '';
                const isYou = (userId && m.user_id) ? m.user_id === userId : norm(m.name) === norm(myName);
                return (
                  <div key={m.name + i} className={'hr-row' + (isYou ? ' is-you' : '')} data-you={isYou ? '1' : undefined}>
                    <div className={'hr-pos ' + medal}>{pos}</div>
                    <div className="hr-avatar">{m.avatar_url ? <img src={m.avatar_url} alt="" /> : (m.name || '?').charAt(0).toUpperCase()}</div>
                    <div className="hr-name">{m.name}</div>
                    {isYou && <span className="hr-you">{t('You')}</span>}
                    {scoreOf(m) && scoreOf(m).taken > 0 && <span className="hr-score">{scoreOf(m).avg}%</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Progress: one line graph of the student's real exam results */}
        <div className="panel panel-compact home-panel">
          <PanelHead title={t('Progress')} />
          {!joined ? (
            <Locked noGroup={noGroup} />
          ) : examHistory === null ? null : (
            <div className="hp-body" id="homeProgress">
              <ProgressLine items={examHistory} compact />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
