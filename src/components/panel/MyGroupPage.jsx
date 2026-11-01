import { useCallback, useEffect, useMemo, useState } from 'react';
import useLiveRefresh from '../../lib/liveRefresh';
import { openSafe } from '../../lib/safeUrl';
import { viewerIsOnTashkentTime, viewerGmtLabel } from '../../lib/tzTime';
import { getCurrentWeekDates, scheduleDaysToWeekArray, nowInTashkent, tashkentInstant, formatLocalTime, DAY_NAME_BY_JS, MONTH_NAMES } from '../../pages/Dashboard/weekUtils';
import LessonHorizon from '../../pages/Dashboard/LessonHorizon';
import NoClassModal from '../../pages/Dashboard/NoClassModal';
import { gcSenderColor, gcHexToRgba } from '../../pages/Dashboard/GroupChat/chatUtils';
import { supabase } from '../../lib/supabaseClient';
import { usePanel } from './PanelContext';
import { dayLabel } from '../../lib/panelUtils';
import { useGroupChat } from '../../pages/Dashboard/GroupChat/useGroupChat';
import GroupChat from '../../pages/Dashboard/GroupChat/GroupChat';
import PageStyle from '../PageStyle';
import useJoinCodes from '../../lib/useJoinCodes';
import chatBaseCss from '../../pages/Dashboard/GroupChat/chat-base.css?inline';
import groupCss from './group-page.css?inline';
import studentGroupCss from '../../pages/Dashboard/my-group.css?inline';
import scheduleCss from './group-schedule.css?inline';

/** Press ripple for the header buttons (same as the student My Group). */
function ripple(e) {
  const el = e.currentTarget;
  const rect = el.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 1.6;
  const dot = document.createElement('span');
  dot.className = 'gp-ripple';
  dot.style.width = dot.style.height = size + 'px';
  dot.style.left = (e.clientX - rect.left - size / 2) + 'px';
  dot.style.top = (e.clientY - rect.top - size / 2) + 'px';
  el.appendChild(dot);
  dot.addEventListener('animationend', () => dot.remove());
}

const TIME_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const DEFAULT_LESSON_MINUTES = 120;
const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DURATION_PRESETS = [60, 90, 120];

/**
 * "My Group" (shared by the teacher and admin panels): schedule + roster for the teacher's currently-selected group,
 * mirroring the student dashboard's group view, plus the group chat (voice notes, media, search, pins,
 * reply/edit/delete — shared `useGroupChat`/`GroupChat` components with the student dashboard).
 */
