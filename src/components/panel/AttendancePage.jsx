import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { usePanel } from './PanelContext';
import DatePicker from './DatePicker';
import { EmptyRow, Switch } from './ui';
import MonthlyAttendance from './MonthlyAttendance';
import useMonthKey from '../../hooks/useMonthKey';
import PageStyle from '../PageStyle';
import historyCss from '../../pages/Dashboard/attendance-history.css?inline';
import { MONTH_KEYS, allowedDaysLabel, fmtDate, isDateAllowedForGroup, nearestAllowedDateStr, todayStr } from '../../lib/panelUtils';
import Loader from '../../components/Loader';

/**
 * Attendance page (identical in admin.html and teacher.html): pick a class day, toggle each student
 * present/absent, save, and see the last 10 sessions.
 */
export default function AttendancePage() {
  const { t, toast, currentGroup: g } = usePanel();
  const code = g ? g.code : null;
  const [date, setDate] = useState(todayStr);
  const [members, setMembers] = useState(null);      // null = loading, [] = none
  const [sessionId, setSessionId] = useState(null);
  const [presence, setPresence] = useState({});
  const [history, setHistory] = useState(null);      // null = loading, {error}|[]
  const [saving, setSaving] = useState(false);
  const [summaryNonce, setSummaryNonce] = useState(0);   // bumped after every save so the monthly summary re-reads Supabase

  const monthKey = useMonthKey();   // 'YYYY-MM' — oy almashganda ro'yxat yangidan yuklanadi

  const loadHistory = useCallback(async (memberCount) => {
    if (!code) return;
    setHistory(null);
    // Faqat joriy kalendar oyi (1-kun .. oxirgi kun). Yangi oyda ro'yxat avtomatik yangilanadi;
    // eski sessiyalar bazada qoladi va Monthly attendance oy tanlagichida ko'rinadi.
    const [y, m] = monthKey.split('-').map(Number);
    const monthStart = `${y}-${String(m).padStart(2, '0')}-01`;
    const nextStart = new Date(y, m, 1);
    const monthEnd = `${nextStart.getFullYear()}-${String(nextStart.getMonth() + 1).padStart(2, '0')}-01`;
    const { data: sessions, error } = await supabase.from('attendance_sessions').select('id, session_date')
      .eq('group_code', code).gte('session_date', monthStart).lt('session_date', monthEnd)
      .order('session_date', { ascending: false });
    if (error) { setHistory({ error: error.message }); return; }
    if (!sessions || sessions.length === 0) { setHistory([]); return; }
    const ids = sessions.map((s) => s.id);
    const { data: records } = await supabase.from('attendance_records').select('session_id, present').in('session_id', ids);
    const presCount = {};
    (records || []).forEach((r) => { if (r.present) presCount[r.session_id] = (presCount[r.session_id] || 0) + 1; });
    setHistory(sessions.map((s) => ({ id: s.id, date: s.session_date, present: presCount[s.id] || 0, total: memberCount })));
  }, [code, monthKey]);

  const loadForDate = useCallback(async (d) => {
    if (!code) return 0;
    setMembers(null);
    const { data: rows, error: mErr } = await supabase.from('group_members').select('user_id, name').eq('group_code', code).order('name');
    if (mErr) { toast(mErr.message, 'err'); return 0; }
    const list = rows || [];
    setMembers(list);
    if (list.length === 0) return 0;
    const { data: session } = await supabase.from('attendance_sessions').select('id').eq('group_code', code).eq('session_date', d).maybeSingle();
    const sid = session ? session.id : null;
    setSessionId(sid);
    const map = {};
    if (sid) {
      const { data: records } = await supabase.from('attendance_records').select('user_id, present').eq('session_id', sid);
      (records || []).forEach((r) => { map[r.user_id] = r.present; });
    }
    setPresence(map);
    return list.length;
  }, [code, toast]);

  // (Re)load whenever the page opens or the group changes — the old loadAttendancePage().
  useEffect(() => {
    if (!g) return undefined;
    let cancelled = false;
    (async () => {
      let d = date;
      const label = allowedDaysLabel(g, t);
      if (!isDateAllowedForGroup(d, g)) {
        d = nearestAllowedDateStr(d, g);
        setDate(d);
        if (label) toast(t('This group only has class on:') + ' ' + label + '. ' + t('Jumped to the nearest matching date.'), 'ok');
      }
      const n = await loadForDate(d);
      if (cancelled) return;
      await loadHistory(n);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // Oy almashganda ro'yxatni yangilash (sahifa qayta ochilmasdan ham)
  const memberCountRef = useRef(0);
  memberCountRef.current = members ? members.length : 0;
  useEffect(() => { if (g) loadHistory(memberCountRef.current); }, [monthKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = async (d) => {
    setDate(d);
    await loadForDate(d);
  };

  // Three states: true = present, false = absent, undefined = not marked yet. A student nobody marked used to show
  // "Present" and was SAVED as present, so a quick Save marked absent students as present. Now the first tap marks
  // present, the next ones toggle, and "All present" fills only the students still unmarked.
  const toggle = (id) => setPresence((p) => ({ ...p, [id]: p[id] === undefined ? true : !p[id] }));
  const markAllPresent = () => setPresence((p) => {
    const next = { ...p };
    (members || []).forEach((m) => { if (next[m.user_id] === undefined) next[m.user_id] = true; });
    return next;
  });
  const unmarked = (members || []).filter((m) => presence[m.user_id] === undefined).length;

  async function save() {
    if (!g) { toast(t('Select a group.'), 'err'); return; }
    const marked = (members || []).filter((m) => typeof presence[m.user_id] === 'boolean');
    if (!marked.length) { toast(t('Mark at least one student first.'), 'err'); return; }
    setSaving(true);
    try {
      let sid = sessionId;
      if (!sid) {
        const { data, error } = await supabase.from('attendance_sessions').insert({ group_code: g.code, session_date: date }).select('id').single();
        if (error) throw error;
        sid = data.id;
        setSessionId(sid);
      }
      // Only students the teacher actually marked are written; the rest stay "not marked" (not counted as absent).
      const rows = marked.map((m) => ({ session_id: sid, user_id: m.user_id, present: presence[m.user_id] }));
      const { error: upErr } = await supabase.from('attendance_records').upsert(rows, { onConflict: 'session_id,user_id' });
      if (upErr) throw upErr;
      toast(unmarked ? t('Saved. Not marked yet: {n}.').replace('{n}', unmarked) : t('Attendance saved.'), 'ok');
      loadHistory(members ? members.length : 0);
      setSummaryNonce((n) => n + 1);
    } catch (err) {
      toast(err.message || 'Something went wrong.', 'err');
    } finally { setSaving(false); }
  }

  const label = g ? allowedDaysLabel(g, t) : '';

  return (
    <section className="page active" id="page-attendance">
      <PageStyle css={historyCss} />
      <div className="page-head">
        <h2>{t('Attendance')}</h2>
        <p>{t("Pick a date and mark attendance for the group's students.")}</p>
      </div>
      <div className="att-grid">
      <div className="att-col">
      <div className="panel">
        <div className="panel-head" style={{ gap: 14 }}>
          <h3>{t('Mark attendance')}</h3>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <DatePicker value={date} group={g} onPick={pick} />
            {members && members.length > 0 && unmarked > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={markAllPresent}>{t('All present')}</button>
            )}
            <button className="btn btn-gold btn-sm" id="saveAttendanceBtn" onClick={save} disabled={saving}>{t('Save')}</button>
          </div>
        </div>
        <p className="hint" id="attDaysHint" style={{ marginBottom: 12 }}>{label ? (t('Class days for this group:') + ' ' + label + '.') : ''}</p>
        <div className="att-list" id="attList">
          {!g ? <div className="empty-block">{t('Select a group')}</div>
            : members === null ? <Loader inline label={t('Loading…')} />
            : members.length === 0 ? <div className="empty-block">{t('There are no students in this group yet.')}</div>
            : members.map((m) => {
              const state = presence[m.user_id];
              return (
                <div className="att-row" key={m.user_id}>
                  <span>{m.name || t('Student')}</span>
                  <span className="att-toggle" onClick={() => toggle(m.user_id)} style={state === undefined ? { opacity: 0.6 } : undefined}>
                    <Switch on={state === true} />
                    {state === undefined ? t('Not marked') : t(state ? 'Present' : 'Absent')}
                  </span>
                </div>
              );
            })}
        </div>
      </div>
      <div className="panel att-recent">
        <div className="panel-head"><h3>{t('Recent attendance sessions')}</h3><span className="muted" style={{ fontSize: 12.5 }}>{t(MONTH_KEYS[new Date().getMonth()])} {new Date().getFullYear()}</span></div>
        <div className="att-recent-scroll"><table>
          <thead><tr><th>{t('Date')}</th><th>{t('Present')}</th></tr></thead>
          <tbody id="attHistoryBody">
            {!g ? <EmptyRow cols={2}>{t('Select a group')}</EmptyRow>
              : history === null ? <EmptyRow cols={2}>{t('Loading…')}</EmptyRow>
              : history.error ? <EmptyRow cols={2}>{history.error}</EmptyRow>
              : history.length === 0 ? <EmptyRow cols={2}>{t('No sessions yet.')}</EmptyRow>
              : history.map((s) => (
                <tr key={s.id}><td>{fmtDate(s.date)}</td><td>{s.present} / {s.total || '\u2014'}</td></tr>
              ))}
          </tbody>
        </table></div>
      </div>
      </div>
      <div className="att-col">
        <MonthlyAttendance group={g} refreshKey={summaryNonce} />
      </div>
      </div>
    </section>
  );
}
