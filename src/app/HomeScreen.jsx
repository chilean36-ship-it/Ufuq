import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { markFromApp } from '../components/BackToApp';
import { useDashboardData, LEVEL_NAMES, getTasksForGroup, getTaskSubmissions } from '../context/DashboardDataContext';
import { useCabinetI18n } from '../context/CabinetI18nContext';
import { useNotifications } from '../pages/Dashboard/Notifications/useNotifications';
import NotificationsPanel from '../pages/Dashboard/Notifications/NotificationsPanel';
import useLiveRefresh from '../hooks/useLiveRefresh';
import { findNextClass, getLiveClassNow, isOverdue, fmtDueDate, getCurrentWeekDates, scheduleDaysToWeekArray } from '../pages/Dashboard/weekUtils';
import { useApp } from './AppContext';
import { haptic, readRecents, useCountUp, usePullRefresh, useToast } from './hooks';
import Sheet from './Sheet';
import { Ico, Logo, Ring } from './ui';
import { GroupPill } from './AppUi';

const LOCALE = { UZ: 'uz', RU: 'ru', AR: 'ar', EN: 'en' };
const TILES = [
  { id: 'library', icon: 'lib', label: 'q_library', tone: 'amber' },
  { id: 'tasks', icon: 'task', label: 'q_tasks', tone: 'emerald' },
  { id: 'exam', icon: 'exam', label: 'q_exam', tone: 'violet' },
  { id: 'progress', icon: 'chart', label: 'q_progress', tone: 'sky' },
  { id: 'attendance', icon: 'cal', label: 'q_attendance', tone: 'rose' },
  { id: 'certificates', icon: 'cert', label: 'q_certs', tone: 'amber' },
  { id: 'myGroup', icon: 'group', label: 'tabGroup', tone: 'sky' },
  { id: 'billing', icon: 'card', label: 'billing', tone: 'emerald' },
];
const META = Object.fromEntries(TILES.map((x) => [x.id, x]));
META.hifzLive = { id: 'hifzLive', icon: 'book', label: 'q_hifz', tone: 'violet' };

const DESC = { library: 'd_library', tasks: 'd_tasks', exam: 'd_exam', progress: 'd_progress', attendance: 'd_attendance', certificates: 'd_certs', hifzLive: 'd_hifz' };
export const desc = (id, t) => (DESC[id] ? t(DESC[id]) : '');

function useNow(ms = 1000) {
  const [n, setN] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setN(Date.now()), ms); return () => clearInterval(id); }, [ms]);
  return n;
}
const pad = (n) => String(n).padStart(2, '0');
function clock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60);
  return (h ? pad(h) + ':' : '') + pad(m) + ':' + pad(s % 60);
}

