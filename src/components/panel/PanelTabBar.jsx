import { useEffect, useState } from 'react';
import { useCabinetI18n } from '../../context/CabinetI18nContext';
import './panel-tabbar.css';

const s = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
const ICON = {
  overview: <svg {...s}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>,
  groups: <svg {...s}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></svg>,
  students: <svg {...s}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
  announcements: <svg {...s}><path d="M3 11l18-5v12L3 14v-3z" /><path d="M11.6 16.8a2 2 0 01-3.6 1.2" /></svg>,
  attendance: <svg {...s}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18M9 16l2 2 4-4" /></svg>,
  tasks: <svg {...s}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>,
  materials: <svg {...s}><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>,
  more: <svg {...s}><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>,
};
const MORE_LABEL = { EN: 'More', UZ: 'Yana', RU: 'Ещё', AR: 'المزيد' };

/** Bottom tab bar of the admin / teacher panels when they run inside the Ufuq app (phones only): the main pages one tap away,
 *  "More" opens the full menu. Hides while a text field is focused so the keyboard has the room. */
export default function PanelTabBar({ items, nav, page, onNavigate, onMore, moreOpen }) {
  const { t, lang } = useCabinetI18n();
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const isField = (el) => !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !/^(checkbox|radio|button|submit|file)$/.test(el.type || '');
    const on = (e) => setTyping(isField(e.target));
    const off = () => setTyping(false);
    document.addEventListener('focusin', on);
    document.addEventListener('focusout', off);
    return () => { document.removeEventListener('focusin', on); document.removeEventListener('focusout', off); };
  }, []);
  const entries = items.map((p) => nav.find((n) => n.page === p)).filter(Boolean);
  const inMain = entries.some((n) => n.page === page);
  return (
    <nav className={'ptb' + (typing ? ' hide' : '')} aria-label="Menu">
      {entries.map((n) => (
        <button type="button" key={n.page} className={'ptb-i' + (page === n.page && !moreOpen ? ' on' : '')} aria-current={page === n.page ? 'page' : undefined} onClick={() => onNavigate(n.page)}>
          <span className="ptb-ic">{ICON[n.page] || ICON.overview}{n.badge > 0 && <i>{n.badge > 9 ? '9+' : n.badge}</i>}</span>
          <span className="ptb-l">{t(n.label)}</span>
        </button>
      ))}
      <button type="button" className={'ptb-i' + (moreOpen || !inMain ? ' on' : '')} aria-expanded={!!moreOpen} onClick={onMore}>
        <span className="ptb-ic">{ICON.more}</span><span className="ptb-l">{MORE_LABEL[String(lang || 'EN').toUpperCase()] || MORE_LABEL.EN}</span>
      </button>
    </nav>
  );
}
