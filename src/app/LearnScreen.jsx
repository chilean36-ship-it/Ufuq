import { useDashboardData } from '../context/DashboardDataContext';
import { useApp } from './AppContext';
import { Ico } from './ui';

const ITEMS = [
  { id: 'library', icon: 'lib', label: 'q_library' },
  { id: 'tasks', icon: 'task', label: 'q_tasks' },
  { id: 'exam', icon: 'exam', label: 'q_exam' },
  { id: 'progress', icon: 'chart', label: 'q_progress' },
  { id: 'attendance', icon: 'cal', label: 'q_attendance' },
  { id: 'certificates', icon: 'cert', label: 'q_certs' },
  { id: 'hifzLive', icon: 'book', label: 'q_hifz', individualOnly: true },
];

export default function LearnScreen({ onNavigate }) {
  const { t } = useApp();
  const { groupData } = useDashboardData();
  const isIndividual = !!(groupData && groupData.type === 'individual');
  return (
    <div className="ua-page">
      <header className="ua-title"><h1>{t('learnTitle')}</h1><p className="ua-hint">{t('learnSub')}</p></header>
      <div className="ua-rows">
        {ITEMS.filter((i) => !i.individualOnly || isIndividual).map((i) => (
          <button type="button" key={i.id} className="ua-row" onClick={() => onNavigate(i.id)}>
            <span className="ua-row-ic"><Ico n={i.icon} size={22} /></span>
            <span className="ua-row-t">{t(i.label)}</span>
            <span className="ua-row-chev"><Ico n="chev" size={18} /></span>
          </button>
        ))}
      </div>
    </div>
  );
}
