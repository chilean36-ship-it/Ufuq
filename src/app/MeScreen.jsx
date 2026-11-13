import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDashboardData, LEVEL_NAMES } from '../context/DashboardDataContext';
import { useTheme } from '../hooks/useTheme';
import { ufuqSignOut } from '../lib/auth';
import { supabase } from '../lib/supabaseClient';
import InstallAppButton from '../components/InstallAppButton';
import { isStandalone } from '../lib/pwaInstall';
import { useApp, readPrefs, writePrefs } from './AppContext';
import { APP_LANGS } from './strings';
import { Ico } from './ui';

const GOALS = [5, 10, 20, 30];

export default function MeScreen({ onNavigate, role }) {
  const { t, lang, setLang } = useApp();
  const navigate = useNavigate();
  const { user, name, level, avatarUrl } = useDashboardData();
  const [, , themeMode, setThemeMode] = useTheme();
  const [goal, setGoalState] = useState(readPrefs().goal || 10);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const setGoal = (m) => {
    setGoalState(m);
    const p = { ...readPrefs(), goal: m };
    writePrefs(p);
    supabase.auth.updateUser({ data: { app_onboarding: p } }).catch(() => {});
  };

  async function signOut() {
    setBusy(true);
    try { await ufuqSignOut(); } catch (e) { /* signed out locally anyway */ }
    navigate('/app', { replace: true });
    window.location.reload();
  }

  const staff = role === 'teacher' || role === 'admin';

  return (
    <div className="ua-page ua-me">
      <button type="button" className="ua-card ua-profile" onClick={() => onNavigate('profile')}>
        <span className="ua-avatar lg">{avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{(name || '?').charAt(0).toUpperCase()}</span>}</span>
        <span className="ua-profile-t"><b>{name}</b><small>{user && user.email}</small><em>{t('level')} {level} · {LEVEL_NAMES[level - 1]}</em></span>
        <Ico n="chev" size={18} />
      </button>

      {staff && (
        <a className="ua-card ua-staff" href={role === 'admin' ? '/admin' : '/teacher'}>
          <span><b>{t('teacherAcc')}</b><small>{t('teacherAccSub')}</small></span><span className="ua-chip">{t('openPanel')}</span>
        </a>
      )}

      <h4 className="ua-section">{t('settings')}</h4>
      <div className="ua-group">
        <div className="ua-set">
          <span className="ua-row-ic"><Ico n="globe" size={20} /></span><span className="ua-row-t">{t('language')}</span>
        </div>
        <div className="ua-seg" role="group" aria-label={t('language')}>
          {APP_LANGS.map((l) => <button type="button" key={l.code} className={lang === l.code ? 'on' : ''} onClick={() => setLang(l.code)}>{l.flag}</button>)}
        </div>
        <div className="ua-set">
          <span className="ua-row-ic"><Ico n="moon" size={20} /></span><span className="ua-row-t">{t('appearance')}</span>
        </div>
        <div className="ua-seg" role="group" aria-label={t('appearance')}>
          {[['dark', 'dark'], ['light', 'light'], ['system', 'auto']].map(([v, k]) => <button type="button" key={v} className={themeMode === v ? 'on' : ''} onClick={() => setThemeMode(v)}>{t(k)}</button>)}
        </div>
        <div className="ua-set">
          <span className="ua-row-ic"><Ico n="star" size={20} /></span><span className="ua-row-t">{t('yourGoal')}</span>
        </div>
        <div className="ua-seg" role="group" aria-label={t('yourGoal')}>
          {GOALS.map((m) => <button type="button" key={m} className={goal === m ? 'on' : ''} onClick={() => setGoal(m)}>{m}</button>)}
        </div>
      </div>

      <div className="ua-rows">
        <button type="button" className="ua-row" onClick={() => onNavigate('billing')}><span className="ua-row-ic"><Ico n="card" size={22} /></span><span className="ua-row-t">{t('billing')}</span><span className="ua-row-chev"><Ico n="chev" size={18} /></span></button>
        <button type="button" className="ua-row" onClick={() => onNavigate('settings')}><span className="ua-row-ic"><Ico n="settings" size={22} /></span><span className="ua-row-t">{t('account')}</span><span className="ua-row-chev"><Ico n="chev" size={18} /></span></button>
        {!isStandalone() && <div className="ua-row ua-install"><InstallAppButton variant="side" /></div>}
        <a className="ua-row" href="/index" target="_blank" rel="noopener noreferrer"><span className="ua-row-ic"><Ico n="help" size={22} /></span><span className="ua-row-t">{t('website')}</span><span className="ua-row-chev"><Ico n="chev" size={18} /></span></a>
        <button type="button" className="ua-row danger" onClick={() => setConfirm(true)}><span className="ua-row-ic"><Ico n="out" size={22} /></span><span className="ua-row-t">{t('signOut')}</span></button>
      </div>
      <p className="ua-ver">Ufuq · {t('version')} 1.0</p>

      {confirm && (
        <div className="ua-sheet-ov" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) setConfirm(false); }}>
          <div className="ua-sheet">
            <h3>{t('signOut')}</h3><p>{t('signOutAsk')}</p>
            <div className="ua-cta-row">
              <button type="button" className="ua-btn ua-btn-ghost" onClick={() => setConfirm(false)}>{t('cancel')}</button>
              <button type="button" className="ua-btn ua-btn-danger" disabled={busy} onClick={signOut}>{t('confirm')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
