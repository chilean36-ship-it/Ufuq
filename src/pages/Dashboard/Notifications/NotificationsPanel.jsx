import { useEffect, useState } from 'react';
import { useCabinetI18n } from '../../../context/CabinetI18nContext';

import { fmtDate, currentLang } from '../../../lib/dateLocale';
// Icon bodies per notification kind (static markup, copied from NOTIF_ICONS in dashboard.html).
const NOTIF_ICONS = {
  group: '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>',
  task: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>',
  exam: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M9 15l2 2 4-4"/>',
  lesson: '<path d="M3 18v-6a9 9 0 0118 0v6"/><path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z"/>',
  schedule: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  system: '<path d="M12 2l9 4.9v10.2L12 22l-9-4.9V6.9z"/><path d="M12 8v4l3 2"/>',
};

/** Port of timeAgo(). */
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

/** Bell dropdown — port of #notifPanel / #notifScrim + renderNotifList(). Open state is owned by the Dashboard. */
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

  const all = items.slice().sort((a, b) => b.time - a.time);
  const list = filter === 'unread' ? all.filter((n) => !n.read) : all;

  return (
    <>
      <div className="notif-scrim" id="notifScrim" style={{ display: open ? 'block' : 'none' }} onClick={onClose} />
      <div className={'notif-panel' + (open ? ' open' : '')} id="notifPanel" aria-hidden={open ? 'false' : 'true'}>
        <div className="notif-panel-head">
          <h3>{t('Notifications')}</h3>
          <button type="button" className="notif-mark-read" id="notifMarkAllRead" onClick={onMarkAll}>{t('Mark all as read')}</button>
        </div>
        <div className="notif-filter-row">
          <button type="button" className={'notif-filter-btn' + (filter === 'all' ? ' active' : '')} onClick={() => setFilter('all')}>{t('All')}</button>
          <button type="button" className={'notif-filter-btn' + (filter === 'unread' ? ' active' : '')} onClick={() => setFilter('unread')}>{t('Unread')}</button>
        </div>
        <div className="notif-list" id="notifList">
          {list.length === 0 ? (
            <div className="notif-empty">
              {filter === 'unread' ? t('No unread notifications.') : t("You're all caught up — no notifications yet.")}
            </div>
          ) : list.map((n) => (
            <div className={'notif-item' + (n.read ? '' : ' unread')} data-id={n.id} key={n.id} onClick={() => { onMarkRead(n.id); const v = n.link && LINK_VIEWS[n.link]; if (v && onNavigate) { onNavigate(v); onClose(); } }} style={n.link && LINK_VIEWS[n.link] ? { cursor: 'pointer' } : undefined}>
              <div className="notif-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                     dangerouslySetInnerHTML={{ __html: NOTIF_ICONS[n.type] || NOTIF_ICONS.system }} />
              </div>
              <div className="notif-body">
                <div className="notif-title">{t(n.title)}</div>
                <div className="notif-text">{t(n.text)}</div>
                <div className="notif-time">{timeAgo(n.time, t)}</div>
              </div>
              {n.read ? null : <div className="notif-dot" />}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
