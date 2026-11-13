import { useState } from 'react';
import { markFromApp } from '../components/BackToApp';
import { useNavigate } from 'react-router-dom';
import { useDashboardData, LEVEL_NAMES } from '../context/DashboardDataContext';
import { useTheme } from '../hooks/useTheme';
import { ufuqSignOut } from '../lib/auth';
import { supabase } from '../lib/supabaseClient';
import InstallAppButton from '../components/InstallAppButton';
import { isStandalone } from '../lib/pwaInstall';
import { useApp, readPrefs, writePrefs } from './AppContext';
import { APP_LANGS } from './strings';
import { haptic, useCountUp, useToast } from './hooks';
import Sheet from './Sheet';
import { Ico } from './ui';

const GOALS = [5, 10, 20, 30];

function Row({ icon, label, value, onClick, href, danger, tone }) {
  const inner = (
    <>
      <span className={'ua-row-ic ' + (tone || '')}><Ico n={icon} size={21} /></span>
      <span className="ua-row-t">{label}</span>
      {value && <span className="ua-row-v">{value}</span>}
      {!danger && <span className="ua-row-chev"><Ico n="chev" size={18} /></span>}
    </>
  );
  return href
    ? <a className="ua-row" href={href} target="_blank" rel="noopener noreferrer">{inner}</a>
    : <button type="button" className={'ua-row' + (danger ? ' danger' : '')} onClick={() => { haptic(); onClick(); }}>{inner}</button>;
}

