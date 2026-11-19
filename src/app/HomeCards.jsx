import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCabinetI18n } from '../context/CabinetI18nContext';
import { useDashboardData, getAttendanceData, getGroupMembers } from '../context/DashboardDataContext';
import useLiveRefresh from '../hooks/useLiveRefresh';
import { computeMonthAttendance, fmtPct, LEVEL_COLORS } from '../lib/attendanceMonth';
import { fetchGroupRanking } from '../pages/Dashboard/Exam/examData';
import { supabase } from '../lib/supabaseClient';
import { useApp } from './AppContext';
import { haptic, useCountUp } from './hooks';
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
  const rateN = useCountUp(stats ? Math.round(stats.rate) : 0, 900);
  if (!joined || !stats) return null;
  const month = new Intl.DateTimeFormat(locale, { month: 'long' }).format(now);
  const color = LEVEL_COLORS[stats.level] || LEVEL_COLORS.good;
  const segs = Math.min(Math.max(stats.total, 0), 16);
  return (
    <section className="ua-card2 ua-hc" style={{ '--i': 5 }}>
      <CardHead tone="teal" icon="cal" title={title} side={month} onOpen={onOpen} />
      <div className="ua-att-n" style={{ color }}>{Number.isInteger(stats.rate) ? rateN : fmtPct(stats.rate)}<small>%</small></div>
      {segs > 0 && (
        <div className="ua-att-segs" aria-hidden="true">
          {Array.from({ length: segs }, (_, i) => <i key={i} style={{ '--j': i }} className={i < stats.present ? 'p' : i < stats.present + stats.absent ? 'a' : ''} />)}
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
const TABS = ['all', 'att', 'tasks', 'exam'];
const TAB_KEY = { all: 'rkAll', att: 'rkAtt', tasks: 'rkTasks', exam: 'rkExam' };

/** Per-member attendance / task counts for the Attendance and Tasks tabs. null when the server function is not there yet. */
async function fetchActivity(groupCode) {
  try {
    const { data, error } = await supabase.rpc('group_activity_ranking', { p_group_code: groupCode });
    if (error || !Array.isArray(data)) return null;
    const map = {};
    data.forEach((r) => { map[r.user_id] = r; });
    return map;
  } catch (e) { return null; }
}

/**
 * Class ranking with Fath-style tabs. Exams come from the written-exam ranking; attendance and tasks come from
 * group_activity_ranking. Without that function only the Exams list is shown (no tabs). "Overall" = mean of the three shares.
 */
export function RankingCard({ title, onOpen }) {
  const { t: tc } = useCabinetI18n();
  const { t } = useApp();
  const { user, name, groupCode, groupReady } = useDashboardData();
  const userId = user && user.id;
  const joined = !!groupCode;
  const [data, setData] = useState(null);   // { members, exam: {uid: {avg, taken}}, act: {uid: row} | null }
  const [tab, setTab] = useState('all');
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const load = useCallback(async () => {
    if (!groupReady || !joined) { setData(null); return; }
    const [members, rank, act] = await Promise.all([getGroupMembers(groupCode), fetchGroupRanking(groupCode), fetchActivity(groupCode)]);
    if (!alive.current) return;
    const exam = {};
    (rank || []).forEach((r) => { exam[r.userId] = { avg: r.avg, taken: r.taken }; });
    setData({ members: members || [], exam, act });
  }, [groupReady, joined, groupCode]);
  useEffect(() => { load(); }, [load]);

  const hasAct = !!(data && data.act);
  const tabs = hasAct ? TABS : ['exam'];
  const active = tabs.includes(tab) ? tab : tabs[0];

  const rows = useMemo(() => {
    if (!data) return [];
    const list = data.members.map((m) => {
      const e = m.user_id && data.exam[m.user_id];
      const a = m.user_id && data.act && data.act[m.user_id];
      const ex = e && e.taken ? e.avg : 0;
      const at = a ? a.att_pct : 0;
      const tk = a ? (a.tasks_total ? Math.round((100 * a.tasks_done) / a.tasks_total) : 100) : 0;
      let score; let label;
      if (active === 'exam') { score = ex; label = e && e.taken ? ex + '%' : ''; }
      else if (active === 'att') { score = at; label = a && a.att_marked ? at + '%' : ''; }
      else if (active === 'tasks') { score = tk; label = a ? a.tasks_done + '/' + a.tasks_total : ''; }
      else { score = Math.round((ex + at + tk) / 3); label = score + '%'; }
      return { ...m, score, label };
    });
    list.sort((x, y) => y.score - x.score || String(x.name).localeCompare(String(y.name)));
    return list;
  }, [data, active]);

  const listRef = useRef(null);
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = 0; }, [active, data]);
  if (!joined || !data || rows.length === 0) return null;
  const idx = Math.max(0, tabs.indexOf(active));
  return (
    <section className="ua-card2 ua-hc" style={{ '--i': 6 }}>
      <CardHead tone="amber" icon="star" title={title} side={rows.length} onOpen={onOpen} />
      {tabs.length > 1 && (
        <div className="ua-rk-tabs" role="tablist" style={{ '--n': tabs.length, '--idx': idx }}>
          <span className="ua-rk-tabpill" aria-hidden="true" />
          {tabs.map((k) => (
            <button type="button" role="tab" aria-selected={k === active} key={k} className={k === active ? 'on' : ''} onClick={() => { haptic(6); setTab(k); }}>{t(TAB_KEY[k])}</button>
          ))}
        </div>
      )}
      <div className="ua-rank" ref={listRef} key={active}>
        {rows.map((m, i) => {
          const isYou = userId && m.user_id ? m.user_id === userId : norm(m.name) === norm(name);
          return (
            <div key={(m.user_id || m.name) + i} className={'ua-rk' + (isYou ? ' you' : '')} style={{ '--k': Math.min(i, 10) }}>
              <span className={'ua-rk-pos p' + (i < 3 ? i + 1 : 0)}>{i + 1}</span>
              <span className="ua-rk-av">{m.avatar_url ? <img src={m.avatar_url} alt="" /> : (m.name || '?').charAt(0).toUpperCase()}</span>
              <span className="ua-rk-mid">
                <b className="ua-rk-name">{m.name}{isYou && <em className="ua-rk-you">{tc('You')}</em>}</b>
                <i className="ua-rk-bar"><u style={{ width: Math.max(3, Math.min(100, m.score)) + '%' }} /></i>
              </span>
              {m.label && <span className="ua-rk-sc">{m.label}</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
