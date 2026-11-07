import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCabinetI18n } from '../../context/CabinetI18nContext';
import { useDashboardData, getAttendanceData } from '../../context/DashboardDataContext';
import useLiveRefresh from '../../hooks/useLiveRefresh';
import { MONTH_NAMES } from './weekUtils';
import { computeMonthAttendance, fmtPct, LEVEL_COLORS, MAX_ABSENCES } from '../../lib/attendanceMonth';
import useMonthKey from '../../hooks/useMonthKey';
import PageStyle from '../../components/PageStyle';
import historyCss from './attendance-history.css?inline';

import { fmtDate } from '../../lib/dateLocale';
const LOCK_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
);
const CHEV_L = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>;
const CHEV_R = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>;

/** One small block per lesson of the month: green = attended, red = missed, grey = still to come. */
export function LessonBlocks({ lessons, thin }) {
  return (
    <div className={'am-blocks' + (thin ? ' thin' : '')} aria-hidden="true">
      {lessons.map((l) => <span key={l.date} className={'am-block ' + l.status} title={l.date} />)}
    </div>
  );
}

/** Warning / status line for a month's numbers. */
export function statusMessage(t, s) {
  if (!s.total) return t('No lessons scheduled this month.');
  if (s.level === 'danger') return t("Warning — you've exceeded the allowed absences by {n}. Please talk to your teacher.").replace('{n}', s.over);
  if (s.level === 'warn') return s.left === 0
    ? t("Limit reached — you can't miss any more lessons this month.")
    : t('Careful — absences left before the limit: {n}.').replace('{n}', s.left);
  return t('Good standing — absences left this month: {n}.').replace('{n}', s.left);
}