/** Native Home: stories-style hero carousel, week strip, shelves and category tiles. */
export default function HomeScreen({ onNavigate, onUpgrade, activity }) {
  const { t, lang, t: ta } = useApp();
  const toast = useToast();
  const { t: tc } = useCabinetI18n();
  const { user, name, level, avatarUrl, groupCode, groupData, groupReady, locked, lockReason, isPaid, refreshGroup, role } = useDashboardData();
  const now = useNow(1000);
  const [tasks, setTasks] = useState(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [slide, setSlide] = useState(0);
  const [day, setDay] = useState(null);
  const track = useRef(null);
  const notifs = useNotifications(user && user.id, isPaid);

  const joined = !!groupCode && !locked;
  const userId = user && user.id;
  const load = useCallback(async () => {
    if (!groupReady) return;
    if (!joined) { setTasks([]); return; }
    try {
      const [rows, subs] = await Promise.all([getTasksForGroup(groupCode), getTaskSubmissions(userId)]);
      setTasks(rows.map((r) => ({ ...r, done: !!subs[r.id], overdue: !subs[r.id] && isOverdue(r.due) })));
    } catch (e) { setTasks([]); }
  }, [groupReady, joined, groupCode, userId]);
  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load, [{ table: 'tasks', filter: groupCode ? 'group_code=eq.' + groupCode : undefined }, { table: 'task_submissions', filter: userId ? 'user_id=eq.' + userId : undefined }], { enabled: joined && !!userId });

  const { pull, busy } = usePullRefresh(async () => { await Promise.all([refreshGroup(true), load()]); toast(t('refreshed')); });

  const live = joined && groupData ? getLiveClassNow(groupData.scheduleDays) : null;
  const next = useMemo(() => (joined && groupData ? findNextClass(groupData.scheduleDays) : null), [joined, groupData, Math.floor(now / 60000)]); // eslint-disable-line react-hooks/exhaustive-deps
  const weekClasses = useMemo(() => {
    if (!joined || !groupData) return {};
    const wk = getCurrentWeekDates();
    const out = {};
    scheduleDaysToWeekArray(groupData.scheduleDays, wk).forEach((e) => { if (e.time) out[e.day] = e.time; });
    return out;
  }, [joined, groupData]);

  const pending = (tasks || []).filter((x) => !x.done).sort((a, b) => new Date(a.due) - new Date(b.due));
  const overdueN = pending.filter((x) => x.overdue).length;
  const first = ((name || '').trim().split(/\s+/)[0]) || '';
  const noGroup = groupReady && !groupCode;
  const minToday = Math.floor(activity.todaySec / 60);
  const countMin = useCountUp(minToday);
  const levelN = useCountUp(level, 600);

  const onScroll = (e) => { const el = e.currentTarget; setSlide(Math.round(el.scrollLeft / (el.firstChild ? el.firstChild.offsetWidth + 12 : 1))); };
  const goSlide = (i) => { const el = track.current; if (el && el.children[i]) { el.scrollTo({ left: el.children[i].offsetLeft - el.offsetLeft - 16, behavior: 'smooth' }); haptic(6); } };

  const recents = readRecents().filter((v) => META[v]).slice(0, 5);
  const shelfRecents = recents.length ? recents : ['library', 'tasks', 'exam'];
  const dayNames = useMemo(() => {
    const f = new Intl.DateTimeFormat(LOCALE[lang] || 'en', { weekday: 'short' });
    return activity.week.map((d) => f.format(d.date));
  }, [activity.week, lang]);

  return (
    <div className="ua-page ua-home2">
      <div className={'ua-ptr' + (busy ? ' busy' : '')} style={{ height: busy ? 44 : pull * 54, opacity: busy ? 1 : pull }} aria-hidden="true"><span className="ua-spin" style={{ transform: busy ? undefined : `rotate(${pull * 300}deg)` }} /></div>

      <div className="ua-brandrow" style={{ '--i': 0 }}>
        <span className="ua-brand"><Logo size={30} /><b>Ufuq</b></span>
        <span className="ua-brand-act">
          <button type="button" className={'ua-chip2 flame' + (activity.streak > 0 ? ' on' : '')} onClick={() => { haptic(); toast(`${t('streak')}: ${activity.streak} ${t(activity.streak === 1 ? 'dayWord' : 'daysWord')}`); }} aria-label={t('streak')}>
            <Ico n="flame" size={18} fill={activity.streak > 0} sw={1.6} /><b>{activity.streak}</b>
          </button>
          {isPaid && (
            <button type="button" className="ua-icon-btn ua-bell" onClick={() => { setNotifOpen(true); notifs.refresh(); }} aria-label="Notifications">
              <Ico n="bell" size={22} />{notifs.unread > 0 && <i className="ua-dot">{notifs.unread > 9 ? '9+' : notifs.unread}</i>}
            </button>
          )}
        </span>
      </div>
      <header className="ua-top2" style={{ '--i': 0 }}>
        <button type="button" className="ua-avatar" onClick={() => { haptic(); onNavigate('me'); }} aria-label={t('tabMe')}>
          {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{(first || '?').charAt(0).toUpperCase()}</span>}
        </button>
        <div className="ua-top2-t"><p className="ua-hint">{t('hello2')}</p><h1>{first || t('tabMe')}</h1></div>
      </header>

      <div className="ua-gwrap" style={{ '--i': 1 }}><GroupPill /></div>
      {(role === 'admin' || role === 'teacher') && (
        <a className="ua-staffbar" style={{ '--i': 1 }} href={role === 'admin' ? '/app/admin' : '/app/teacher'} onClick={markFromApp}><Ico n="settings" size={18} /><span>{role === 'admin' ? ta('adminPanel') : ta('teacherPanel')}</span><Ico n="chev" size={16} /></a>
      )}

      {/* hero carousel */}
      <section className="ua-hero" style={{ '--i': 1 }}>
        <div className="ua-hero-track" ref={track} onScroll={onScroll}>
          <article className={'ua-hcard lesson' + (live ? ' live' : '')} onClick={() => onNavigate('myGroup')}>
            <span className="ua-hcard-bg" aria-hidden="true" />
            {noGroup ? (
              <>
                <p className="ua-k light">{t('tabGroup')}</p><h3>{t('noGroupTitle')}</h3>
                <button type="button" className="ua-pill" onClick={(e) => { e.stopPropagation(); onNavigate('billing'); }}>{t('seePlans')}</button>
              </>
            ) : locked && lockReason === 'attendance' ? (
              <>
                <p className="ua-k light">{tc('Attendance limit reached')}</p><h3>{tc('Talk to your teacher or the administrator to open it again.')}</h3>
                <button type="button" className="ua-pill" onClick={(e) => { e.stopPropagation(); onNavigate('attendance'); }}>{tc('See my attendance')}</button>
              </>
            ) : locked ? (
              <>
                <p className="ua-k light">{t('lockedTitle')}</p><h3>{t('lockedSub')}</h3>
                <button type="button" className="ua-pill" onClick={(e) => { e.stopPropagation(); onUpgrade(); }}>{t('seePlans')}</button>
              </>
            ) : live ? (
              <>
                <p className="ua-k light"><i className="ua-pulse" /> {t('liveNow')}</p>
                <h3>{groupData.name}</h3>
                <button type="button" className="ua-pill"><Ico n="video" size={18} /> {t('joinLesson')}</button>
              </>
            ) : next ? (
              <>
                <p className="ua-k light">{t('nextLesson')}</p>
                <div className="ua-count">{clock(next.start.getTime() - now)}</div>
                <p className="ua-hcard-s">{new Intl.DateTimeFormat(LOCALE[lang] || 'en', { weekday: 'long' }).format(next.start)} · {next.time} · {groupData.name}</p>
              </>
            ) : (
              <><p className="ua-k light">{t('nextLesson')}</p><h3>{t('noSchedule')}</h3></>
            )}
          </article>

          <article className={'ua-hcard goal' + (activity.reached ? ' done' : '')} onClick={() => onNavigate('me')}>
            <span className="ua-hcard-bg" aria-hidden="true" />
            <div className="ua-goal-row">
              <Ring value={activity.ratio} size={104} stroke={10}><b className="ua-ring-n">{countMin}</b><small>{t('minShort')}</small></Ring>
              <div>
                <p className="ua-k light">{t('goalToday')}</p>
                <h3>{activity.reached ? t('goalDone') : `${Math.max(1, Math.ceil((activity.goalSec - activity.todaySec) / 60))} ${t('minShort')} ${t('goalLeft')}`}</h3>
                <p className="ua-hcard-s">{countMin} {t('ofGoal')} {activity.goalMin} {t('minShort')}</p>
              </div>
            </div>
          </article>

          <article className="ua-hcard level" onClick={() => onNavigate('progress')}>
            <span className="ua-hcard-bg" aria-hidden="true" />
            <p className="ua-k light">{t('level')}</p>
            <div className="ua-level-big"><b>{levelN}</b><span>{t('ofLevels')}</span></div>
            <p className="ua-hcard-s">{tc(LEVEL_NAMES[level - 1]) || LEVEL_NAMES[level - 1]}</p>
            <div className="ua-meter light"><i style={{ width: (level / LEVEL_NAMES.length) * 100 + '%' }} /></div>
          </article>
        </div>
        <div className="ua-dots" role="tablist">{[0, 1, 2].map((i) => <button key={i} type="button" className={slide === i ? 'on' : ''} aria-label={String(i + 1)} onClick={() => goSlide(i)} />)}</div>
      </section>

      {/* week strip */}
      <section className="ua-card2" style={{ '--i': 2 }}>
        <div className="ua-card2-h"><h3>{t('weekTitle')}</h3><span className="ua-hint">{activity.week.filter((d) => d.sec >= 60).length}/7</span></div>
        <div className="ua-week">
          {activity.week.map((d, i) => {
            const engName = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][i];
            const hasClass = !!weekClasses[engName];
            return (
              <button type="button" key={i} className={'ua-wd' + (d.isToday ? ' today' : '') + (d.future ? ' future' : '')} onClick={() => { haptic(); setDay({ i, name: engName, d, time: weekClasses[engName] }); }}>
                <span className="ua-wd-n">{dayNames[i]}</span>
                {d.sec >= activity.goalSec
                  ? <span className="ua-wd-done"><Ico n="check" size={18} sw={3} /></span>
                  : <Ring value={d.sec / activity.goalSec} size={40} stroke={4}><small>{d.date.getDate()}</small></Ring>}
                <i className={'ua-wd-dot' + (hasClass ? ' on' : '')} />
              </button>
            );
          })}
        </div>
      </section>

      {/* homework shelf */}
      {joined && (
        <section style={{ '--i': 4 }}>
          <div className="ua-sh-h"><h3>{t('hwShelf')}</h3>{pending.length > 0 && <span className={'ua-chip' + (overdueN ? ' warn' : '')}>{pending.length} {t('hwPending')}</span>}</div>
          {tasks === null ? <div className="ua-skel" /> : pending.length === 0 ? (
            <div className="ua-empty"><Ico n="check" size={22} sw={2.4} /><span>{t('hwAllDone')}</span></div>
          ) : (
            <div className="ua-shelf">
              {pending.slice(0, 8).map((x) => (
                <button type="button" key={x.id} className={'ua-hw' + (x.overdue ? ' od' : '')} onClick={() => onNavigate('tasks')}>
                  <span className="ua-hw-d">{x.overdue ? t('hwOverdue') : t('hwDue')} · {fmtDueDate(x.due)}</span>
                  <b>{x.title}</b>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* categories */}
      <section style={{ '--i': 5 }}>
        <div className="ua-sh-h"><h3>{t('quick')}</h3></div>
        <div className="ua-tiles">
          {TILES.map((x) => (
            <button type="button" key={x.id} className={'ua-tile2 ' + x.tone} onClick={() => { haptic(); onNavigate(x.id); }}>
              <span className="ua-tile2-ic"><Ico n={x.icon} size={26} /></span><span>{t(x.label)}</span>
            </button>
          ))}
        </div>
      </section>

      {/* AI banner */}
      <button type="button" className="ua-ai-banner" style={{ '--i': 6 }} onClick={() => window.dispatchEvent(new Event('ufuq-ai-open'))}>
        <span className="ua-ai-banner-t"><b>{t('aiPromoT')}</b><small>{t('aiPromoS')}</small><span className="ua-pill dark">{t('askAi')}</span></span>
        <span className="ua-ai-banner-ic"><Ico n="ai" size={44} sw={1.4} /></span>
      </button>

      <Sheet open={!!day} onClose={() => setDay(null)} title={day ? new Intl.DateTimeFormat(LOCALE[lang] || 'en', { weekday: 'long', day: 'numeric', month: 'long' }).format(day.d.date) : ''}>
        {day && (
          <div className="ua-daysheet">
            <div className="ua-ds-row"><span className="ua-row-ic"><Ico n="video" size={20} /></span><div><b>{day.time ? `${t('classAt')} ${day.time}` : t('noClass')}</b>{day.time && groupData && <small>{groupData.name}</small>}</div></div>
            <div className="ua-ds-row"><span className="ua-row-ic"><Ico n="clock" size={20} /></span><div><b>{Math.floor(day.d.sec / 60)} {t('minShort')}</b><small>{t('activityToday')}</small></div></div>
          </div>
        )}
      </Sheet>

      {isPaid && <NotificationsPanel open={notifOpen} onClose={() => setNotifOpen(false)} items={notifs.items} onMarkRead={notifs.markRead} onMarkAll={notifs.markAllRead} onNavigate={(v) => { setNotifOpen(false); onNavigate(v); }} />}
    </div>
  );
}
