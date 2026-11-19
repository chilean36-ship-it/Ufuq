import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCabinetI18n } from '../context/CabinetI18nContext';
import { useDashboardData, getAttendanceData, getGroupMembers } from '../context/DashboardDataContext';
import useLiveRefresh from '../hooks/useLiveRefresh';
import { computeMonthAttendance, fmtPct, LEVEL_COLORS } from '../lib/attendanceMonth';
import { fetchGroupRanking } from '../pages/Dashboard/Exam/examData';
import { haptic } from './hooks';
import { Ico } from './ui';

/** Card header used by every Home section: coloured icon tile, title, optional side text and an open button. */
export function CardHead({ tone, icon, title, side, onOpen }) {
  return (
    <div className="ua-hc-h">
      <span className={'ua-ctile ' + tone}><Ico n={icon} size={20} /></span>
      <h3>{title}</h3>
      {side != null && <span className="ua-hc-side">{side}</span>}
      {onOpen && <button type="button" className="ua-hc-go" onClick={() => { haptic(); onOpen(); }} aria-label={title}><Ico n="chev" size={18} sw={2.4} /></button>}
    </div>
  );
}

/** This month's attendance: big percentage, one segment per lesson (present / missed / still to come) and the two counters. */
export function AttendanceCard({ locale, title, onOpen }) {
  const { t } = useCabinetI18n();
  const { user, groupCode, groupData, groupReady } = useDashboardData();
  const userId = user && user.id;
  const joined = !!groupCode;
  const [records, setRecords] = useState(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const load = useCallback(async () => {
    if (!groupReady || !joined || !userId) { setRecords(null); return; }
    const data = await getAttendanceData(groupCode, userId);
    if (alive.current) setRecords(data);
  }, [groupReady, joined, groupCode, userId]);
  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load, [
    { table: 'attendance_sessions', filter: groupCode ? 'group_code=eq.' + groupCode : undefined },
    { table: 'attendance_records', filter: userId ? 'user_id=eq.' + userId : undefined },
  ], { enabled: joined && !!userId });

  const now = new Date();
  const stats = useMemo(
    () => (records === null ? null : computeMonthAttendance({ scheduleDays: groupData && groupData.scheduleDays, examDays: groupData && groupData.examDays, records, year: now.getFullYear(), month: now.getMonth() })),
    [records, groupData] // eslint-disable-line react-hooks/exhaustive-deps
  );
  if (!joined || !stats) return null;
  const month = new Intl.DateTimeFormat(locale, { month: 'long' }).format(now);
  const color = LEVEL_COLORS[stats.level] || LEVEL_COLORS.good;
  const segs = Math.min(Math.max(stats.total, 0), 16);
  return (
    <section className="ua-card2 ua-hc" style={{ '--i': 5 }}>
      <CardHead tone="teal" icon="cal" title={title} side={month} onOpen={onOpen} />
      <div className="ua-att-n" style={{ color }}>{fmtPct(stats.rate)}<small>%</small></div>
      {segs > 0 && (
        <div className="ua-att-segs" aria-hidden="true">
          {Array.from({ length: segs }, (_, i) => <i key={i} className={i < stats.present ? 'p' : i < stats.present + stats.absent ? 'a' : ''} />)}
        </div>
      )}
      <div className="ua-att-pair">
        <div><b>{stats.present}</b><span>{t('Present')}</span></div>
        <div><b>{stats.absent}</b><span>{t('Absent')}</span></div>
      </div>
    </section>
  );
}

const norm = (v) => String(v || '').trim().toLowerCase();

/** Class ranking by the average of the graded exams; classmates without results follow alphabetically. The student's own row is highlighted. */
export function RankingCard({ title, onOpen }) {
  const { t } = useCabinetI18n();
  const { user, name, groupCode, groupReady } = useDashboardData();
  const userId = user && user.id;
  const joined = !!groupCode;
  const [rows, setRows] = useState(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const load = useCallback(async () => {
    if (!groupReady || !joined) { setRows(null); return; }
    const [members, rank] = await Promise.all([getGroupMembers(groupCode), fetchGroupRanking(groupCode)]);
    if (!alive.current) return;
    const rmap = {};
    (rank || []).forEach((r) => { rmap[r.userId] = r; });
    const list = (members || []).map((m) => ({ ...m, score: m.user_id && rmap[m.user_id] && rmap[m.user_id].taken ? rmap[m.user_id].avg : null }));
    list.sort((a, b) => (b.score == null ? -1 : b.score) - (a.score == null ? -1 : a.score) || String(a.name).localeCompare(String(b.name)));
    setRows(list);
  }, [groupReady, joined, groupCode]);
  useEffect(() => { load(); }, [load]);
  const listRef = useRef(null);
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = 0; }, [rows]);
  if (!joined || !rows || rows.length === 0) return null;
  return (
    <section className="ua-card2 ua-hc" style={{ '--i': 6 }}>
      <CardHead tone="amber" icon="star" title={title} side={rows.length} onOpen={onOpen} />
      <div className="ua-rank" ref={listRef}>
        {rows.map((m, i) => {
          const isYou = userId && m.user_id ? m.user_id === userId : norm(m.name) === norm(name);
          return (
            <div key={(m.user_id || m.name) + i} className={'ua-rk' + (isYou ? ' you' : '')}>
              <span className={'ua-rk-pos p' + (i < 3 ? i + 1 : 0)}>{i + 1}</span>
              <span className="ua-rk-av">{m.avatar_url ? <img src={m.avatar_url} alt="" /> : (m.name || '?').charAt(0).toUpperCase()}</span>
              <b className="ua-rk-name">{m.name}</b>
              {isYou && <em className="ua-rk-you">{t('You')}</em>}
              {m.score != null && <span className="ua-rk-sc">{m.score}%</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
