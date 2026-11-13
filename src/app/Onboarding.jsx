import { useState } from 'react';
import { useApp, readPrefs, writePrefs, setOnboarded } from './AppContext';
import { APP_LANGS } from './strings';
import { Ico, Logo } from './ui';

const WHY = ['quran', 'pray', 'study', 'travel', 'family', 'fun'];
const LEVELS = ['zero', 'letters', 'read', 'speak'];
const GOALS = [5, 10, 20, 30];
const STEPS = 5; // language, why, level, goal, plan
const PLAN_ICONS = ['video', 'task', 'lib', 'ai'];

/** First-run flow (Duolingo-style): welcome -> language -> why -> level -> daily goal -> plan -> create account. */
export default function Onboarding({ onFinish, onHaveAccount }) {
  const { t, lang, setLang } = useApp();
  const saved = readPrefs();
  const [step, setStep] = useState(0); // 0 = welcome
  const [why, setWhy] = useState(saved.why || []);
  const [level, setLevel] = useState(saved.level || '');
  const [goal, setGoal] = useState(saved.goal || 10);
  const [dir, setDir] = useState(1);

  const go = (n) => { setDir(n > step ? 1 : -1); setStep(n); };
  const store = () => { writePrefs({ why, level, goal }); setOnboarded(); };
  const finish = () => { store(); onFinish({ why, level, goal }); };
  const toggleWhy = (k) => setWhy((w) => (w.includes(k) ? w.filter((x) => x !== k) : [...w, k]));

  const canNext = step === 2 ? why.length > 0 : step === 3 ? !!level : true;

  if (step === 0) {
    return (
      <div className="ua-screen ua-welcome">
        <div className="ua-welcome-hero">
          <Logo size={104} />
          <h1 className="ua-brand">Ufuq</h1>
          <p className="ua-tagline">{t('tagline')}</p>
        </div>
        <div className="ua-actions">
          <button type="button" className="ua-btn ua-btn-primary" onClick={() => go(1)}>{t('getStarted')}</button>
          <button type="button" className="ua-btn ua-btn-ghost" onClick={onHaveAccount}>{t('haveAccount')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="ua-screen ua-onb">
      <header className="ua-onb-top">
        <button type="button" className="ua-icon-btn" onClick={() => go(step - 1)} aria-label={t('back')}><Ico n="back" /></button>
        <div className="ua-progress" role="progressbar" aria-valuemin={0} aria-valuemax={STEPS} aria-valuenow={step}>
          <i style={{ width: (step / STEPS) * 100 + '%' }} />
        </div>
      </header>

      <main className={'ua-onb-body ' + (dir > 0 ? 'fwd' : 'back')} key={step}>
        {step === 1 && (<>
          <h2>{t('stepLang')}</h2><p className="ua-sub">{t('stepLangSub')}</p>
          <div className="ua-list">
            {APP_LANGS.map((l) => (
              <button type="button" key={l.code} className={'ua-opt' + (lang === l.code ? ' on' : '')} onClick={() => setLang(l.code, { sync: false })}>
                <span className="ua-flag">{l.flag}</span><span className="ua-opt-t">{l.label}</span>{lang === l.code && <Ico n="check" size={20} />}
              </button>
            ))}
          </div>
        </>)}

        {step === 2 && (<>
          <h2>{t('stepWhy')}</h2><p className="ua-sub">{t('stepWhySub')}</p>
          <div className="ua-list">
            {WHY.map((k) => (
              <button type="button" key={k} className={'ua-opt' + (why.includes(k) ? ' on' : '')} onClick={() => toggleWhy(k)} aria-pressed={why.includes(k)}>
                <span className="ua-opt-t">{t('why_' + k)}</span>{why.includes(k) && <Ico n="check" size={20} />}
              </button>
            ))}
          </div>
        </>)}

        {step === 3 && (<>
          <h2>{t('stepLevel')}</h2><p className="ua-sub">{t('stepLevelSub')}</p>
          <div className="ua-list">
            {LEVELS.map((k, i) => (
              <button type="button" key={k} className={'ua-opt' + (level === k ? ' on' : '')} onClick={() => setLevel(k)} aria-pressed={level === k}>
                <span className="ua-bars" aria-hidden="true">{[0, 1, 2, 3].map((b) => <i key={b} className={b <= i ? 'f' : ''} />)}</span>
                <span className="ua-opt-col"><span className="ua-opt-t">{t('lvl_' + k)}</span><span className="ua-opt-s">{t('lvl_' + k + 'Sub')}</span></span>
              </button>
            ))}
          </div>
        </>)}

        {step === 4 && (<>
          <h2>{t('stepGoal')}</h2><p className="ua-sub">{t('stepGoalSub')}</p>
          <div className="ua-list">
            {GOALS.map((m) => (
              <button type="button" key={m} className={'ua-opt' + (goal === m ? ' on' : '')} onClick={() => setGoal(m)} aria-pressed={goal === m}>
                <span className="ua-opt-t">{t('goal_' + m)} <small>/ {t('perDay')}</small></span>
                <span className="ua-opt-s end">{t('goal_' + m + 's')}</span>
              </button>
            ))}
          </div>
        </>)}

        {step === 5 && (<>
          <div className="ua-plan-badge"><Ico n="star" size={30} fill /></div>
          <h2 className="center">{t('planTitle')}</h2><p className="ua-sub center">{t('planSub')}</p>
          <ul className="ua-plan">
            {PLAN_ICONS.map((ic, i) => (
              <li key={ic}><span className="ua-plan-ic"><Ico n={ic} size={20} /></span><span>{t('plan' + (i + 1))}</span></li>
            ))}
          </ul>
          <p className="ua-goalchip">{t('yourGoal')}: <b>{t('goal_' + goal)}</b> / {t('perDay')}</p>
        </>)}
      </main>

      <footer className="ua-actions">
        {step < 5
          ? <button type="button" className="ua-btn ua-btn-primary" disabled={!canNext} onClick={() => go(step + 1)}>{t('continue')}</button>
          : <button type="button" className="ua-btn ua-btn-primary" onClick={finish}>{t('create')}</button>}
        {step === 5 && <button type="button" className="ua-btn ua-btn-ghost" onClick={() => { store(); onHaveAccount(); }}>{t('haveAccount')}</button>}
      </footer>
    </div>
  );
}
