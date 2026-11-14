import { openSafe } from '../../lib/safeUrl';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useLiveRefresh from '../../lib/liveRefresh';
import { useCabinetI18n } from '../../context/CabinetI18nContext';
import { useDashboardData, getGroupMembers } from '../../context/DashboardDataContext';
import { supabase } from '../../lib/supabaseClient';
import { getCurrentWeekDates, scheduleDaysToWeekArray, getLiveClassNow, findNextClass, formatLocalTime, DAY_NAME_BY_JS, MONTH_NAMES } from './weekUtils';
import { useIndividualSchedule, isoDateOf } from './useIndividualSchedule';
import { scrollWithin } from '../../hooks/useScrollTop';
import { useGroupChat } from './GroupChat/useGroupChat';
import { gcSenderColor, gcHexToRgba } from './GroupChat/chatUtils';
import GroupChat from './GroupChat/GroupChat';
import LessonHorizon from './LessonHorizon';
import PageStyle from '../../components/PageStyle';
import myGroupCss from './my-group.css?inline';
import chatBaseCss from './GroupChat/chat-base.css?inline';
import GroupManageModal from './GroupManageModal';
import GroupWelcomeModal from './GroupWelcomeModal';
import JoinGroupModal from './JoinGroupModal';
import NoClassModal from './NoClassModal';
// KEYINCHALIK UCHUN (hozircha o'chirilgan): dars sayt ichida Zoom SDK orqali ochilishi.
// Qayta yoqish uchun: shu izohlarni oching + enterLesson() va pastdagi <ZoomRoom/> blokini ham.
// import { canEmbedZoom } from '../../lib/zoomEmbed';
// // Zoom SDK og'ir — faqat o'quvchi darsga kirganda yuklanadi.
// const ZoomRoom = lazy(() => import('./ZoomRoom/ZoomRoom'));

const LOCK_ICON = (
  <svg className="gp-empty-art" viewBox="0 0 120 80" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path className="gp-empty-arc" d="M14 68a46 46 0 0192 0" stroke="currentColor" strokeWidth="2.5" strokeDasharray="2 8" />
    <line x1="4" y1="70" x2="116" y2="70" stroke="currentColor" strokeWidth="2" opacity=".35" />
    <circle className="gp-empty-sun" cx="60" cy="40" r="10" fill="currentColor" />
  </svg>
);
const JOIN_ICON = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
);

/** Material-style press ripple for the header buttons (pure DOM, removes itself when the animation ends). */
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

/**
 * My Group page — class schedule (week strip + day detail + Join Class) and classmates grid.
 * Port of dashboard.html's `<section class="group-page" id="myGroupPage">`, "class"-type groups
 * only for now (see MIGRATION.md — individual 1:1 groups and the group chat panel are next).
 */
