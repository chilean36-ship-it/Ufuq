import { createContext, useContext } from 'react';
import { useDashboardData } from '../context/DashboardDataContext';
import { useApp } from './AppContext';
import { haptic } from './hooks';
import Sheet from './Sheet';
import { Ico } from './ui';

/** Small app-wide UI actions shared by the screens (opening the group picker). */
export const AppUiCtx = createContext({ openGroups: () => {} });
export const useAppUi = () => useContext(AppUiCtx);

/** The pill that shows the working group and opens the picker; renders nothing for a student who is in one group only. */
export function GroupPill({ className = '' }) {
  const { groups, groupCode } = useDashboardData();
  const { t } = useApp();
  const { openGroups } = useAppUi();
  if (!groups || groups.length < 2) return null;
  const cur = groups.find((g) => g.code === groupCode) || groups[0];
  return (
    <button type="button" className={'ua-gpill ' + className} onClick={() => { haptic(); openGroups(); }} aria-label={t('groupSwitch')}>
      <Ico n="group" size={16} /><span>{cur.name}</span><Ico n="chev" size={14} sw={2.4} />
    </button>
  );
}

/** Bottom sheet listing every running group of the student; picking one reloads the open screen for that group. */
export function GroupSheet({ open, onClose, onPick }) {
  const { groups, groupCode } = useDashboardData();
  const { t } = useApp();
  return (
    <Sheet open={open} onClose={onClose} title={t('groupsTitle')}>
      <div className="ua-list">
        {(groups || []).map((g) => (
          <button type="button" key={g.code} className={'ua-opt' + (g.code === groupCode ? ' on' : '')} onClick={() => { haptic(); onPick(g.code); }}>
            <span className="ua-flag"><Ico n="group" size={16} /></span>
            <span className="ua-opt-t">{g.name}</span>
            {g.code === groupCode && <Ico n="check" size={20} />}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
