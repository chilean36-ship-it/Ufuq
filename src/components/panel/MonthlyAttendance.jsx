import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { usePanel } from './PanelContext';
import PageStyle from '../PageStyle';
import { MONTH_KEYS } from '../../lib/panelUtils';
import { useExamDays } from '../../lib/examDays';
import { computeForMembers, fmtPct, LEVEL_COLORS, MAX_ABSENCES, monthPrefix, plannedDatesInMonth } from '../../lib/attendanceMonth';
import Loader from '../../components/Loader';

const css = `
  .ma-bar{display:flex; align-items:center; gap:10px;}
  .ma-month{min-width:128px; text-align:center; font-weight:600; font-size:14px; color:var(--text);}
  .ma-nav{width:30px; height:30px; border-radius:50%; border:1px solid var(--line); background:var(--bg-3); color:var(--text); cursor:pointer; font-size:15px; line-height:1;}
  .ma-nav:disabled{opacity:.35; cursor:default;}
  .ma-info{font-size:12.5px; color:var(--text-muted); margin:0 0 12px;}
  .ma-row{display:grid; grid-template-columns:minmax(0,1.6fr) 70px 80px 120px; gap:10px; align-items:center; padding:10px 12px; border-bottom:1px solid var(--line); font-size:13.5px;}
  .ma-row:last-child{border-bottom:none;}
  .ma-row.head{font-size:11.5px; color:var(--text-muted); text-transform:uppercase; letter-spacing:.05em; padding-top:4px;}
  .ma-name{min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
  .ma-chip{justify-self:start; padding:4px 11px; border-radius:999px; font-size:12px; font-weight:700; border:1px solid transparent;}
  .ma-row.lvl-danger{background:rgba(228,84,76,.07);}
  .ma-flag{display:block; font-size:11px; font-weight:600; margin-top:2px;}
  .ma-row{padding:7px 10px; font-size:13px;} .ma-chip{padding:3px 10px; font-size:11.5px;} .ma-info{margin-bottom:8px;} .ma-month{min-width:112px; font-size:13.5px;} .ma-nav{width:28px; height:28px;}
  .ma-scroll{max-height:340px; overflow-y:auto;}
  .ma-row.acc{grid-template-columns:minmax(0,1.4fr) 54px 64px 92px 108px;}
  .ma-acc{display:flex; flex-direction:column; gap:4px; align-items:flex-start;}
  .ma-acc-btn{border:1px solid var(--line); background:var(--bg-3); color:var(--text); border-radius:8px; padding:5px 9px; font:600 11.5px inherit; font-family:inherit; cursor:pointer;}
  .ma-acc-btn.go{background:var(--gold); border-color:var(--gold); color:#171717;}
  .ma-acc-btn:disabled{opacity:.5; cursor:default;}
  .ma-acc-tag{font-size:11px; font-weight:700;}
  @media (max-width:640px){ .ma-row.acc{grid-template-columns:minmax(0,1.3fr) 44px 52px 80px 100px;} }
  .ma-row.head{position:sticky; top:0; z-index:1; background:var(--bg-2, var(--bg-3));}
  @media (max-width:1100px){ .ma-row{grid-template-columns:minmax(0,1.4fr) 56px 66px 100px; gap:8px;} }
  @media (max-width:640px){ .ma-row{grid-template-columns:minmax(0,1.4fr) 54px 60px 96px; gap:6px; padding:10px 6px; font-size:12.5px;} }
`;

/**
 * Teacher / admin: monthly attendance per student for the selected group. Reads what the present/absent
 * toggle saved in Supabase (attendance_sessions + attendance_records) and applies the shared monthly rules.
 */