export default function MyGroupView({ onNavigate, onChatOpenChange }) {
  const { t } = useCabinetI18n();
  const { user, avatarUrl, groupCode, groupData, groupReady, groups, switchGroup, refreshGroup } = useDashboardData();
  const [joinOpen, setJoinOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [welcomeName, setWelcomeName] = useState('');   // the group just joined (not the one that was open before)
  const [noClassOpen, setNoClassOpen] = useState(false);
  const [noClassInfo, setNoClassInfo] = useState('');
  const [noClassTitle, setNoClassTitle] = useState('');
  const [members, setMembers] = useState(null);
  const [memberQuery, setMemberQuery] = useState('');
  const [chatShown, setChatShown] = useState(false);
  const [heroKind, setHeroKind] = useState('none'); // 'live' | 'next' | 'none' — reported by <LessonHorizon/>
  // const [zoomOpen, setZoomOpen] = useState(false); // keyinroq: sayt ichida Zoom
  const myName = (typeof localStorage !== 'undefined' && localStorage.getItem('ufuq-profile-name')) || 'Student';

  const joined = !!groupCode;
  // The code shown in "Manage Group" is the one students type to join (not the internal group code).
  const [joinCode, setJoinCode] = useState('');
  useEffect(() => {
    setJoinCode('');
    if (!groupCode) return undefined;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc('my_group_join_code', { p_group_code: groupCode });
      if (!cancelled && data) setJoinCode(String(data));
    })();
    return () => { cancelled = true; };
  }, [groupCode]);
  const isIndividual = !!(groupData && groupData.type === 'individual');
  const userId = user && user.id;

  const currentWeek = useMemo(() => getCurrentWeekDates(), []);
  const [dayIndex, setDayIndex] = useState(() => { const i = currentWeek.findIndex((w) => w.isToday); return i < 0 ? 0 : i; });

  const chat = useGroupChat({ groupCode: joined ? groupCode : null, user, myName, t });
  const indiv = useIndividualSchedule(groupCode, joined && isIndividual);

  // The floating Ufuq AI launcher hides while the chat is on screen (it would sit on the composer).
  useEffect(() => { if (onChatOpenChange) onChatOpenChange(chatShown); }, [chatShown, onChatOpenChange]);
  useEffect(() => () => { if (onChatOpenChange) onChatOpenChange(false); }, [onChatOpenChange]);

  const showChat = () => { setChatShown(true); chat.setChatOpen(true); };
  const hideChat = useCallback(() => {
    setChatShown(false);
    chat.setChatOpen(false);
    chat.setComposer(null);
    chat.cancelRecording();
    chat.stopAllVoice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.setChatOpen, chat.setComposer, chat.cancelRecording, chat.stopAllVoice]);
  useEffect(() => { if (!joined) setChatShown(false); }, [joined]);

  useEffect(() => {
    if (!joined) { setMembers(null); return; }
    let cancelled = false;
    (async () => { const rows = await getGroupMembers(groupCode); if (!cancelled) setMembers(rows); })();
    return () => { cancelled = true; };
  }, [joined, groupCode]);
  useLiveRefresh(async () => { if (!joined) return; const rows = await getGroupMembers(groupCode); setMembers(rows); });

  // Landing on My Group without a group opens the join-code modal on top of the empty state (like the original).
  useEffect(() => { if (groupReady && !groupCode) setJoinOpen(true); }, [groupReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const weekSchedule = useMemo(
    () => (joined && groupData && !isIndividual ? scheduleDaysToWeekArray(groupData.scheduleDays, currentWeek, groupData.examDays) : []),
    [joined, groupData, isIndividual, currentWeek]
  );

  useEffect(() => { setDayIndex((i) => { const idx = currentWeek.findIndex((w) => w.isToday); return idx >= 0 ? idx : i; }); }, [groupCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeDay = weekSchedule[dayIndex];
  const activeWeek = currentWeek[dayIndex];

  /* ---- individual (1:1) helpers ---- */
  const mySlots = useMemo(() => indiv.slots.filter((s) => s.user_id === userId), [indiv.slots, userId]);
  const nextWaiting = useMemo(
    () => indiv.slots.filter((s) => s.status === 'waiting').sort((a, b) => new Date(a.start_at) - new Date(b.start_at))[0] || null,
    [indiv.slots]
  );
  const activeIso = activeWeek ? isoDateOf(activeWeek.date) : '';
  const sessionDates = useMemo(() => new Set(indiv.slots.map((s) => isoDateOf(new Date(s.start_at)))), [indiv.slots]);
  const mySlotDates = useMemo(() => new Set(mySlots.map((s) => isoDateOf(new Date(s.start_at)))), [mySlots]);
  const mySlotToday = mySlots.find((s) => isoDateOf(new Date(s.start_at)) === activeIso) || null;
  const dayQueue = useMemo(
    () => indiv.slots.filter((s) => isoDateOf(new Date(s.start_at)) === activeIso).sort((a, b) => new Date(a.start_at) - new Date(b.start_at)),
    [indiv.slots, activeIso]
  );
  // Bring the student's own row into view inside the queue list ONLY. The old ref callback used
  // Element.scrollIntoView(), which also scrolls the whole page (and ran on every render), so My Group
  // opened scrolled down to the middle.
  const queueRef = useRef(null);
  useEffect(() => {
    const list = queueRef.current;
    if (list) scrollWithin(list, list.querySelector('.queue-row.is-you'));
  }, [dayQueue]);
  // What the hero shows: a lesson that is on right now, the next one, or nothing scheduled.
  const resolveHero = useCallback((nowMs) => {
    if (isIndividual) {
      const live = mySlots.find((s) => (s.status === 'waiting' || s.status === 'in_progress')
        && nowMs >= new Date(s.start_at).getTime() - 5 * 60000 && nowMs <= new Date(s.end_at).getTime());
      if (live) return { kind: 'live', start: new Date(live.start_at), end: new Date(live.end_at) };
      const nxt = mySlots.filter((s) => s.status === 'waiting' && new Date(s.start_at).getTime() > nowMs)
        .sort((a, b) => new Date(a.start_at) - new Date(b.start_at))[0];
      return nxt ? { kind: 'next', start: new Date(nxt.start_at), end: new Date(nxt.end_at) } : { kind: 'none' };
    }
    const days = groupData && groupData.scheduleDays;
    const live = getLiveClassNow(days, groupData && groupData.examDays);
    if (live) return { kind: 'live', start: live.start, end: live.end };
    const next = findNextClass(days, groupData && groupData.examDays);
    return next ? { kind: 'next', start: next.start } : { kind: 'none' };
  }, [isIndividual, mySlots, groupData]);

  const SLOT_STATUS = { waiting: 'Upcoming', in_progress: 'Live now', done: 'Done', no_show: 'No-show' };
  const SLOT_DOT = { waiting: 'var(--gold)', in_progress: '#6FCF97', done: 'var(--text-muted)', no_show: '#D98B78' };

  function openNoClass(title, info) { setNoClassTitle(title); setNoClassInfo(info); setNoClassOpen(true); }

  /** Dars Zoom'da yangi tabda ochiladi (sayt ichida emas). */
  function enterLesson() {
    const link = groupData && groupData.zoomLink;
    openSafe(link, 'https://zoom.us/');
  }

  /* KEYINCHALIK UCHUN — sayt ichida Zoom (hozircha o'chirilgan):
  function enterLesson() {
    const link = groupData && groupData.zoomLink;
    if (canEmbedZoom(link)) { setZoomOpen(true); return; }
    openSafe(link, 'https://zoom.us/');
  }
  */

  function handleJoinClass() {
    if (isIndividual) {
      const now = Date.now();
      const live = mySlots.find((s) => (s.status === 'waiting' || s.status === 'in_progress')
        && now >= new Date(s.start_at).getTime() - 5 * 60000 && now <= new Date(s.end_at).getTime());
      if (live) { enterLesson(); return; }
      const mine = mySlots.filter((s) => s.status === 'waiting' && new Date(s.start_at).getTime() > now)
        .sort((a, b) => new Date(a.start_at) - new Date(b.start_at))[0];
      let info;
      if (mine) {
        const d = new Date(mine.start_at);
        info = t('Your next slot is {day}, {date} at {time} (your local time).')
          .replace('{day}', DAY_NAME_BY_JS[d.getDay()])
          .replace('{date}', MONTH_NAMES[d.getMonth()] + ' ' + d.getDate())
          .replace('{time}', formatLocalTime(d));
      } else {
        info = t("Your teacher hasn't scheduled your slot yet.");
      }
      openNoClass(t('No session right now'), info);
      return;
    }
    const live = groupData && getLiveClassNow(groupData.scheduleDays, groupData.examDays);
    if (live) {
      enterLesson();
      return;
    }
    // Plain English in the original (never run through TT()) — kept as-is.
    const next = groupData && findNextClass(groupData.scheduleDays, groupData.examDays);
    openNoClass('', next
      ? `Your next class is ${next.day}, ${next.dateLabel} at ${next.time} (your local time).`
      : "There's no upcoming class scheduled for this group yet.");
  }

  async function handleJoined(code, data) {
    const alreadyMember = groups.some((g) => g.code === code);
    switchGroup(code, data); // joining adds a group (the student may be in several) and makes it the active one
    setJoinOpen(false);
    hideChat();
    // The RPC snapshot may lack group.type / slot settings — re-read the real row. Silent: a network blip here
    // must not wipe the group the student has just (successfully) joined.
    await refreshGroup(true);
    if (!alreadyMember) { setWelcomeName((data && data.name) || ''); setWelcomeOpen(true); }
  }

  async function handleLeave() { // the Manage dialog has already asked "are you sure?"
    try {
      // Only the CURRENT group — the student may belong to others.
      const { error } = await supabase.from('group_members').delete().eq('user_id', userId).eq('group_code', groupCode);
      if (error) throw error;
    } catch (err) {
      console.error('Guruhdan chiqishda xatolik:', err.message);
    }
    hideChat();
    await refreshGroup(true); // falls back to another group if there is one, else to "no group"
    setManageOpen(false);
    if (onNavigate) onNavigate('home');
  }

  if (!groupReady) return null;

  const isYouMember = (m) => ((userId && m.user_id) ? m.user_id === userId : m.name === myName);
  const memberList = members ? [...members].sort((a, b) => Number(isYouMember(b)) - Number(isYouMember(a))) : null;
  const q = memberQuery.trim().toLowerCase();
  const visibleMembers = memberList && q ? memberList.filter((m) => (m.name || '').toLowerCase().includes(q)) : memberList;

  const avatar = (name, url, extra) => (url
    ? <img src={url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
    : name.charAt(0).toUpperCase());
  const stripDays = currentWeek.map((w, i) => {
    let cls;
    if (isIndividual) {
      const iso = isoDateOf(w.date);
      const isMine = mySlotDates.has(iso);
      cls = ['group-week-day', sessionDates.has(iso) && 'has-class', (isMine || w.isToday) && 'is-today', i === dayIndex && 'active'];
    } else {
      const hasClass = !!(weekSchedule[i] && weekSchedule[i].time);
      cls = ['group-week-day', hasClass && 'has-class', w.isToday && 'is-today', i === dayIndex && 'active'];
    }
    return (
      <button type="button" key={w.day} role="tab" aria-selected={i === dayIndex} className={cls.filter(Boolean).join(' ')} onClick={() => setDayIndex(i)}>
        <span className="gwd-name">{t(w.day.slice(0, 3))}</span>
        <span className="gwd-num">{w.dateNum}</span>
        <span className="gwd-dot"></span>
      </button>
    );
  });

  // Main schedule card content: class time, or "My slot" for individual groups.
  let timeText, labelText, dotStyle, hint = null;
  if (isIndividual) {
    if (mySlotToday) {
      const slotMin = (groupData && groupData.slotMinutes) || 10;
      timeText = formatLocalTime(new Date(mySlotToday.start_at));
      labelText = t('Your slot · {min} min · your local time').replace('{min}', slotMin) + ' · ' + t(SLOT_STATUS[mySlotToday.status] || mySlotToday.status);
      dotStyle = { background: SLOT_DOT[mySlotToday.status] || 'var(--gold)' };
    } else {
      timeText = t('No slot'); labelText = t('No lesson scheduled'); dotStyle = { background: 'var(--text-muted)' };
    }
    if (nextWaiting && userId && nextWaiting.user_id === userId) hint = t('You are next, be ready');
  } else {
    timeText = (activeDay && activeDay.time) || (activeDay && activeDay.exam ? t('Exam') : t('No class'));
    labelText = activeDay && activeDay.exam && !activeDay.time ? t('Exam day: no lesson') : t(activeDay && activeDay.time ? 'Class time · your local time' : 'No lesson scheduled');
    dotStyle = undefined;
  }

  return (
    <section className={'group-page gp2' + (chatShown ? ' chat-mode' : '')} id="myGroupPage">
      <PageStyle css={myGroupCss} />
      <PageStyle css={chatBaseCss} />
      <div className="group-page-head" id="groupPageHead">
        <div><h1>{t('My Group')}</h1><p>{t('Your schedule, classmates and group chat.')}</p></div>
        {joined && (
          <div className="group-page-head-actions">
            <button type="button" className="group-page-chat-btn" id="groupChatToggleBtn" onPointerDown={ripple} onClick={showChat}>
              <svg className="gp-ico gp-ico-chat" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
                <circle className="gp-dot gp-dot-1" cx="8.5" cy="11.5" r="1" fill="currentColor" stroke="none" />
                <circle className="gp-dot gp-dot-2" cx="12" cy="11.5" r="1" fill="currentColor" stroke="none" />
                <circle className="gp-dot gp-dot-3" cx="15.5" cy="11.5" r="1" fill="currentColor" stroke="none" />
              </svg>
              <span className="gp-btn-label">{t('Chat')}</span>
              <span className="gc-unread-badge" id="groupChatUnreadBadge" style={{ display: chat.unreadCount > 0 ? 'flex' : 'none' }}>
                {chat.unreadCount > 99 ? '99+' : String(chat.unreadCount)}
              </span>
            </button>
            <button type="button" className="group-page-join" id="groupManageBtn" onPointerDown={ripple} onClick={() => setManageOpen(true)}>
              <svg className="gp-ico gp-ico-manage" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
                <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
                <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
                <line className="gp-knob gp-knob-1" x1="1" y1="14" x2="7" y2="14" />
                <line className="gp-knob gp-knob-2" x1="9" y1="8" x2="15" y2="8" />
                <line className="gp-knob gp-knob-3" x1="17" y1="16" x2="23" y2="16" />
              </svg>
              <span className="gp-btn-label">{t('Manage Group')}</span>
            </button>
          </div>
        )}
      </div>

      {!joined ? (
        <div className="panel" id="groupLockedPanel">
          <div className="inner-locked">
            {LOCK_ICON}
            <h3>{t("You haven't joined a group yet")}</h3>
            <p>{t('Enter the group code your teacher gave you to see your class schedule, lesson times and classmates.')}</p>
            <div style={{ margin: '20px auto 0', display: 'flex', justifyContent: 'center' }}>
              <button type="button" className="group-empty-join-btn" id="groupLockedJoinBtn" onClick={() => setJoinOpen(true)}>
                <span>{t('Join Group')}</span>
              </button>
            </div>
          </div>
        </div>
      ) : chatShown ? (
        <GroupChat
          chat={chat} groupCode={groupCode} groupName={groupData ? groupData.name : ''}
          memberCount={members ? members.length : null} myId={userId} myAvatarUrl={avatarUrl} onBack={hideChat}
        />
      ) : (
        <>
        <div className="group-page-grid" id="groupPageGrid">
          <div className="panel group-main-card">
            <LessonHorizon t={t} groupName={groupData ? groupData.name : ''} resolve={resolveHero} onKindChange={setHeroKind} />
            <div className="gp-body">
              <div className="group-week-strip" id="groupWeekStrip" role="tablist" aria-label={t('This week')} style={{ '--i': dayIndex }}>
                <span className="gwd-pill" aria-hidden="true" />
                {stripDays}
              </div>
              <div className="gp-day" key={dayIndex}>
                <div className="gp-day-text">
                  <div className="group-schedule-day" id="pageScheduleDay">
                    {activeWeek && `${t(activeWeek.day)}, ${t(activeWeek.dateLabel.split(' ')[0])} ${activeWeek.dateLabel.split(' ')[1]}`}
                  </div>
                  <div className="group-schedule-time" id="pageScheduleTime">{timeText}</div>
                  <div className="group-schedule-label" id="pageScheduleLabel">{labelText}</div>
                  <div className="slot-hint" id="pageSlotNextHint" style={{ display: hint ? 'block' : 'none' }}>{hint}</div>
                </div>
                <span className="group-schedule-dot" id="pageScheduleDot" style={dotStyle} aria-hidden="true"></span>
              </div>
              <button type="button" className={'group-join-btn' + (heroKind === 'live' ? ' is-live' : heroKind === 'none' ? ' is-idle' : '')} id="joinClassBtn" onClick={handleJoinClass}>
                {JOIN_ICON}<span id="joinClassBtnLabel">{t(isIndividual ? 'Join Zoom' : 'Join Class')}</span>
              </button>
            </div>
          </div>

          <div className="panel group-members-card">
            <div className="panel-head cm-head">
              <div className="cm-head-title">
                <h3 style={{ margin: 0 }} id="pageMembersTitle">{t(isIndividual ? 'Queue' : 'Classmates')}</h3>
                <span className="cm-count" id="pageMembersCount">{(members ? members.length : 0)} {t('students')}</span>
              </div>
              {!isIndividual && members && members.length > 6 && (
                <label className="cm-search">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                  <input type="text" value={memberQuery} onChange={(e) => setMemberQuery(e.target.value)} placeholder={t('Search classmates')} aria-label={t('Search classmates')} autoComplete="off" />
                  {memberQuery && (
                    <button type="button" className="cm-clear" aria-label={t('Clear search')} onClick={(e) => { e.preventDefault(); setMemberQuery(''); }}>
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                    </button>
                  )}
                </label>
              )}
            </div>
            {isIndividual ? (
              <div className="queue-list" id="pageGroupMembers" ref={queueRef}>
                {indiv.sessions.length === 0
                  ? (indiv.loaded ? <div className="classmate-empty">{t("The schedule hasn't been created yet.")}</div> : null)
                  : dayQueue.length === 0
                    ? <div className="classmate-empty">{t('No students scheduled for this day.')}</div>
                    : dayQueue.map((s) => {
                      const isYou = userId && s.user_id === userId;
                      return (
                        <div key={s.id} className={'queue-row' + (isYou ? ' is-you' : '') + (s.status === 'done' ? ' is-done' : '')} data-slot-id={s.id} aria-current={s.status === 'in_progress' ? 'true' : undefined}>
                          <span className={'queue-status-dot queue-status-' + s.status}></span>
                          <div className="classmate-avatar" style={{ width: '34px', height: '34px', fontSize: '13px', flexShrink: 0 }}>
                            {avatar(s.student_name, isYou ? avatarUrl : indiv.avatarsByUser[s.user_id])}
                          </div>
                          <div className="queue-row-name" style={{ minWidth: 0 }}>{s.student_name}{isYou && <span className="queue-row-tag">{t('You')}</span>}</div>
                          {s.status === 'in_progress'
                            ? <span className="queue-row-now">{t('Now')}</span>
                            : <span className="queue-row-time">{(s.status === 'done' || s.status === 'no_show') && <em className={'queue-row-state queue-row-state-' + s.status}>{t(SLOT_STATUS[s.status])}</em>}{formatLocalTime(new Date(s.start_at))}</span>}
                        </div>
                      );
                    })}
              </div>
            ) : (
              <div className="cm-list" id="pageGroupMembers" aria-busy={visibleMembers === null}>
                {visibleMembers === null ? [0, 1, 2, 3, 4, 5].map((n) => (
                  <div className="cm-row cm-skel" key={n} aria-hidden="true"><span className="cm-avatar" /><span className="cm-skel-line" style={{ width: (46 + ((n * 17) % 34)) + '%' }} /></div>
                )) : members.length === 0 ? (
                  <div className="classmate-empty cm-empty">
                    <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><path d="M17 5.5a3.2 3.2 0 010 6M18.5 14.4c1.8.7 3 2.5 3 5.6" /></svg>
                    <span>{t('No classmates have joined yet.')}</span>
                  </div>
                ) : visibleMembers.length === 0 ? (
                  <div className="classmate-empty cm-empty">
                    <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                    <span>{t('No matches found')}</span>
                    <button type="button" className="cm-empty-btn" onClick={() => setMemberQuery('')}>{t('Clear search')}</button>
                  </div>
                ) : visibleMembers.map((m, i) => {
                  const isYou = isYouMember(m);
                  const tint = gcSenderColor(m.user_id || m.name);
                  const url = isYou ? (avatarUrl || m.avatar_url) : m.avatar_url;
                  const name = m.name || '?';
                  const at = q ? name.toLowerCase().indexOf(q) : -1;
                  return (
                    <div key={m.user_id || m.name} className={'cm-row' + (isYou ? ' is-you' : '')} style={{ '--n': Math.min(i, 14) }}>
                      <div className="cm-avatar" style={!url && !isYou ? { background: gcHexToRgba(tint, 0.18), color: tint } : undefined}>
                        {avatar(name, url)}
                      </div>
                      <div className="cm-name" title={m.name}>
                        {at >= 0 ? <>{name.slice(0, at)}<mark>{name.slice(at, at + q.length)}</mark>{name.slice(at + q.length)}</> : name}
                      </div>
                      {isYou && <span className="cm-you">{t('You')}</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        </>
      )}

      <JoinGroupModal open={joinOpen} onClose={() => setJoinOpen(false)} onJoined={handleJoined} />
      <GroupManageModal open={manageOpen} onClose={() => setManageOpen(false)}
                        groupName={groupData ? groupData.name : ''} groupCode={joinCode} memberCount={members ? members.length : null}
                        onJoinAnother={() => { setManageOpen(false); setJoinOpen(true); }} onLeave={handleLeave} />
      <GroupWelcomeModal open={welcomeOpen} groupName={welcomeName || (groupData ? groupData.name : '')} onSee={() => setWelcomeOpen(false)} />
      <NoClassModal open={noClassOpen} onClose={() => setNoClassOpen(false)} nextInfo={noClassInfo} title={noClassTitle} />
      {/* KEYINCHALIK UCHUN — sayt ichida Zoom (hozircha o'chirilgan):
      {zoomOpen && (
        <Suspense fallback={null}>
          <ZoomRoom groupName={groupData ? groupData.name : ''} fallbackUrl={groupData && groupData.zoomLink} onClose={() => setZoomOpen(false)} />
        </Suspense>
      )}
      */}
    </section>
  );
}
