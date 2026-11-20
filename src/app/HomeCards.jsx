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
  if (!joined) return null;
  if (!stats) return <section className="ua-card2 ua-hc" style={{ '--i': 5 }} aria-busy="true"><div className="ua-skel" style={{ height: 150 }} /></section>;
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

/** Points-based numbers (exam points of the level, task points, attendance %). null when the server function is not there yet. */
async function fetchPoints(groupCode) {
  try {
    const { data, error } = await supabase.rpc('group_points_ranking', { p_group_code: groupCode });
    if (error || !Array.isArray(data)) return null;
    const map = {};
    data.forEach((r) => { map[r.user_id] = r; });
    return map;
  } catch (e) { return null; }
}
const fmtPts = (n) => { const v = Math.round((Number(n) || 0) * 10) / 10; return String(v).replace(/\.0$/, ''); };

/**
 * Class ranking with Fath-style tabs. Overall = exam points + task points; Exams = % of all the level's exam points;
 * Tasks = task points; Attendance = %. (Older databases without group_points_ranking keep the old percentage ranking.)
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
    const [members, rank, act, pts] = await Promise.all([getGroupMembers(groupCode), fetchGroupRanking(groupCode), fetchActivity(groupCode), fetchPoints(groupCode)]);
    if (!alive.current) return;
    const exam = {};
    (rank || []).forEach((r) => { exam[r.userId] = { avg: r.avg, taken: r.taken }; });
    setData({ members: members || [], exam, act, pts });
  }, [groupReady, joined, groupCode]);
  useEffect(() => { load(); }, [load]);

  const hasPts = !!(data && data.pts);
  const hasAct = !!(data && (data.act || data.pts));
  const tabs = hasAct ? TABS : ['exam'];
  const active = tabs.includes(tab) ? tab : tabs[0];

  // Overall counts only what really has data in this group (exams taken / attendance marked / tasks given), so an empty
  // category never pads the score: with exams only, Overall equals the exam result.
  const counted = useMemo(() => {
    const c = { exam: false, att: false, tasks: false };
    if (!data) return c;
    data.members.forEach((m) => {
      const e = m.user_id && data.exam[m.user_id]; const a = m.user_id && data.act && data.act[m.user_id];
      if (e && e.taken) c.exam = true;
      if (a && a.att_marked > 0) c.att = true;
      if (a && a.tasks_total > 0) c.tasks = true;
    });
    return c;
  }, [data]);

  const rows = useMemo(() => {
    if (!data) return [];
    if (hasPts) {
      const pl = data.members.map((m) => {
        const p = (m.user_id && data.pts[m.user_id]) || {};
        const exP = Number(p.exam_points) || 0; const tkP = Number(p.task_points) || 0; const atM = Number(p.att_marked) || 0;
        let score = 0; let label = '';
        if (active === 'exam') { score = Number(p.exam_pct) || 0; label = score + '%'; }
        else if (active === 'att') { score = p.att_pct == null ? 100 : Number(p.att_pct); label = score + '%'; }   // everybody starts at 100%; each missed lesson takes its share off
        else if (active === 'tasks') { score = tkP; label = fmtPts(tkP) + ' ' + t('rkPt'); }
        else { score = exP + tkP; label = fmtPts(score) + ' ' + t('rkPt'); }
        return { ...m, score, label };
      });
      pl.sort((x, y) => y.score - x.score || String(x.name).localeCompare(String(y.name)));
      const top = Math.max(...pl.map((x) => x.score), 0);
      const pointsTab = active === 'all' || active === 'tasks';
      return pl.map((x) => ({ ...x, bar: pointsTab ? (top > 0 ? (x.score / top) * 100 : 0) : x.score }));
    }
    const list = data.members.map((m) => {
      const e = m.user_id && data.exam[m.user_id];
      const a = m.user_id && data.act && data.act[m.user_id];
      const hasEx = !!(e && e.taken); const hasAt = !!(a && a.att_marked > 0); const hasTk = !!(a && a.tasks_total > 0);
      const ex = hasEx ? e.avg : 0;
      const at = hasAt ? a.att_pct : 0;
      const tk = hasTk ? Math.round((100 * a.tasks_done) / a.tasks_total) : 0;
      let score = 0; let label = '';
      if (active === 'exam') { score = ex; label = hasEx ? ex + '%' : ''; }
      else if (active === 'att') { score = at; label = hasAt ? at + '%' : ''; }
      else if (active === 'tasks') { score = tk; label = hasTk ? a.tasks_done + '/' + a.tasks_total : ''; }
      else {
        const parts = [counted.exam && ex, counted.att && at, counted.tasks && tk].filter((v) => v !== false);
        score = parts.length ? Math.round(parts.reduce((x, y) => x + y, 0) / parts.length) : 0;
        label = parts.length ? score + '%' : '';
      }
      return { ...m, score, label };
    });
    list.sort((x, y) => y.score - x.score || String(x.name).localeCompare(String(y.name)));
    return list.map((x) => ({ ...x, bar: x.score }));
  }, [data, active, counted, hasPts, t]);

  const listRef = useRef(null);
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = 0; }, [active, data]);
  if (!joined) return null;
  if (!data) return <section className="ua-card2 ua-hc" style={{ '--i': 6 }} aria-busy="true"><div className="ua-skel" style={{ height: 220 }} /></section>;
  if (rows.length === 0) return null;
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
      {active === 'all' && (
        <p className="ua-rk-note">{hasPts ? t('rkPtsNote') : ([counted.exam && t('rkExam'), counted.att && t('rkAtt'), counted.tasks && t('rkTasks')].filter(Boolean).join(' · ') ? t('rkCounted') + ': ' + [counted.exam && t('rkExam'), counted.att && t('rkAtt'), counted.tasks && t('rkTasks')].filter(Boolean).join(' · ') : t('rkNone'))}</p>
      )}
      {active === 'exam' && hasPts && <p className="ua-rk-note">{t('rkExamNote')}</p>}
      {active === 'tasks' && hasPts && <p className="ua-rk-note">{t('rkTasksNote')}</p>}
      <div className="ua-rank" ref={listRef} key={active}>
        {rows.map((m, i) => {
          const isYou = userId && m.user_id ? m.user_id === userId : norm(m.name) === norm(name);
          return (
            <div key={(m.user_id || m.name) + i} className={'ua-rk' + (isYou ? ' you' : '')} style={{ '--k': Math.min(i, 10) }}>
              <span className={'ua-rk-pos p' + (i < 3 ? i + 1 : 0)}>{i + 1}</span>
              <span className="ua-rk-av">{m.avatar_url ? <img src={m.avatar_url} alt="" /> : (m.name || '?').charAt(0).toUpperCase()}</span>
              <span className="ua-rk-mid">
                <b className="ua-rk-name">{m.name}{isYou && <em className="ua-rk-you">{tc('You')}</em>}</b>
                <i className="ua-rk-bar"><u style={{ width: Math.max(3, Math.min(100, m.bar)) + '%' }} /></i>
              </span>
              {m.label && <span className="ua-rk-sc">{m.label}</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