export default function MonthlyAttendance({ group, refreshKey }) {
  const { t } = usePanel();
  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [data, setData] = useState(null); // null = loading | { members, records } | { error }
  const code = group ? group.code : null;
  // Who is allowed this month although they reached the limit (null = the lock feature is not installed on the server yet)
  const [unlocked, setUnlocked] = useState(null);
  const [busyId, setBusyId] = useState('');
  const [accErr, setAccErr] = useState('');
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthStartStr = monthPrefix(monthStart.getFullYear(), monthStart.getMonth()) + '01';
  const loadUnlocks = async () => {
    try {
      const { data: u, error } = await supabase.from('attendance_unlocks').select('user_id').eq('month', monthStartStr);
      setUnlocked(error ? null : new Set((u || []).map((x) => x.user_id)));
    } catch (e) { setUnlocked(null); }
  };
  useEffect(() => { loadUnlocks(); }, [code, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const setAllow = async (userId, allow) => {
    setBusyId(userId); setAccErr('');
    try {
      const { error } = await supabase.rpc('set_attendance_unlock', { p_user: userId, p_allow: allow });
      if (error) throw error;
      await loadUnlocks();
    } catch (e) { setAccErr(t('Could not change the access. Please try again.')); }
    setBusyId('');
  };

  useEffect(() => {
    if (!code) { setData({ members: [], records: [] }); return undefined; }
    let cancelled = false;
    (async () => {
      setData(null);
      const last = new Date(cursor.y, cursor.m + 1, 0).getDate();
      const from = monthPrefix(cursor.y, cursor.m) + '01';
      const to = monthPrefix(cursor.y, cursor.m) + String(last).padStart(2, '0');
      const [{ data: members, error: mErr }, { data: sessions, error: sErr }] = await Promise.all([
        supabase.from('group_members').select('user_id, name').eq('group_code', code).order('name'),
        supabase.from('attendance_sessions').select('id, session_date').eq('group_code', code).gte('session_date', from).lte('session_date', to),
      ]);
      if (cancelled) return;
      if (mErr || sErr) { setData({ error: (mErr || sErr).message }); return; }
      let records = [];
      if (sessions && sessions.length) {
        const dateById = {};
        sessions.forEach((s) => { dateById[s.id] = s.session_date; });
        const { data: recs, error: rErr } = await supabase.from('attendance_records').select('session_id, user_id, present').in('session_id', sessions.map((s) => s.id));
        if (cancelled) return;
        if (rErr) { setData({ error: rErr.message }); return; }
        records = (recs || []).map((r) => ({ user_id: r.user_id, date: dateById[r.session_id], present: !!r.present }));
      }
      setData({ members: members || [], records });
    })();
    return () => { cancelled = true; };
  }, [code, cursor, refreshKey]);

  const scheduleDays = group && group.schedule_days;
  const examDays = useExamDays()[code];   // exam days have no lesson, so they are not counted
  const rows = useMemo(() => {
    if (!data || data.error) return [];
    const order = { danger: 0, warn: 1, good: 2 };
    return computeForMembers({ members: data.members, records: data.records, scheduleDays, examDays, year: cursor.y, month: cursor.m })
      .sort((a, b) => order[a.stats.level] - order[b.stats.level] || (a.member.name || '').localeCompare(b.member.name || ''));
  }, [data, scheduleDays, examDays, cursor]);

  const total = rows.length ? rows[0].stats.total : plannedDatesInMonth(scheduleDays, cursor.y, cursor.m, examDays).length;
  const perLesson = total ? 100 / total : 0;
  const isCurrent = cursor.y === now.getFullYear() && cursor.m === now.getMonth();
  const step = (d) => setCursor((c) => { const dt = new Date(c.y, c.m + d, 1); return { y: dt.getFullYear(), m: dt.getMonth() }; });
  const showAcc = isCurrent && unlocked !== null;   // the Access column: current month only, and only when the server feature exists
  const flag = (s) => (s.level === 'danger' ? t('Over limit') : s.level === 'warn' ? (s.left === 0 ? t('Limit reached') : t('Close to limit')) : '');

  return (
    <div className="panel">
      <PageStyle css={css} />
      <div className="panel-head" style={{ gap: 14 }}>
        <h3>{t('Monthly attendance')}</h3>
        <div className="ma-bar">
          <button type="button" className="ma-nav" aria-label={t('Previous month')} onClick={() => step(-1)}>‹</button>
          <span className="ma-month">{t(MONTH_KEYS[cursor.m])} {cursor.y}</span>
          <button type="button" className="ma-nav" aria-label={t('Next month')} disabled={isCurrent} onClick={() => step(1)}>›</button>
        </div>
      </div>
      <p className="ma-info">
        {total > 0
          ? t('Lessons this month') + ': ' + total + ' = 100% · ' + t('Each missed lesson') + ': −' + fmtPct(perLesson) + '% · ' + t('Allowed absences') + ': ' + MAX_ABSENCES
          : t('No lessons scheduled this month.')}
      </p>
      {accErr && <p className="ma-info" style={{ color: LEVEL_COLORS.danger }}>{accErr}</p>}
      {showAcc && <p className="ma-info">{t('A student with 3 missed lessons in a month is locked out of the lesson sections until you allow access.')}</p>}
      <div className="ma-scroll">
        <div className={'ma-row head' + (showAcc ? ' acc' : '')}><span>{t('Student')}</span><span>{t('Absent')}</span><span>{t('Allowed')}</span><span>{t('Attendance rate')}</span>{showAcc && <span>{t('Access')}</span>}</div>
        {!group ? <div className="empty-block">{t('Select a group')}</div>
          : data === null ? <Loader inline label={t('Loading…')} />
          : data.error ? <div className="empty-block">{data.error}</div>
          : rows.length === 0 ? <div className="empty-block">{t('There are no students in this group yet.')}</div>
          : rows.map(({ member, stats }) => {
            const color = LEVEL_COLORS[stats.level];
            return (
              <div className={'ma-row lvl-' + stats.level + (showAcc ? ' acc' : '')} key={member.user_id}>
                <span className="ma-name">{member.name || t('Student')}{flag(stats) && <span className="ma-flag" style={{ color }}>{flag(stats)}</span>}</span>
                <span>{stats.absent}</span>
                <span>{stats.allowed}</span>
                <span className="ma-chip" style={{ color, background: color + '22', borderColor: color + '55' }}>{fmtPct(stats.rate)}%</span>
                {showAcc && (
                  <span className="ma-acc">
                    {stats.absent >= MAX_ABSENCES ? (unlocked.has(member.user_id)
                      ? <><span className="ma-acc-tag" style={{ color: LEVEL_COLORS.good }}>{t('Allowed')}</span><button type="button" className="ma-acc-btn" disabled={busyId === member.user_id} onClick={() => setAllow(member.user_id, false)}>{t('Lock again')}</button></>
                      : <><span className="ma-acc-tag" style={{ color: LEVEL_COLORS.danger }}>{t('Locked')}</span><button type="button" className="ma-acc-btn go" disabled={busyId === member.user_id} onClick={() => setAllow(member.user_id, true)}>{t('Allow access')}</button></>)
                      : <span className="ma-acc-tag" style={{ color: 'var(--text-muted)' }}>—</span>}
                  </span>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
