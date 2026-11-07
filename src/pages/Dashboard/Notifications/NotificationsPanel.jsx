import { useEffect, useMemo, useState } from 'react';
import { useCabinetI18n } from '../../../context/CabinetI18nContext';
import PageStyle from '../../../components/PageStyle';
import css from './notifications.css?inline';

import { fmtDate, currentLang } from '../../../lib/dateLocale';

/* The database triggers (notify_group_on_new_member / _lesson / _task) write these titles in Uzbek. Recognise them and
   show them in the cabinet language; anything else goes through t() as before. */
const SERVER_TITLES = [
  [/^(.+) guruhga qo['‘’]shildi$/, '{name} joined the group', 'name'],
  [/^Yangi video dars: (.+)$/, 'New video lesson: {title}', 'title'],
  [/^Yangi vazifa: (.+)$/, 'New task: {title}', 'title'],
];
function localizeTitle(title, t) {
  const s = String(title || '');
  for (const [re, key, slot] of SERVER_TITLES) {
    const m = s.match(re);
    if (m) {
      const val = slot === 'name' && m[1] === 'Yangi talaba' ? t('New student') : m[1];
      return t(key).replace('{' + slot + '}', val);
    }
  }
  return t(s);
}
// Icon bodies per notification kind (static markup from this file only — never user content).
const NOTIF_ICONS = {
  group: '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>',
  task: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>',
  exam: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M9 15l2 2 4-4"/>',
  lesson: '<path d="M3 18v-6a9 9 0 0118 0v6"/><path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z"/>',
  schedule: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  system: '<path d="M12 2l9 4.9v10.2L12 22l-9-4.9V6.9z"/><path d="M12 8v4l3 2"/>',
};
const TYPES = Object.keys(NOTIF_ICONS);

/** "5 min ago" / "3 h ago" / "2 d ago" / a date */
function timeAgo(ts, t) {
  const diff = Math.max(0, Date.now() - ts);
  const min = Math.floor(diff / 60000);
  if (min < 1) return t('Just now');
  if (min < 60) return min + ' ' + t('min ago');
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + ' ' + t('h ago');
  const day = Math.floor(hr / 24);
  if (day < 7) return day + ' ' + t('d ago');
  return fmtDate(ts, currentLang());
}

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };

const BELL = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9a6 6 0 0112 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z" /><path d="M10 20a2 2 0 004 0" /></svg>;
const CHECKS = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12.5l5 5L16 8" /><path d="M10 16.5l1.5 1.5L22 7.5" /></svg>;
const CLOSE = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>;
const COG = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z" /></svg>;
const CHEV = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>;

/** Bell dropdown: grouped by day, coloured by type, unread first-class. Open state is owned by the Dashboard. */
const LINK_VIEWS = { dashboard: 'home', home: 'home', myGroup: 'myGroup', tasks: 'tasks', exam: 'exam', library: 'library', progress: 'progress', attendance: 'attendance' };

export default function NotificationsPanel({ open, onClose, items, onMarkRead, onMarkAll, onNavigate }) {
  const { t } = useCabinetI18n();
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const all = useMemo(() => items.slice().sort((a, b) => b.time - a.time), [items]);
  const unreadCount = all.filter((n) => !n.read).length;
  const list = filter === 'unread' ? all.filter((n) => !n.read) : all;

  // Today / Yesterday / Earlier
  const groups = useMemo(() => {
    const today = startOfDay(Date.now()); const yday = today - 86400000;
    const out = [['today', t('Today'), []], ['yesterday', t('Yesterday'), []], ['earlier', t('Earlier'), []]];
    list.forEach((n) => { (n.time >= today ? out[0] : n.time >= yday ? out[1] : out[2])[2].push(n); });
    return out.filter((g) => g[2].length);
  }, [list, t]);

  const go = (n) => {
    onMarkRead(n.id);
    const v = n.link && LINK_VIEWS[n.link];
    if (v && onNavigate) { onNavigate(v); onClose(); }
  };

  return (
    <>
      <PageStyle css={css} />
      <div className="notif-scrim" id="notifScrim" style={{ display: open ? 'block' : 'none' }} onClick={onClose} />
      <div className={'notif-panel nf' + (open ? ' open' : '')} id="notifPanel" role="dialog" aria-label={t('Notifications')} aria-hidden={open ? 'false' : 'true'}>
        <div className="nf-head">
          <div className="nf-title">
            <h3>{t('Notifications')}</h3>
            {unreadCount > 0 && <span className="nf-count" aria-label={unreadCount + ' ' + t('Unread')}>{unreadCount}</span>}
          </div>
          <div className="nf-head-act">
            <button type="button" className="nf-ghost" id="notifMarkAllRead" onClick={onMarkAll} disabled={unreadCount === 0} title={t('Mark all as read')}>{CHECKS}<span>{t('Mark all as read')}</span></button>
            <button type="button" className="nf-x" onClick={onClose} aria-label={t('Close')}>{CLOSE}</button>
          </div>
        </div>
        <div className="nf-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={filter === 'all'} className={'nf-tab' + (filter === 'all' ? ' on' : '')} onClick={() => setFilter('all')}>{t('All')}<i>{all.length}</i></button>
          <button type="button" role="tab" aria-selected={filter === 'unread'} className={'nf-tab' + (filter === 'unread' ? ' on' : '')} onClick={() => setFilter('unread')}>{t('Unread')}<i>{unreadCount}</i></button>
        </div>
        <div className="nf-list" id="notifList">
          {groups.length === 0 ? (
            <div className="nf-empty">
              <span className="nf-empty-ico">{BELL}</span>
              <b>{filter === 'unread' ? t('No unread notifications.') : t("You're all caught up — no notifications yet.")}</b>
              <span>{t('New lessons, tasks and exam results will appear here.')}</span>
            </div>
          ) : groups.map(([key, label, rows]) => (
            <section className="nf-group" key={key}>
              <h4>{label}</h4>
              {rows.map((n) => {
                const type = TYPES.includes(n.type) ? n.type : 'system';
                const clickable = !!(n.link && LINK_VIEWS[n.link]);
                return (
                  <button type="button" className={'nf-item t-' + type + (n.read ? '' : ' unread')} data-id={n.id} key={n.id} onClick={() => go(n)}>
                    <span className="nf-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: NOTIF_ICONS[type] }} /></span>
                    <span className="nf-body">
                      <span className="nf-t">{localizeTitle(n.title, t)}</span>
                      <span className="nf-x2">{t(n.text)}</span>
                      <span className="nf-time">{timeAgo(n.time, t)}</span>
                    </span>
                    {!n.read && <span className="nf-dot" aria-label={t('Unread')} />}
                    {clickable && <span className="nf-chev">{CHEV}</span>}
                  </button>
                );
              })}
            </section>
          ))}
        </div>
        <div className="nf-foot">
          <button type="button" className="nf-ghost" onClick={() => { if (onNavigate) { onNavigate('settings'); onClose(); } }}>{COG}<span>{t('Notification settings')}</span></button>
        </div>
      </div>
    </>
  );
}
