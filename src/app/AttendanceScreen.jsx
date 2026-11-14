import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCabinetI18n } from '../context/CabinetI18nContext';
import { useDashboardData, getAttendanceData } from '../context/DashboardDataContext';
import useLiveRefresh from '../hooks/useLiveRefresh';
import useMonthKey from '../hooks/useMonthKey';
import { MONTH_NAMES } from '../pages/Dashboard/weekUtils';
import { computeMonthAttendance, fmtPct, LEVEL_COLORS, MAX_ABSENCES } from '../lib/attendanceMonth';
import { statusMessage } from '../pages/Dashboard/AttendanceView';
import { fmtDate } from '../lib/dateLocale';
import { haptic, useCountUp } from './hooks';
import { Ico, Ring } from './ui';

/** Native attendance screen: month switcher, animated ring, lesson timeline, stat tiles and the month's history. */
export default function AttendanceScreen() {
  const { t, lang } = useCabinetI18n();
  const { user, groupCode, groupData, groupReady } = useDashboardData();
  const joined = !!groupCode;
  const userId = user && user.id;
  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const monthKey = useMonthKey();
  useEffect(() => { const [y, m] = monthKey.split('-').map(Number); setCursor({ y, m: m - 1 }); }, [monthKey]);
  const [records, setRecords] = useState(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const load = useCallback(async () => {
    if (!groupReady) return;
    if (!joined || !userId) { setRecords(null); return; }
    const data = await getAttendanceData(groupCode, userId);
    if (alive.current) setRecords(data);
  }, [groupReady, joined, groupCode, userId]);
  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load, [
    { table: 'attendance_sessions', filter: groupCode ? 'group_code=eq.' + groupCode : undefined },
    { table: 'attendance_records', filter: userId ? 'user_id=eq.' + userId : undefined },
  ], { enabled: joined && !!userId });

  const stats = useMemo(
    () => (records === null ? null : computeMonthAttendance({ scheduleDays: groupData && groupData.scheduleDays, examDays: groupData && groupData.examDays, records, year: cursor.y, month: cursor.m })),
    [records, groupData, cursor],
  );
  const history = stats ? stats.lessons.filter((l) => l.status !== 'pending').sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || ''))) : [];
  const isCurrent = cursor.y === now.getFullYear() && cursor.m === now.getMonth();
  const monthsBack = (now.getFullYear() - cursor.y) * 12 + (now.getMonth() - cursor.m);
  const step = (d) => { haptic(); setCursor((c) => { const dt = new Date(c.y, c.m + d, 1); return { y: dt.getFullYear(), m: dt.getMonth() }; }); };
  const color = stats ? LEVEL_COLORS[stats.level] : 'var(--gold)';
  const rateN = useCountUp(stats && stats.marked ? Math.round(stats.rate) : 0, 800);
  const fmtDay = (s) => fmtDate(s.date + 'T00:00:00', lang, { weekday: 'short', month: 'short', day: 'numeric' });

  if (!joined) {
    return (
      <div className="ua-native">
        <div className="ua-empty big"><Ico n="cal" size={28} /><span>{t('Ask your teacher for a group code to see your attendance.')}</span></div>
      </div>
    );
  }

  return (
    <div className="ua-native ua-att">
      <div className="ua-monthbar" style={{ '--i': 0 }}>
        <button type="button" className="ua-icon-btn" aria-label={t('Previous month')} disabled={monthsBack >= 11} onClick={() => step(-1)}><Ico n="back" size={20} /></button>
        <b>{t(MONTH_NAMES[cursor.m])} {cursor.y}</b>
        <button type="button" className="ua-icon-btn flip" aria-label={t('Next month')} disabled={isCurrent} onClick={() => step(1)}><Ico n="back" size={20} /></button>
      </div>

      <section className={'ua-hero2 lvl-' + (stats ? stats.level : 'good')} style={{ '--i': 1, '--lv': color }}>
        <div className="ua-hero2-ring">
          <Ring value={stats && stats.marked ? stats.rate / 100 : 0} size={132} stroke={12} color={color}>
            <b className="ua-ring-n big">{stats && stats.marked ? rateN + '%' : '—'}</b><small>{t('Attendance rate')}</small>
          </Ring>
        </div>
        <p className="ua-hero2-msg" role="status">{stats ? statusMessage(t, stats) : t('Loading…')}</p>
        {stats && stats.total > 0 && (
          <>
            <div className="ua-dots2" aria-hidden="true">
              {stats.lessons.map((l, i) => <i key={l.date} className={l.status} style={{ '--d': i }} title={l.date} />)}
            </div>
            <div className="ua-legend2">
              <span><i className="present" />{t('Present')}</span><span><i className="absent" />{t('Absent')}</span><span><i className="pending" />{t('Upcoming')}</span>
            </div>
          </>
        )}
      </section>

      <div className="ua-tiles3" style={{ '--i': 2 }}>
        <div className="ua-t3 ok"><b>{stats ? stats.present : '—'}</b><small>{t('Present')}</small></div>
        <div className="ua-t3 bad"><b>{stats ? stats.absent : '—'}</b><small>{t('Absent')}</small></div>
        <div className="ua-t3 gold"><b>{MAX_ABSENCES}</b><small>{t('Allowed absences')}</small></div>
      </div>

      <div className="ua-sh-h" style={{ '--i': 4 }}><h3>{t('Session history')}</h3>{stats && history.length > 0 && <span className="ua-chip">{history.filter((l) => l.status === 'present').length}/{history.length}</span>}</div>
      <div className="ua-hist">
        {stats === null ? <div className="ua-skel" /> : history.length === 0 ? (
          <div className="ua-empty"><Ico n="cal" size={22} /><span>{t('No attendance recorded yet.')}</span></div>
        ) : history.map((s, i) => (
          <div className={'ua-hrow ' + s.status} key={s.date} style={{ '--i': 5 + Math.min(i, 8) }}>
            <span className="ua-hrow-ic"><Ico n={s.status === 'present' ? 'check' : 'x'} size={18} sw={2.6} /></span>
            <span className="ua-hrow-t"><b>{fmtDay(s)}</b>{s.time && <small>{s.time}</small>}</span>
            <span className="ua-hrow-p">{s.status === 'present' ? t('Present') : t('Absent') + ' −' + fmtPct(stats.perLesson) + '%'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
