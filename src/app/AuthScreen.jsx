import { useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { readProfileRole, writeCachedRole, ufuqSignOut } from '../lib/auth';
import { checkBotGuard, noteAuthFailure, noteAuthSuccess } from '../lib/botGuard';
import { isCaptchaError } from '../lib/captcha';
import Captcha from '../components/Captcha';
import PasswordResetFlow from '../components/PasswordResetFlow';
import { useApp, readPrefs } from './AppContext';
import { Ico, Logo } from './ui';

const GOOGLE = (
  <svg width="20" height="20" viewBox="0 0 18 18" aria-hidden="true">
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.61z" />
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.19l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z" />
    <path fill="#FBBC05" d="M3.95 10.69A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.16.28-1.69V4.98H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.02l2.99-2.33z" />
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.98l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58z" />
  </svg>
);
const APPLE = (
  <svg width="18" height="20" viewBox="0 0 814 1000" aria-hidden="true">
    <path fill="currentColor" d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-207.5 135.4-317.3 269-317.3 70.1 0 128.4 46.4 172.5 46.4 42.8 0 109.6-49.2 190.6-49.2 30.6 0 108.2 2.6 168.1 83.2zm-197.3-164.5c30.5-37.9 52.1-90.5 52.1-143.1 0-7.3-.6-14.7-1.9-20.7-49.5 1.9-108.2 33-143.7 74.2-27.7 32.1-53.8 84.8-53.8 138.6 0 8 1.3 16 1.9 18.6 3.2.6 8.3 1.3 13.5 1.3 44.4 0 99.9-29.7 131.9-69z" />
  </svg>
);

/** Native sign-in / sign-up. Success is reported through onAuthed(); AppRoot then reads the role and opens the app. */
export default function AuthScreen({ initialMode = 'signup', onBack, onAuthed }) {
  const { t } = useApp();
  const [mode, setMode] = useState(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [social, setSocial] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const [honey, setHoney] = useState('');
  const cap = useRef(null);
  const openedAt = useRef(Date.now());
  const isSignin = mode === 'signin';

  const switchMode = (m) => { setMode(m); setError(''); setInfo(''); openedAt.current = Date.now(); };

  function explain(err) {
    const msg = String((err && err.message) || '');
    if (isCaptchaError(err)) return t('errGeneric');
    if (/already registered|already exists/i.test(msg)) return t('errExists');
    if (/invalid login credentials/i.test(msg)) return t('errInvalid');
    if (/password should be at least/i.test(msg)) return t('errShort');
    if (/failed to fetch|network/i.test(msg)) return t('errNet');
    return t('errGeneric');
  }

  const guard = () => {
    const g = checkBotGuard({ openedAt: openedAt.current, honey });
    if (g.ok) return true;
    setError(g.reason === 'locked' ? t('tooMany') : t('errGeneric'));
    return false;
  };

  async function submit(e) {
    e.preventDefault();
    setError(''); setInfo('');
    if (!guard()) return;
    const emailVal = email.trim().toLowerCase();
    const nameVal = name.trim();
    setBusy(true);
    try {
      const captchaToken = (cap.current && cap.current.enabled) ? await cap.current.getToken() : undefined;
      if (cap.current && cap.current.enabled && !captchaToken) { setError(t('errGeneric')); cap.current.reset(); setBusy(false); return; }
      if (!isSignin) {
        const prefs = readPrefs();
        const { data, error: err } = await supabase.auth.signUp({
          email: emailVal, password,
          options: { captchaToken, data: { full_name: nameVal || 'Student', ...(nameVal ? { profile_name_set: true } : {}), app_onboarding: prefs } },
        });
        if (err) throw err;
        if (!data.session) { setInfo(t('confirmMail')); setBusy(false); if (cap.current) cap.current.reset(); return; }
        noteAuthSuccess();
        onAuthed();
      } else {
        const { data, error: err } = await supabase.auth.signInWithPassword({ email: emailVal, password, options: { captchaToken } });
        if (err) throw err;
        noteAuthSuccess();
        const prof = await readProfileRole(data.user.id);
        if (!prof) { await ufuqSignOut(); throw new Error('role'); }
        writeCachedRole(data.user.id, prof.role, prof.admin_tier);
        onAuthed();
      }
    } catch (err) {
      noteAuthFailure();
      setError(err && err.message === 'role' ? t('errRole') : explain(err));
      if (cap.current) cap.current.reset();
      setBusy(false);
    }
  }

  async function oauth(provider) {
    setError('');
    if (!guard()) return;
    setSocial(provider);
    try {
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}/app`, ...(provider === 'google' ? { queryParams: { prompt: 'select_account' } } : {}) },
      });
      if (err) throw err;
    } catch (err) { setError(explain(err)); setSocial(''); }
  }

  return (
    <div className="ua-screen ua-auth">
      <header className="ua-onb-top">
        <button type="button" className="ua-icon-btn" onClick={onBack} aria-label={t('back')}><Ico n="back" /></button>
      </header>
      <main className="ua-auth-body">
        <Logo size={56} />
        <h2 className="center">{t(isSignin ? 'signinTitle' : 'signupTitle')}</h2>
        <p className="ua-sub center">{t(isSignin ? 'signinSub' : 'signupSub')}</p>

        <div className="ua-social">
          <button type="button" className="ua-btn ua-btn-social" disabled={!!social || busy} onClick={() => oauth('google')}>{GOOGLE}<span>{t('google')}</span></button>
          <button type="button" className="ua-btn ua-btn-social" disabled={!!social || busy} onClick={() => oauth('apple')}>{APPLE}<span>{t('apple')}</span></button>
        </div>
        <div className="ua-or"><span>{t('or')}</span></div>

        <form onSubmit={submit} className="ua-form" noValidate={false}>
          {!isSignin && (
            <label className="ua-field"><span>{t('name')}</span>
              <input type="text" autoComplete="name" required placeholder={t('namePh')} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
          )}
          <label className="ua-field"><span>{t('email')}</span>
            <input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" required placeholder="name@mail.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="ua-field"><span>{t('password')}</span>
            <div className="ua-pw">
              <input type={showPw ? 'text' : 'password'} autoComplete={isSignin ? 'current-password' : 'new-password'} required minLength={8} placeholder={isSignin ? '' : t('passwordHint')} value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" className="ua-pw-t" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? t('hide') : t('show')}><Ico n="eye" size={20} /></button>
            </div>
          </label>
          <div className="ua-hp" aria-hidden="true"><input type="text" tabIndex={-1} autoComplete="off" value={honey} onChange={(e) => setHoney(e.target.value)} /></div>
          <Captcha ref={cap} key={mode} action={isSignin ? 'login' : 'signup'} />
          {error && <p className="ua-err" role="alert">{error}</p>}
          {info && <p className="ua-ok" role="status">{info}</p>}
          <button type="submit" className="ua-btn ua-btn-primary" disabled={busy}>{busy ? t(isSignin ? 'signingIn' : 'creating') : t(isSignin ? 'signin' : 'create')}</button>
        </form>

        {isSignin && <button type="button" className="ua-link center" onClick={() => setResetOpen(true)}>{t('forgot')}</button>}
        <p className="ua-switch">{t(isSignin ? 'noAcc' : 'haveAcc')} <button type="button" className="ua-link" onClick={() => switchMode(isSignin ? 'signup' : 'signin')}>{t(isSignin ? 'toSignup' : 'toSignin')}</button></p>
        <p className="ua-legal">{t('consent')} <a href="/terms" target="_blank" rel="noopener noreferrer">{t('terms')}</a> {t('and')} <a href="/privacy" target="_blank" rel="noopener noreferrer">{t('privacy')}</a>.</p>
      </main>
      <PasswordResetFlow open={resetOpen} onClose={() => setResetOpen(false)} initialEmail={email} onDone={() => onAuthed()} />
    </div>
  );
}