export default function MyGroupPage() {
  const { t, toast, user, myName, myAvatarUrl, currentGroup: g, myGroups, reloadGroups } = usePanel();
  const [members, setMembers] = useState(null);   // null = loading
  const [editing, setEditing] = useState(false);
  const [days, setDays] = useState([]);
  const [duration, setDuration] = useState(DEFAULT_LESSON_MINUTES);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [chatShown, setChatShown] = useState(false);
  const [memberQuery, setMemberQuery] = useState('');
  const [heroKind, setHeroKind] = useState('none');
  const [noClass, setNoClass] = useState({ open: false, info: '' }); // "class not started yet" popup (same UX as the student panel)
  const currentWeek = useMemo(() => getCurrentWeekDates(), []);
  const [dayIndex, setDayIndex] = useState(() => { const i = getCurrentWeekDates().findIndex((w) => w.isToday); return i < 0 ? 0 : i; });

  const chat = useGroupChat({ groupCode: g ? g.code : null, user, myName, t });

  useEffect(() => () => { chat.cancelRecording(); chat.stopAllVoice(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Depend on the group CODE, not the group object: the groups list is refreshed every few seconds and gives a new
  // object each time, which used to close the open chat and reload the roster while the teacher was typing.
  const gCode = g ? g.code : null;
  useEffect(() => {
    setEditing(false);
    setChatShown(false);
    if (!g) { setMembers(null); return undefined; }
    let cancelled = false;
    setMembers(null);
    (async () => {
      const { data, error: err } = await supabase.from('group_members').select('user_id, name, avatar_url').eq('group_code', g.code).order('joined_at');
      if (cancelled) return;
      if (err) { toast(err.message, 'err'); return; }
      setMembers(data || []);
    })();
    return () => { cancelled = true; };
  }, [gCode, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  // Silent 5-second refresh of the roster: a student who joins or leaves shows up without a manual reload.
  useLiveRefresh(async () => {
    if (!g) return;
    const { data } = await supabase.from('group_members').select('user_id, name, avatar_url').eq('group_code', g.code).order('joined_at');
    if (data) setMembers(data);
  });

  // What the hero shows: a lesson that is on right now, the next one, or nothing scheduled (Tashkent wall-clock times).
  const resolveHero = useCallback(() => {
    const list = g && Array.isArray(g.schedule_days) ? g.schedule_days : [];
    if (!list.length) return { kind: 'none' };
    const durMs = (parseInt(g.duration_minutes, 10) || DEFAULT_LESSON_MINUTES) * 60000;
    const nowMs = Date.now();
    const todayIdx = nowInTashkent().getUTCDay();
    for (let offset = 0; offset <= 7; offset++) {
      const entry = list.find((e) => e && e.day === DAY_NAME_BY_JS[(todayIdx + offset) % 7] && TIME_RE.test(e.time || ''));
      if (!entry) continue;
      const [hh, mm] = entry.time.split(':').map(Number);
      const start = tashkentInstant(offset, hh, mm);
      const end = new Date(start.getTime() + durMs);
      if (offset === 0 && nowMs >= start.getTime() && nowMs <= end.getTime()) return { kind: 'live', start, end };
      if (start.getTime() > nowMs) return { kind: 'next', start, end };
    }
    return { kind: 'none' };
  }, [g]);

  if (myGroups.length === 0) {
    return (
      <section className="page active" id="page-groups">
        <div className="page-head"><h2>{t('My Group')}</h2><p>{t('Schedule, students and group chat.')}</p></div>
        <div className="empty-block">{t('No group assigned')}</div>
      </section>
    );
  }
  if (!g) return null;

  const scheduleDays = Array.isArray(g.schedule_days) ? g.schedule_days : [];

  function openEdit() {
    setDays(scheduleDays.length ? JSON.parse(JSON.stringify(scheduleDays)) : []);
    setDuration(g.duration_minutes || DEFAULT_LESSON_MINUTES);
    setError('');
    setEditing(true);
  }

  const entryOf = (name) => days.find((d) => d && d.day === name);
  function toggleDay(name) {
    setDays((cur) => (cur.some((d) => d.day === name) ? cur.filter((d) => d.day !== name) : [...cur, { day: name, time: '18:00' }]));
  }
  function setDayTime(name, time) {
    setDays((cur) => cur.map((d) => (d.day === name ? { ...d, time } : d)));
  }

  async function save() {
    setError('');
    for (const d of days) {
      if (!TIME_RE.test(d.time || '')) { setError(t('Invalid time format (must be HH:MM, e.g. 18:00).')); return; }
    }
    const dur = parseInt(duration, 10);
    if (!duration || !Number.isFinite(dur) || dur <= 0) { setError(t('Please enter a valid lesson duration in minutes.')); return; }
    const ordered = [...days].sort((a, b) => WEEK_DAYS.indexOf(a.day) - WEEK_DAYS.indexOf(b.day));
    const scheduleText = ordered.map((d) => dayLabel(t, d.day) + ' ' + d.time).join(' / ');
    setSaving(true);
    const { error: err } = await supabase.from('groups').update({ schedule_days: ordered, schedule: scheduleText || g.schedule, duration_minutes: dur }).eq('code', g.code);
    setSaving(false);
    if (err) { setError(err.message); return; }
    toast(t('Group updated.'), 'ok');
    setEditing(false);
    reloadGroups();
  }

  /** Start Class is allowed ONLY while the scheduled lesson is on (Tashkent time); otherwise explain when the next one starts. */
  function handleStartClass() {
    const h = resolveHero();
    if (h.kind === 'live') { openSafe(g.zoom_link); return; }
    let info;
    if (h.kind === 'next') {
      const d = h.start;
      info = t('Your next class is {day}, {date} at {time} (your local time).')
        .replace('{day}', t(DAY_NAME_BY_JS[d.getDay()]))
        .replace('{date}', MONTH_NAMES[d.getMonth()] + ' ' + d.getDate())
        .replace('{time}', formatLocalTime(d));
    } else {
      info = t("There's no upcoming class scheduled for this group yet.");
    }
    setNoClass({ open: true, info });
  }

  const showChat = () => { setChatShown(true); chat.setChatOpen(true); };
  const hideChat = () => {
    setChatShown(false);
    chat.setChatOpen(false);
    chat.setComposer(null);
    chat.cancelRecording();
    chat.stopAllVoice();
  };

  // Stored in Tashkent time; the week strip is the viewer's own calendar, so convert (day AND clock) to the viewer's zone.
  const scheduleByDay = {};
  scheduleDaysToWeekArray(scheduleDays, currentWeek).forEach((e) => { if (e.time) scheduleByDay[e.day] = e.time; });
  const activeWeek = currentWeek[dayIndex];
  const activeTime = activeWeek ? scheduleByDay[activeWeek.day] : null;
  const q = memberQuery.trim().toLowerCase();
  const visible = members && q ? members.filter((m) => (m.name || '').toLowerCase().includes(q)) : members;

  const stripDays = currentWeek.map((w, i) => (
    <button type="button" key={w.day} role="tab" aria-selected={i === dayIndex}
            className={['group-week-day', scheduleByDay[w.day] && 'has-class', w.isToday && 'is-today', i === dayIndex && 'active'].filter(Boolean).join(' ')}
            onClick={() => setDayIndex(i)}>
      <span className="gwd-name">{t(w.day.slice(0, 3))}</span>
      <span className="gwd-num">{w.dateNum}</span>
      <span className="gwd-dot"></span>
    </button>
  ));

  return (
    <section className={'page active group-page gp2' + (chatShown ? ' chat-mode' : '')} id="page-groups">
      <PageStyle css={groupCss} />
      <PageStyle css={studentGroupCss} />
      <PageStyle css={chatBaseCss} />
      <PageStyle css={scheduleCss} />
      <div className="group-page-head" id="groupPageHead">
        <div><h1>{t('My Group')}</h1><p>{t('Schedule, students and group chat.')}</p></div>
        <div className="group-page-head-actions">
          <button type="button" className="group-page-chat-btn" onPointerDown={ripple} onClick={showChat}>
            <svg className="gp-ico gp-ico-chat" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
              <circle className="gp-dot gp-dot-1" cx="8.5" cy="11.5" r="1" fill="currentColor" stroke="none" />
              <circle className="gp-dot gp-dot-2" cx="12" cy="11.5" r="1" fill="currentColor" stroke="none" />
              <circle className="gp-dot gp-dot-3" cx="15.5" cy="11.5" r="1" fill="currentColor" stroke="none" />
            </svg>
            <span className="gp-btn-label">{t('Chat')}</span>
            <span className="gc-unread-badge" style={{ display: chat.unreadCount > 0 ? 'flex' : 'none' }}>
              {chat.unreadCount > 99 ? '99+' : String(chat.unreadCount)}
            </span>
          </button>
          <button type="button" className="group-page-join" onPointerDown={ripple} onClick={openEdit}>
            <svg className="gp-ico gp-ico-manage" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
              <line className="gp-knob gp-knob-1" x1="1" y1="14" x2="7" y2="14" />
              <line className="gp-knob gp-knob-2" x1="9" y1="8" x2="15" y2="8" />
              <line className="gp-knob gp-knob-3" x1="17" y1="16" x2="23" y2="16" />
            </svg>
            <span className="gp-btn-label">{t('Edit schedule')}</span>
          </button>
        </div>
      </div>

      {chatShown ? (
        <GroupChat
          chat={chat} groupCode={g.code} groupName={g.name}
          memberCount={members ? members.length : null} myId={user && user.id} myAvatarUrl={myAvatarUrl || null} onBack={hideChat}
        />
      ) : (
      <div className="group-page-grid" id="groupsPageGrid">
        <div className="panel group-main-card">
          <LessonHorizon t={t} teacher groupName={g.name} resolve={resolveHero} onKindChange={setHeroKind} />
          {!editing ? (
            <div className="gp-body">
              <div className="group-week-strip" role="tablist" aria-label={t('This week')} style={{ '--i': dayIndex }}>
                <span className="gwd-pill" aria-hidden="true" />
                {stripDays}
              </div>
              <div className="gp-day" key={dayIndex}>
                <div className="gp-day-text">
                  <div className="group-schedule-day">
                    {activeWeek && `${t(activeWeek.day)}, ${t(activeWeek.dateLabel.split(' ')[0])} ${activeWeek.dateLabel.split(' ')[1]}`}
                  </div>
                  <div className="group-schedule-time">{activeTime || t('No class')}</div>
                  <div className="group-schedule-label">{activeTime ? (viewerIsOnTashkentTime() ? t('Class time · Tashkent time') : t('Class time · your local time') + ' (' + viewerGmtLabel() + ')') : t('No lesson scheduled')}</div>
                </div>
                <span className="group-schedule-dot" aria-hidden="true" style={activeTime ? undefined : { background: 'var(--text-muted)', boxShadow: 'none' }}></span>
              </div>
              {g.zoom_link ? (
                <button type="button" className={'group-join-btn' + (heroKind === 'live' ? ' is-live' : ' is-locked')} aria-disabled={heroKind !== 'live'} onClick={handleStartClass}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
                  <span>{t('Start Class')}</span>
                </button>
              ) : null}
              <div className="gp-code"><AccessCode group={g} /></div>
            </div>
          ) : (
            <div className="gp-body gp-edit">
              <div className="gp-edit-head">
                <div className="gp-edit-title">{t('Class days')}</div>
                <div className="gp-edit-sub">{t('Tashkent time')}</div>
              </div>
              <div className="gp-edit-list">
                {WEEK_DAYS.map((name) => {
                  const entry = entryOf(name);
                  const on = !!entry;
                  return (
                    <div className={'gp-edit-row' + (on ? ' on' : '')} key={name}>
                      <button type="button" role="switch" aria-checked={on} aria-label={dayLabel(t, name)} className={'gp-sw' + (on ? ' on' : '')} onClick={() => toggleDay(name)}>
                        <span className="gp-sw-dot" />
                      </button>
                      <span className="gp-edit-day">{dayLabel(t, name)}</span>
                      {on ? (
                        <input type="time" className="gp-time" value={entry.time || ''} aria-label={dayLabel(t, name) + ' ' + t('time')}
                               onChange={(e) => setDayTime(name, e.target.value)} />
                      ) : <span className="gp-edit-off">{t('Day off')}</span>}
                    </div>
                  );
                })}
              </div>
              <div className="gp-edit-dur">
                <label htmlFor="gpDuration">{t('Lesson duration (min)')}</label>
                <div className="gp-dur-chips">
                  {DURATION_PRESETS.map((m) => (
                    <button type="button" key={m} className={'gp-chip' + (parseInt(duration, 10) === m ? ' on' : '')} onClick={() => setDuration(m)}>{m}</button>
                  ))}
                  <input id="gpDuration" type="number" min="1" step="1" placeholder="120" className="gp-dur-input" value={duration} onChange={(e) => setDuration(e.target.value)} />
                </div>
              </div>
              <p className="gp-edit-error" role="alert" style={{ display: error ? 'block' : 'none' }}>{error}</p>
              <div className="gp-edit-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>{t('Cancel')}</button>
                <button type="button" className="btn btn-gold btn-sm" disabled={saving} onClick={save}>{t('Save')}</button>
              </div>
            </div>
          )}
        </div>

        <div className="panel group-members-card">
          <div className="panel-head cm-head">
            <div className="cm-head-title">
              <h3 style={{ margin: 0 }}>{t('Students')}</h3>
              <span className="cm-count">{(members || []).length} {t('students')}</span>
            </div>
            {members && members.length > 6 && (
              <label className="cm-search">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                <input type="text" value={memberQuery} onChange={(e) => setMemberQuery(e.target.value)} placeholder={t('Search students')} aria-label={t('Search students')} autoComplete="off" />
                {memberQuery && (
                  <button type="button" className="cm-clear" aria-label={t('Clear search')} onClick={(e) => { e.preventDefault(); setMemberQuery(''); }}>
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                )}
              </label>
            )}
          </div>
          <div className="cm-list">
            {visible === null ? <div className="classmate-empty">{t('Loading…')}</div>
              : members.length === 0 ? <div className="classmate-empty">{t('No students have joined yet.')}</div>
              : visible.length === 0 ? <div className="classmate-empty">{t('No matches found')}</div>
              : visible.map((m, i) => {
                const tint = gcSenderColor(m.user_id || m.name);
                return (
                  <div key={(m.user_id || m.name) + i} className="cm-row" style={{ '--n': Math.min(i, 14) }}>
                    <div className="cm-avatar" style={!m.avatar_url ? { background: gcHexToRgba(tint, 0.18), color: tint } : undefined}>
                      {m.avatar_url ? <img src={m.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', display: 'block' }} /> : (m.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="cm-name" title={m.name}>{m.name || t('Student')}</div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
      )}
      <NoClassModal open={noClass.open} title={t('Class has not started yet')} nextInfo={noClass.info}
                    onClose={() => setNoClass((c) => ({ ...c, open: false }))} />
    </section>
  );
}

/**
 * The group's student-facing join code (`group_access_codes`, one row per group). View-only display + copy;
 * if the group has never had a code generated, offers to generate one. Ported from `#accessCodeWrap` /
 * loadAccessCode() / saveAccessCode() in teacher.html.
 */
function AccessCode({ group: g }) {
  const { t, toast } = usePanel();
  const [row, setRow] = useState(null);   // undefined-ish states: null = loading, false = none, {code} = found
  const [generating, setGenerating] = useState(false);
  const { joinCodes, loaded, reload } = useJoinCodes([g.code]);

  // Always mirrors the database (and follows it live), so a changed join code never shows an old value.
  useEffect(() => {
    if (!loaded) { setRow(null); return; }
    setRow(joinCodes[g.code] ? { code: joinCodes[g.code] } : false);
  }, [g.code, joinCodes, loaded]);

  async function generate() {
    setGenerating(true);
    const { data, error } = await supabase.rpc('generate_group_join_code', { p_group_code: g.code });
    setGenerating(false);
    if (error || !data) { toast((error && error.message) || t('Could not create the join code.'), 'err'); return; }
    toast(t('Join code updated.'), 'ok');
    setRow({ code: String(data) });
    reload();
  }

  function copy() {
    const code = row.code;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(() => toast(t('Code copied.'), 'ok'), () => toast(code, 'ok'));
    } else {
      toast(code, 'ok');
    }
  }

  if (row === null) return <div className="code-row"><span className="muted" style={{ fontSize: 13 }}>{t('Loading…')}</span></div>;
  if (row && row.error) return <div className="code-row">{row.error}</div>;
  if (!row) {
    return (
      <div className="code-row">
        <span className="code-label">{t('Join code')}</span>
        <span className="muted" style={{ fontSize: 13 }}>{t('This group has no join code yet.')}</span>
        <button type="button" className="btn btn-ghost btn-sm" disabled={generating} onClick={generate}>{t('Generate code')}</button>
      </div>
    );
  }
  return (
    <div className="code-row">
      <span className="code-label">{t('Join code')}</span>
      <span className="code-value">{row.code}</span>
      <button type="button" className="btn btn-ghost btn-sm" onClick={copy}>{t('Copy')}</button>
    </div>
  );
}
