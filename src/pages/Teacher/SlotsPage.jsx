import { openSafe } from '../../lib/safeUrl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import useLiveRefresh from '../../lib/liveRefresh';
import { usePanel } from '../../components/panel/PanelContext';
import { EmptyRow, Modal } from '../../components/panel/ui';

import { fmtDate as fmtDateL, currentLang } from '../../lib/dateLocale';
const STATUS_LABEL = { waiting: 'Waiting', in_progress: 'In progress', done: 'Done', no_show: 'No-show' };
function fmtTime(iso) { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
function fmtDur(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60), s = total % 60;
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}
function pad(n) { return (n < 10 ? '0' : '') + n; }
function localInputValue(iso) {
  const d = new Date(iso);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

/**
 * "Slots" — the live 1:1 scheduling grid for `individual`-type groups. Mirrors the teacher.html module of the
 * same name: a live Current/Next panel driven by a 1s ticker (for the countdown, not for refetching), a
 * per-session-date table with Start/Finish/No-show/Move actions, an unscheduled-students list, and a
 * "Create schedule" generator. All mutations go through the same RPCs as the original
 * (`start_slot`/`finish_slot`/`mark_no_show`/`move_slot`/`add_to_schedule`/`generate_slots`) — this page never
 * writes to `group_slots` directly, so the server-side scheduling logic stays the single source of truth.
 */
export default function SlotsPage() {
  const { t, toast, askConfirm, currentGroup: g } = usePanel();
  const code = g ? g.code : null;
  const [sessions, setSessions] = useState([]);
  const [slots, setSlots] = useState([]);
  const [members, setMembers] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [now, setNow] = useState(Date.now());
  const [moveModal, setMoveModal] = useState({ open: false, slot: null });
  const [csModal, setCsModal] = useState(false);

  const load = useCallback(async (opts) => {
    const silent = !!(opts && opts.silent);
    if (!g || g.type !== 'individual') { setLoading(false); return; }
    if (!silent) { setLoading(true); setErr(''); }
    try {
      const [sessRes, slotRes, memRes] = await Promise.all([
        supabase.from('individual_sessions').select('*').eq('group_code', g.code).order('session_date'),
        supabase.from('group_slots').select('*').eq('group_code', g.code).order('start_at'),
        supabase.from('group_members').select('user_id, name').eq('group_code', g.code),
      ]);
      if (sessRes.error) throw sessRes.error;
      if (slotRes.error) throw slotRes.error;
      if (memRes.error) throw memRes.error;
      const sess = sessRes.data || [];
      setSessions(sess);
      setSlots(slotRes.data || []);
      setMembers(memRes.data || []);
      setSelectedDate((cur) => {
        if (cur && sess.some((s) => s.session_date === cur)) return cur;
        const today = new Date().toISOString().slice(0, 10);
        const upcoming = sess.filter((s) => s.session_date >= today);
        return (upcoming[0] || sess[sess.length - 1] || {}).session_date || null;
      });
    } catch (e) {
      if (!silent) setErr(e.message || String(e));
    } finally { if (!silent) setLoading(false); }
  }, [g]);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load);

  // Realtime: any change to this group's slots/sessions triggers a full reload, same as the original.
  useEffect(() => {
    if (!code || !g || g.type !== 'individual') return undefined;
    const channel = supabase.channel('group_slots_' + code)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_slots', filter: 'group_code=eq.' + code }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'individual_sessions', filter: 'group_code=eq.' + code }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [code, g, load]);

  // The Next-slot countdown timer only — not a refetch tick.
  useEffect(() => {
    if (!g || g.type !== 'individual') return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [g]);

  const current = useMemo(() => slots.find((s) => s.status === 'in_progress') || null, [slots]);
  const next = useMemo(() => slots.filter((s) => s.status === 'waiting').sort((a, b) => new Date(a.start_at) - new Date(b.start_at))[0] || null, [slots]);
  const noShowMs = (g && g.no_show_minutes ? g.no_show_minutes : 3) * 60000;
  const isLate = next && (now - new Date(next.start_at).getTime()) > noShowMs;

  const slotsForDate = useMemo(() => {
    const sessIds = sessions.filter((s) => s.session_date === selectedDate).map((s) => s.id);
    return slots.filter((s) => sessIds.includes(s.session_id)).sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
  }, [sessions, slots, selectedDate]);

  const unscheduled = useMemo(() => {
    const scheduled = new Set(slots.map((s) => s.user_id));
    return members.filter((m) => !scheduled.has(m.user_id));
  }, [members, slots]);

  async function callRpc(name, params, okMsg) {
    const { error } = await supabase.rpc(name, params);
    if (error) { toast(error.message, 'err'); return; }
    if (okMsg) toast(okMsg, 'ok');
  }

  if (!g) {
    return (
      <section className="page active"><div className="page-head"><h2>{t('Slots')}</h2></div><div className="empty-block">{t('Select a group')}</div></section>
    );
  }
  if (g.type !== 'individual') {
    return (
      <section className="page active"><div className="page-head"><h2>{t('Slots')}</h2></div><div className="empty-block">{t('This group is not an individual group.')}</div></section>
    );
  }

  return (
    <section className="page active" id="page-slots">
      <div className="page-head">
        <h2>{t('Slots')}</h2>
        <p>{t("One-on-one time slots for this group's Zoom room.")}</p>
      </div>

      <div className="panel">
        <div className="slots-live-grid">
          {loading ? <div className="empty-block">{t('Loading…')}</div> : err ? <div className="empty-block">{err}</div> : (
            <>
              <div className="slots-live-card">
                <div className="slots-live-label">{t('Current')}</div>
                <div className="slots-live-name">{current ? current.student_name : '\u2014'}</div>
                {current && <div className="slots-live-timer">{fmtTime(current.start_at)}{'\u2013'}{fmtTime(current.end_at)}</div>}
              </div>
              <div className="slots-live-card">
                <div className="slots-live-label">{t('Next')}{isLate && <> {'\u2022'} <span style={{ color: '#D98B78' }}>{t('Late')}</span></>}</div>
                <div className="slots-live-name">{next ? next.student_name : '\u2014'}</div>
                {next && <div className="slots-live-timer">{fmtDur(new Date(next.start_at).getTime() - now)}</div>}
              </div>
              <div className="slots-live-card slots-live-actions">
                <button type="button" className="btn btn-ghost btn-sm" disabled={!g.zoom_link} onClick={() => g.zoom_link && openSafe(g.zoom_link)}>{t('Open Zoom')}</button>
                <button type="button" className="btn btn-gold btn-sm" disabled={!next} onClick={() => next && callRpc('start_slot', { p_slot_id: next.id })}>{t('Start')}</button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={!current} onClick={() => current && callRpc('finish_slot', { p_slot_id: current.id })}>{t('Finish')}</button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={!next} onClick={() => next && callRpc('mark_no_show', { p_slot_id: next.id })}>{t('No-show')}</button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head" style={{ gap: 14, flexWrap: 'wrap' }}>
          <h3>{t('Sessions')}</h3>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="scope-tabs">
              {sessions.map((s) => (
                <button type="button" key={s.id} className={'scope-btn' + (s.session_date === selectedDate ? ' on' : '')} onClick={() => setSelectedDate(s.session_date)}>
                  {fmtDateL(s.session_date + 'T00:00:00', currentLang(), { month: 'short', day: 'numeric' })}
                </button>
              ))}
            </div>
            <button className="btn btn-gold btn-sm" onClick={() => setCsModal(true)}>{t('Create schedule')}</button>
          </div>
        </div>
        <table>
          <thead><tr><th>{t('Time')}</th><th>{t('Student')}</th><th>{t('Status')}</th><th></th></tr></thead>
          <tbody>
            {sessions.length === 0 ? <EmptyRow cols={4}>{t("The schedule hasn't been created yet.")}</EmptyRow>
              : slotsForDate.length === 0 ? <EmptyRow cols={4}>{t('No students scheduled for this day.')}</EmptyRow>
              : slotsForDate.map((s) => (
                <tr className={current && current.id === s.id ? 'slot-row-current' : ''} key={s.id}>
                  <td>{fmtTime(s.start_at)}{'\u2013'}{fmtTime(s.end_at)}</td>
                  <td><b>{s.student_name}</b></td>
                  <td><span className={'slot-status-dot slot-status-' + s.status}></span>{t(STATUS_LABEL[s.status] || s.status)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {s.status === 'waiting' && (
                      <button type="button" className="icon-btn" title={t('Move')} onClick={() => setMoveModal({ open: true, slot: s })}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 8v8M8 12h8" /></svg>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {unscheduled.length > 0 && (
        <div className="panel">
          <div className="panel-head"><h3>{t('Unscheduled')}</h3></div>
          <div className="u-list">
            {unscheduled.map((m) => <UnscheduledRow key={m.user_id} member={m} groupCode={code} t={t} toast={toast} />)}
          </div>
        </div>
      )}

      <MoveSlotModal state={moveModal} onClose={() => setMoveModal((s) => ({ ...s, open: false }))} />
      <CreateScheduleModal open={csModal} onClose={() => setCsModal(false)} onGenerated={load} />
    </section>
  );
}

function UnscheduledRow({ member: m, groupCode, t, toast }) {
  const [busy, setBusy] = useState(false);
  async function add() {
    setBusy(true);
    const { error } = await supabase.rpc('add_to_schedule', { p_group_code: groupCode, p_user_id: m.user_id });
    setBusy(false);
    if (error) { toast(error.message, 'err'); return; }
    toast(t('Added to the schedule.'), 'ok');
  }
  return (
    <div className="u-item">
      <div className="u-item-main"><div className="u-item-title">{m.name}</div></div>
      <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={add}>{t('Add to schedule')}</button>
    </div>
  );
}

function MoveSlotModal({ state, onClose }) {
  const { t, toast } = usePanel();
  const [val, setVal] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (state.open && state.slot) { setVal(localInputValue(state.slot.start_at)); setError(''); } }, [state.open, state.slot]);

  async function save() {
    if (!val) { setError(t('Pick a time.')); return; }
    setSaving(true);
    try {
      const iso = new Date(val).toISOString();
      const { error: err } = await supabase.rpc('move_slot', { p_slot_id: state.slot.id, p_new_start: iso });
      if (err) throw err;
      onClose();
      toast(t('Slot moved.'), 'ok');
    } catch (e) { setError(e.message || String(e)); } finally { setSaving(false); }
  }

  return (
    <Modal open={state.open} onClose={onClose} style={{ maxWidth: 380 }}>
      <h3>{t('Move slot')}</h3>
      <div className="field">
        <label>{t('New time')}</label>
        <input type="datetime-local" value={val} onChange={(e) => setVal(e.target.value)} />
      </div>
      <p className="hint" style={{ display: error ? 'block' : 'none', color: 'var(--danger-bright)' }}>{error}</p>
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>{t('Cancel')}</button>
        <button type="button" className="btn btn-gold" disabled={saving} onClick={save}>{t('Save')}</button>
      </div>
    </Modal>
  );
}

function CreateScheduleModal({ open, onClose, onGenerated }) {
  const { t, toast, askConfirm, currentGroup: g } = usePanel();
  const [dates, setDates] = useState([]);
  const [dateInput, setDateInput] = useState('');
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('18:00');
  const [shuffle, setShuffle] = useState(false);
  const [memberCount, setMemberCount] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const sessionsRef = useRef([]);

  useEffect(() => {
    if (!open) return;
    setDates([]); setDateInput(''); setStart('09:00'); setEnd('18:00'); setShuffle(false); setError('');
    (async () => {
      if (!g) return;
      const { count } = await supabase.from('group_members').select('user_id', { count: 'exact', head: true }).eq('group_code', g.code);
      setMemberCount(count || 0);
      const { data } = await supabase.from('individual_sessions').select('session_date').eq('group_code', g.code);
      sessionsRef.current = (data || []).map((s) => s.session_date);
    })();
  }, [open, g]);

  const preview = useMemo(() => {
    if (!g || !start || !end || dates.length === 0) return '';
    const slotMin = g.slot_minutes || 10, bufMin = g.buffer_minutes || 2;
    const startMin = parseInt(start.split(':')[0], 10) * 60 + parseInt(start.split(':')[1], 10);
    const endMin = parseInt(end.split(':')[0], 10) * 60 + parseInt(end.split(':')[1], 10);
    const perDay = Math.max(0, Math.floor((endMin - startMin) / (slotMin + bufMin)));
    const total = perDay * dates.length;
    return memberCount + ' ' + t('students') + ' \u00d7 (' + slotMin + '+' + bufMin + ') ' + t('min') +
      ' \u2192 ' + perDay + '/' + t('day') + ' \u00d7 ' + dates.length + ' ' + t('day(s)') + ' = ' + total +
      (total < memberCount ? ' \u2014 ' + t('not enough — add more dates or widen the window') : ' \u2713');
  }, [g, start, end, dates, memberCount, t]);

  function addDate() {
    if (dateInput && !dates.includes(dateInput)) setDates([...dates, dateInput].sort());
  }

  async function doGenerate() {
    setSaving(true);
    try {
      const { error: err } = await supabase.rpc('generate_slots', { p_group_code: g.code, p_dates: dates, p_window_start: start, p_window_end: end, p_shuffle: shuffle });
      if (err) throw err;
      onClose();
      toast(t('Schedule generated.'), 'ok');
      onGenerated();
    } catch (e) { setError(e.message || String(e)); } finally { setSaving(false); }
  }

  function generate() {
    setError('');
    if (dates.length === 0) { setError(t('Add at least one date.')); return; }
    if (!start || !end) { setError(t('Pick a window.')); return; }
    const overlap = dates.filter((d) => sessionsRef.current.includes(d));
    if (overlap.length > 0) {
      askConfirm(t('Regenerate schedule?'), t('These dates already have a schedule and will be replaced: ') + overlap.join(', '), doGenerate);
    } else {
      doGenerate();
    }
  }

  return (
    <Modal open={open} onClose={onClose} style={{ maxWidth: 480 }}>
      <h3>{t('Create schedule')}</h3>
      <div className="field">
        <label>{t('Dates')}</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="date" style={{ flex: 1 }} value={dateInput} onChange={(e) => setDateInput(e.target.value)} />
          <button type="button" className="btn btn-ghost btn-sm" onClick={addDate}>{t('+ Add date')}</button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {dates.map((d, i) => (
            <span className="cs-date-chip" key={d}>{d}<button type="button" onClick={() => setDates(dates.filter((_, idx) => idx !== i))}>&times;</button></span>
          ))}
        </div>
      </div>
      <div className="field-row">
        <div className="field"><label>{t('Window start')}</label><input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></div>
        <div className="field"><label>{t('Window end')}</label><input type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
      </div>
      <div className="field">
        <label className="att-toggle" style={{ cursor: 'pointer' }} onClick={() => setShuffle((s) => !s)}>
          <span className={'switch' + (shuffle ? ' on' : '')}><span className="dot"></span></span>
          {t('Shuffle order')}
        </label>
      </div>
      <p className="hint" style={{ margin: '4px 0 0' }}>{preview}</p>
      <p className="hint" style={{ display: error ? 'block' : 'none', color: 'var(--danger-bright)' }}>{error}</p>
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>{t('Cancel')}</button>
        <button type="button" className="btn btn-gold" disabled={saving} onClick={generate}>{t('Generate')}</button>
      </div>
    </Modal>
  );
}