export default function MeScreen({ onNavigate, role, activity }) {
  const { t, lang, setLang } = useApp();
  const toast = useToast();
  const navigate = useNavigate();
  const { user, name, level, avatarUrl } = useDashboardData();
  const [, , themeMode, setThemeMode] = useTheme();
  const [goal, setGoalState] = useState(readPrefs().goal || 10);
  const [sheet, setSheet] = useState(null); // 'lang' | 'theme' | 'goal' | 'out'
  const [busy, setBusy] = useState(false);
  const streakN = useCountUp(activity.streak);
  const minN = useCountUp(Math.floor(activity.todaySec / 60));
  const lvlN = useCountUp(level);

  const setGoal = (m) => {
    setGoalState(m);
    const p = { ...readPrefs(), goal: m };
    writePrefs(p);
    window.dispatchEvent(new Event('ufuq-goal-changed'));
    supabase.auth.updateUser({ data: { app_onboarding: p } }).catch(() => {});
    toast(t('saved')); setSheet(null);
  };
  async function signOut() {
    setBusy(true);
    try { await ufuqSignOut(); } catch (e) { /* signed out locally anyway */ }
    navigate('/app', { replace: true });
    window.location.reload();
  }
  const staff = role === 'teacher' || role === 'admin';
  const themeLabel = { dark: t('dark'), light: t('light'), system: t('auto') }[themeMode] || t('dark');
  const langLabel = (APP_LANGS.find((l) => l.code === lang) || {}).label;

  return (
    <div className="ua-page ua-me2">
      <section className="ua-mehead" style={{ '--i': 0 }}>
        <span className="ua-mehead-bg" aria-hidden="true" />
        <button type="button" className="ua-avatar xl" onClick={() => onNavigate('profile')} aria-label={t('profile')}>
          {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{(name || '?').charAt(0).toUpperCase()}</span>}
        </button>
        <h2>{name}</h2>
        <p className="ua-hint">{user && user.email}</p>
        <span className="ua-chip">{LEVEL_NAMES[level - 1]}</span>
      </section>

      <section className="ua-stats" style={{ '--i': 1 }}>
        <div className="ua-stat"><Ico n="flame" size={22} fill={activity.streak > 0} sw={1.6} /><b>{streakN}</b><small>{t('statStreak')}</small></div>
        <div className="ua-stat"><Ico n="clock" size={22} /><b>{minN}</b><small>{t('statToday')}</small></div>
        <div className="ua-stat"><Ico n="star" size={22} /><b>{lvlN}</b><small>{t('statLevel')}</small></div>
      </section>

      {staff && (
        <a className="ua-card2 ua-staff" href={role === 'admin' ? '/app/admin' : '/app/teacher'} onClick={markFromApp} style={{ '--i': 2 }}>
          <span><b>{t('teacherAcc')}</b><small>{t('teacherAccSub')}</small></span><span className="ua-chip">{t('openPanel')}</span>
        </a>
      )}

      <h4 className="ua-section">{t('learning')}</h4>
      <div className="ua-rows2" style={{ '--i': 3 }}>
        <Row icon="star" tone="amber" label={t('chooseGoal')} value={`${goal} ${t('minShort')}`} onClick={() => setSheet('goal')} />
        <Row icon="card" tone="emerald" label={t('billing')} onClick={() => onNavigate('billing')} />
      </div>

      <h4 className="ua-section">{t('prefs')}</h4>
      <div className="ua-rows2" style={{ '--i': 4 }}>
        <Row icon="globe" tone="sky" label={t('language')} value={langLabel} onClick={() => setSheet('lang')} />
        <Row icon="moon" tone="violet" label={t('appearance')} value={themeLabel} onClick={() => setSheet('theme')} />
        <Row icon="settings" tone="rose" label={t('account')} onClick={() => onNavigate('settings')} />
      </div>

      <div className="ua-rows2" style={{ '--i': 5 }}>
        {!isStandalone() && <div className="ua-row ua-install"><InstallAppButton variant="side" force /></div>}
        <Row icon="help" tone="sky" label={t('helpChat')} href="https://t.me/ufuq_support" />
        <Row icon="out" danger label={t('signOut')} onClick={() => setSheet('out')} />
      </div>
      <p className="ua-ver">Ufuq · {t('version')} 2.0</p>

      <Sheet open={sheet === 'lang'} onClose={() => setSheet(null)} title={t('chooseLanguage')}>
        <div className="ua-list">
          {APP_LANGS.map((l) => (
            <button type="button" key={l.code} className={'ua-opt' + (lang === l.code ? ' on' : '')} onClick={() => { haptic(); setLang(l.code); setSheet(null); }}>
              <span className="ua-flag">{l.flag}</span><span className="ua-opt-t">{l.label}</span>{lang === l.code && <Ico n="check" size={20} />}
            </button>
          ))}
        </div>
      </Sheet>
      <Sheet open={sheet === 'theme'} onClose={() => setSheet(null)} title={t('chooseTheme')}>
        <div className="ua-themes">
          {[['dark', 'dark'], ['light', 'light'], ['system', 'auto']].map(([v, k]) => (
            <button type="button" key={v} className={'ua-theme ' + v + (themeMode === v ? ' on' : '')} onClick={() => { haptic(); setThemeMode(v); setSheet(null); }}>
              <span className="ua-theme-pv"><i /><i /><i /></span><b>{t(k)}</b>
            </button>
          ))}
        </div>
      </Sheet>
      <Sheet open={sheet === 'goal'} onClose={() => setSheet(null)} title={t('chooseGoal')}>
        <div className="ua-list">
          {GOALS.map((m) => (
            <button type="button" key={m} className={'ua-opt' + (goal === m ? ' on' : '')} onClick={() => { haptic(); setGoal(m); }}>
              <span className="ua-opt-t">{t('goal_' + m)} <small>/ {t('perDay')}</small></span><span className="ua-opt-s end">{t('goal_' + m + 's')}</span>
            </button>
          ))}
        </div>
      </Sheet>
      <Sheet open={sheet === 'out'} onClose={() => setSheet(null)} title={t('signOut')}>
        <p className="ua-sub" style={{ marginTop: 0 }}>{t('signOutAsk')}</p>
        <div className="ua-cta-row">
          <button type="button" className="ua-btn ua-btn-ghost" onClick={() => setSheet(null)}>{t('cancel')}</button>
          <button type="button" className="ua-btn ua-btn-danger" disabled={busy} onClick={signOut}>{t('confirm')}</button>
        </div>
      </Sheet>
    </div>
  );
}