/** Attendance page — monthly attendance: a month's lessons = 100 %, every missed lesson lowers it equally. */
export default function AttendanceView() {
  const { t, lang } = useCabinetI18n();
  const { user, groupCode, groupData, groupReady } = useDashboardData();
  const joined = !!groupCode;
  const userId = user && user.id;
  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  // Oy almashganda (har oyning 1-kuni) ko'rinish avtomatik joriy oyga o'tadi.
  const monthKey = useMonthKey();
  useEffect(() => {
    const [y, m] = monthKey.split('-').map(Number);
    setCursor({ y, m: m - 1 });
  }, [monthKey]);
  const [records, setRecords] = useState(null); // null = loading; [{date, present}] chronological

  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const load = useCallback(async () => {
    if (!groupReady) return;
    if (!joined || !userId) { setRecords(null); return; }
    const data = await getAttendanceData(groupCode, userId);
    if (alive.current) setRecords(data);
  }, [groupReady, joined, groupCode, userId]);
  useEffect(() => { load(); }, [load]);

  // Live: the moment the teacher marks present / absent, the numbers here move.
  useLiveRefresh(load, [
    { table: 'attendance_sessions', filter: groupCode ? 'group_code=eq.' + groupCode : undefined },
    { table: 'attendance_records', filter: userId ? 'user_id=eq.' + userId : undefined },
  ], { enabled: joined && !!userId });

  const stats = useMemo(
    () => (records === null ? null : computeMonthAttendance({ scheduleDays: groupData && groupData.scheduleDays, records, year: cursor.y, month: cursor.m })),
    [records, groupData, cursor]
  );
  // Darslar tarixi: faqat tanlangan bitta oy, eng yangisi birinchi (sana, so'ng vaqt bo'yicha).
  const history = stats
    ? stats.lessons
        .filter((l) => l.status !== 'pending')
        .sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')))
    : [];
  const fmtDay = (s) => fmtDate(s.date + 'T00:00:00', lang, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const presentCount = history.filter((l) => l.status === 'present').length;
  const clockIcon = (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>);

  const isCurrent = cursor.y === now.getFullYear() && cursor.m === now.getMonth();
  const step = (d) => setCursor((c) => { const dt = new Date(c.y, c.m + d, 1); return { y: dt.getFullYear(), m: dt.getMonth() }; });
  const monthsBack = (now.getFullYear() - cursor.y) * 12 + (now.getMonth() - cursor.m);
  const color = stats ? LEVEL_COLORS[stats.level] : 'var(--gold)';
  const monthLabel = `${t(MONTH_NAMES[cursor.m])} ${cursor.y}`;

  return (
    <section id="attendanceView">
      <div className="inner-page-head">
        <div>
          <h1>{t('Attendance')}</h1>
          <p>{t("Your class attendance, synced with My Group's lesson schedule.")}</p>
        </div>
      </div>

      {!joined ? (
        <div className="panel" id="attendanceLockedPanel">
          <div className="inner-locked">
            {LOCK_ICON}
            <h3>{t('No attendance yet')}</h3>
            <p>{t('Ask your teacher for a group code to see your attendance.')}</p>
          </div>
        </div>
      ) : (
        <div id="attendanceContent">
          <div className="am-monthbar">
            <button type="button" className="am-nav" aria-label={t('Previous month')} disabled={monthsBack >= 11} onClick={() => step(-1)}>{CHEV_L}</button>
            <div className="am-month">{monthLabel}</div>
            <button type="button" className="am-nav" aria-label={t('Next month')} disabled={isCurrent} onClick={() => step(1)}>{CHEV_R}</button>
          </div>

          <div className={'panel am-hero lvl-' + (stats ? stats.level : 'good')} style={{ '--am-color': color }}>
            <div className="am-ring" style={{ '--p': stats ? stats.rate : 0 }}>
              <div className="am-ring-in">
                <b id="attRateBig">{stats && stats.marked ? fmtPct(stats.rate) + '%' : '—'}</b>
                <span>{t('Attendance rate')}</span>
              </div>
            </div>
            <div className="am-hero-body">
              <div className="am-banner" role="status">{stats ? statusMessage(t, stats) : t('Loading…')}</div>
              {stats && stats.total > 0 && <LessonBlocks lessons={stats.lessons} />}
              {stats && stats.total > 0 && (
                <div className="am-legend">
                  <span><i className="present" />{t('Present')}</span>
                  <span><i className="absent" />{t('Absent')}</span>
                  <span><i className="pending" />{t('Upcoming')}</span>
                </div>
              )}
              <div className="am-stats">
                <div className="am-stat"><b>{stats ? stats.total : '—'}</b><span>{t('Lessons this month')}</span></div>
                <div className="am-stat"><b id="attPresentBig">{stats ? stats.present : '—'}</b><span>{t('Present')}</span></div>
                <div className="am-stat"><b id="attAbsentBig">{stats ? stats.absent : '—'}</b><span>{t('Absent')}</span></div>
                <div className="am-stat"><b>{stats ? stats.allowed : '—'}</b><span>{t('Allowed absences')}</span></div>
                <div className="am-stat em"><b>{stats ? Math.max(0, stats.left) : '—'}</b><span>{t('Absences left')}</span></div>
              </div>
              {stats && stats.total > 0 && (
                <p className="am-note">
                  {t('Each missed lesson')}: −{fmtPct(stats.perLesson)}% · {t('Allowed absences')}: {MAX_ABSENCES}
                </p>
              )}
            </div>
          </div>

          <div className="panel">
            <PageStyle css={historyCss} />
            <div className="panel-head"><h3 style={{ margin: 0 }}>{t('Session history')}</h3><span className="panel-head-note">{monthLabel}</span></div>
            {stats && history.length > 0 && (
              <div className="ah-summary">
                <span><b>{history.length}</b> {t('Lessons this month')}</span>
                <span><b>{presentCount}</b> {t('Present')}</span>
              </div>
            )}
            <div id="attendanceHistory" className="ah-list">
              {stats === null ? (
                <div className="ah-empty">{t('Loading…')}</div>
              ) : history.length === 0 ? (
                <div className="ah-empty">{t('No attendance recorded yet.')}</div>
              ) : history.map((s) => (
                <div className={'ah-row ' + (s.status === 'present' ? 'present' : 'absent')} key={s.date}>
                  <div className="ah-main">
                    <span className="ah-date">{fmtDay(s)}</span>
                    {s.time && <span className="ah-time">{clockIcon}{s.time}</span>}
                  </div>
                  <span className={'ah-pill ' + (s.status === 'present' ? 'present' : 'absent')}>
                    {s.status === 'present' ? t('Present') : t('Absent')}
                    {s.status !== 'present' && <span className="ah-pill-loss">−{fmtPct(stats.perLesson)}%</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
