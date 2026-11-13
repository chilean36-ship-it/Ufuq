import { useMemo, useState } from 'react';
import { useDashboardData } from '../context/DashboardDataContext';
import { useApp } from './AppContext';
import { haptic, readRecents } from './hooks';
import { desc } from './HomeScreen';
import { Ico } from './ui';

const ITEMS = [
  { id: 'library', icon: 'lib', label: 'q_library', tone: 'amber' },
  { id: 'tasks', icon: 'task', label: 'q_tasks', tone: 'emerald' },
  { id: 'exam', icon: 'exam', label: 'q_exam', tone: 'violet' },
  { id: 'progress', icon: 'chart', label: 'q_progress', tone: 'sky' },
  { id: 'attendance', icon: 'cal', label: 'q_attendance', tone: 'rose' },
  { id: 'certificates', icon: 'cert', label: 'q_certs', tone: 'amber' },
  { id: 'hifzLive', icon: 'book', label: 'q_hifz', tone: 'violet', individualOnly: true },
];

/** Catalog of everything a student can open, with live search and recently opened chips. */
export default function LearnScreen({ onNavigate }) {
  const { t } = useApp();
  const { groupData } = useDashboardData();
  const [q, setQ] = useState('');
  const isIndividual = !!(groupData && groupData.type === 'individual');
  const items = useMemo(() => ITEMS.filter((i) => !i.individualOnly || isIndividual), [isIndividual]);
  const term = q.trim().toLowerCase();
  const shown = items.filter((i) => !term || t(i.label).toLowerCase().includes(term) || desc(i.id, t).toLowerCase().includes(term));
  const recents = readRecents().map((id) => items.find((i) => i.id === id)).filter(Boolean).slice(0, 4);

  return (
    <div className="ua-page ua-learn">
      <header className="ua-title2" style={{ '--i': 0 }}><h1>{t('learnTitle')}</h1><p className="ua-hint">{t('learnSub')}</p></header>
      <label className="ua-search" style={{ '--i': 1 }}>
        <Ico n="search" size={20} />
        <input type="search" inputMode="search" enterKeyHint="search" placeholder={t('searchPh')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('search')} />
        {q && <button type="button" className="ua-search-x" onClick={() => setQ('')} aria-label="Clear"><Ico n="x" size={16} sw={2.4} /></button>}
      </label>

      {!term && recents.length > 0 && (
        <section style={{ '--i': 2 }}>
          <div className="ua-sh-h"><h3>{t('recent')}</h3></div>
          <div className="ua-chips">
            {recents.map((i) => <button type="button" key={i.id} className={'ua-chip3 ' + i.tone} onClick={() => { haptic(); onNavigate(i.id); }}><Ico n={i.icon} size={18} />{t(i.label)}</button>)}
          </div>
        </section>
      )}

      <div className="ua-cats">
        {shown.map((i, n) => (
          <button type="button" key={i.id} className={'ua-cat ' + i.tone} style={{ '--i': n + 3 }} onClick={() => { haptic(); onNavigate(i.id); }}>
            <span className="ua-cat-ic"><Ico n={i.icon} size={28} /></span>
            <span className="ua-cat-t"><b>{t(i.label)}</b><small>{desc(i.id, t)}</small></span>
            <span className="ua-row-chev"><Ico n="chev" size={18} /></span>
          </button>
        ))}
        {shown.length === 0 && <div className="ua-empty big"><Ico n="search" size={26} /><span>{t('noResults')}</span></div>}
      </div>
    </div>
  );
}
