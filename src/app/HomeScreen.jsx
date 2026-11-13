import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDashboardData, LEVEL_NAMES, getTasksForGroup, getTaskSubmissions } from '../context/DashboardDataContext';
import { useCabinetI18n } from '../context/CabinetI18nContext';
import { useNotifications } from '../pages/Dashboard/Notifications/useNotifications';
import NotificationsPanel from '../pages/Dashboard/Notifications/NotificationsPanel';
import useLiveRefresh from '../hooks/useLiveRefresh';
import { findNextClass, getLiveClassNow, isOverdue, fmtDueDate } from '../pages/Dashboard/weekUtils';
import { useApp, readPrefs } from './AppContext';
import { Ico } from './ui';

const LOCALE = { UZ: 'uz', RU: 'ru', AR: 'ar', EN: 'en' };
const QUICK = [
  { id: 'library', icon: 'lib', label: 'q_library' },
  { id: 'tasks', icon: 'task', label: 'q_tasks' },
  { id: 'exam', icon: 'exam', label: 'q_exam' },
  { id: 'progress', icon: 'chart', label: 'q_progress' },
  { id: 'attendance', icon: 'cal', label: 'q_attendance' },
  { id: 'certificates', icon: 'cert', label: 'q_certs' },
];

function dayLabel(date, lang, t) {
  const now = new Date();
  const d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const d1 = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diff = Math.round((d1 - d0) / 86400000);
  if (diff === 0) return t('today');
  if (diff === 1) return t('tomorrow');
  try { return new Intl.DateTimeFormat(LOCALE[lang] || 'en', { weekday: 'long', day: 'numeric', month: 'short' }).format(date); } catch (e) { return ''; }
}

function untilText(start, t) {
  const mins = Math.max(0, Math.round((start.getTime() - Date.now()) / 60000));
  if (mins >= 24 * 60) return '';
  const h = Math.floor(mins / 60); const m = mins % 60;
  return `${t('startsIn')} ${h ? h + ' ' + t('hrs') + ' ' : ''}${m} ${t('min')}`;
}

