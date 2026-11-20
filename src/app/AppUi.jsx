import { createContext, useContext, useState } from 'react';
import { APP_LANGS } from './strings';
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

/** Language picker in the top bar: a small globe button with the language code; opens a bottom sheet with the four languages. */
export function LangBtn() {
  const { lang, setLang, t } = useApp();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="ua-tbtn ua-lang" onClick={() => { haptic(6); setOpen(true); }} aria-label={t('language')} aria-haspopup="dialog">
        <Ico n="globe" size={17} /><b>{lang}</b>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('language')}>
        <div className="ua-list">
          {APP_LANGS.map((l) => (
            <button type="button" key={l.code} className={'ua-opt' + (lang === l.code ? ' on' : '')} onClick={() => { haptic(); setLang(l.code); setOpen(false); }}>
              <span className="ua-flag">{l.flag}</span>
              <span className="ua-opt-t">{l.label}</span>
              {lang === l.code && <Ico n="check" size={20} />}
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}

/** Top-bar icon version of the group switch: a badge shows how many groups the student has; nothing for a single group. */
export function GroupIconBtn() {
  const { groups } = useDashboardData();
  const { t } = useApp();
  const { openGroups } = useAppUi();
  if (!groups || groups.length < 2) return null;
  return (
    <button type="button" className="ua-tbtn" onClick={() => { haptic(); openGroups(); }} aria-label={t('groupSwitch')}>
      <Ico n="group" size={20} /><i className="ua-dot">{groups.length}</i>
    </button>
  );
}