/** Native Home: greeting, level, next lesson, homework and quick access. All data is the same live data as the website. */
export default function HomeScreen({ onNavigate, onUpgrade }) {
  const { t, lang } = useApp();
  const { t: tc } = useCabinetI18n();
  const { user, name, level, avatarUrl, groupCode, groupData, groupReady, locked, isPaid } = useDashboardData();
  const [, setTick] = useState(0);
  const [tasks, setTasks] = useState(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifs = useNotifications(user && user.id, isPaid);
  const prefs = readPrefs();

  useEffect(() => { const id = setInterval(() => setTick((n) => n + 1), 30000); return () => clearInterval(id); }, []);

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

  const live = joined && groupData ? getLiveClassNow(groupData.scheduleDays) : null;
  const next = useMemo(() => (joined && groupData ? findNextClass(groupData.scheduleDays) : null), [joined, groupData, Math.floor(Date.now() / 60000)]); // eslint-disable-line react-hooks/exhaustive-deps

  const pending = (tasks || []).filter((x) => !x.done).sort((a, b) => new Date(a.due) - new Date(b.due));
  const overdueN = pending.filter((x) => x.overdue).length;
  const first = ((name || '').trim().split(/\s+/)[0]) || '';
  const noGroup = groupReady && !groupCode;

  return (
    <div className="ua-page ua-home">
      <header className="ua-home-top">
        <button type="button" className="ua-avatar" onClick={() => onNavigate('profile')} aria-label={t('profile')}>
          {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{(first || '?').charAt(0).toUpperCase()}</span>}
        </button>
        <div className="ua-home-hi">
          <p className="ua-hello">{t('hello')}{first ? ',' : ''} <b>{first}</b></p>
          <p className="ua-hint">{t('homeSub')}</p>
        </div>
        {isPaid && (
          <button type="button" className="ua-icon-btn ua-bell" onClick={() => { setNotifOpen(true); notifs.refresh(); }} aria-label="Notifications">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" /></svg>
            {notifs.unread > 0 && <i className="ua-dot">{notifs.unread > 9 ? '9+' : notifs.unread}</i>}
          </button>
        )}
      </header>

      <section className="ua-card ua-level">
        <div className="ua-level-row">
          <div><p className="ua-k">{t('level')}</p><p className="ua-level-n">{level} <small>{t('ofLevels')}</small></p></div>
          <span className="ua-chip">{tc(LEVEL_NAMES[level - 1]) || LEVEL_NAMES[level - 1]}</span>
        </div>
        <div className="ua-meter"><i style={{ width: Math.min(100, (level / LEVEL_NAMES.length) * 100) + '%' }} /></div>
        {prefs.goal ? <p className="ua-k small">{t('yourGoal')}: {t('goal_' + prefs.goal)} / {t('perDay')}</p> : null}
      </section>

      {noGroup && (
        <section className="ua-card ua-cta">
          <h3>{t('noGroupTitle')}</h3><p>{t('noGroupSub')}</p>
          <div className="ua-cta-row">
            <button type="button" className="ua-btn ua-btn-primary" onClick={() => onNavigate('billing')}>{t('seePlans')}</button>
            <button type="button" className="ua-btn ua-btn-ghost" onClick={() => onNavigate('myGroup')}>{t('tabGroup')}</button>
          </div>
        </section>
      )}
      {!noGroup && locked && (
        <section className="ua-card ua-cta">
          <h3>{t('lockedTitle')}</h3><p>{t('lockedSub')}</p>
          <div className="ua-cta-row"><button type="button" className="ua-btn ua-btn-primary" onClick={onUpgrade}>{t('seePlans')}</button></div>
        </section>
      )}

      {joined && (
        <section className={'ua-card ua-lesson' + (live ? ' live' : '')}>
          <p className="ua-k">{live ? <><i className="ua-pulse" /> {t('liveNow')}</> : t('nextLesson')}</p>
          {live ? (
            <><h3>{groupData.name}</h3><button type="button" className="ua-btn ua-btn-primary" onClick={() => onNavigate('myGroup')}><Ico n="video" size={20} /> {t('joinLesson')}</button></>
          ) : next ? (
            <>
              <h3>{dayLabel(next.start, lang, t)} · {next.time}</h3>
              <p className="ua-hint">{groupData.name}{untilText(next.start, t) ? ' · ' + untilText(next.start, t) : ''}</p>
              <button type="button" className="ua-btn ua-btn-soft" onClick={() => onNavigate('myGroup')}>{t('tabGroup')}</button>
            </>
          ) : <h3 className="muted">{t('noSchedule')}</h3>}
        </section>
      )}

      {joined && (
        <section className="ua-card">
          <div className="ua-card-head">
            <h3>{t('homework')}</h3>
            {tasks && pending.length > 0 && <span className={'ua-chip' + (overdueN ? ' warn' : '')}>{pending.length} {t('hwPending')}{overdueN ? ` · ${overdueN} ${t('hwOverdue')}` : ''}</span>}
          </div>
          {tasks === null ? <div className="ua-skel" /> : pending.length === 0 ? <p className="ua-hint">{t('hwNone')}</p> : (
            <ul className="ua-tasks">
              {pending.slice(0, 3).map((x) => (
                <li key={x.id} className={x.overdue ? 'od' : ''}><span className="ua-tdot" /><span className="ua-tt">{x.title}</span><span className="ua-td">{fmtDueDate(x.due)}</span></li>
              ))}
            </ul>
          )}
          <button type="button" className="ua-link" onClick={() => onNavigate('tasks')}>{t('openTasks')} <Ico n="chev" size={16} /></button>
        </section>
      )}

      <h4 className="ua-section">{t('quick')}</h4>
      <div className="ua-grid">
        {QUICK.map((q) => (
          <button type="button" key={q.id} className="ua-tile" onClick={() => onNavigate(q.id)}>
            <span className="ua-tile-ic"><Ico n={q.icon} size={24} /></span><span>{t(q.label)}</span>
          </button>
        ))}
      </div>

      {isPaid && <NotificationsPanel open={notifOpen} onClose={() => setNotifOpen(false)} items={notifs.items} onMarkRead={notifs.markRead} onMarkAll={notifs.markAllRead} onNavigate={(v) => { setNotifOpen(false); onNavigate(v); }} />}
    </div>
  );
}
