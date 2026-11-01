import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { afterAuthDestination } from '../../lib/payIntent';
import { writeCachedRole, readProfileRole, ufuqSignOut, homeRoute } from '../../lib/auth';
import { useI18n } from '../../context/I18nContext';
import LegalConsent from '../Legal/LegalConsent';
import PasswordResetFlow from '../../components/PasswordResetFlow';
import Captcha from '../../components/Captcha';
import { isCaptchaError } from '../../lib/captcha';
import { checkBotGuard, noteAuthFailure, noteAuthSuccess } from '../../lib/botGuard';

/**
 * Sign-in / sign-up / forgot-password modal (port of the #authOverlay logic from app-shell.js).
 *  - email+password sign up / sign in (Supabase Auth)
 *  - Google OAuth (account picker forced)
 *  - reset-by-email
 * After sign-in the user is routed by role: admin -> /admin, teacher -> /teacher, else -> /dashboard.
 */
export default function AuthModal({ open, mode, onModeChange, onClose }) {
  const { t } = useI18n();
  const navigate = useNavigate();

  const [resetOpen, setResetOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [appleBusy, setAppleBusy] = useState(false);
  const cap = useRef(null);
  const openedAt = useRef(0);
  const [honey, setHoney] = useState('');

  // Every time the modal opens: back to the form view with a clean error line.
  useEffect(() => {
    if (open) { setResetOpen(false); setError(''); }
  }, [open]);
  useEffect(() => { if (open) openedAt.current = Date.now(); }, [open, mode]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const isSignin = mode === 'signin';

  const title = t(isSignin ? 'auth.signinTitle' : 'auth.signupTitle');
  const sub = t(isSignin ? 'auth.signinSub' : 'auth.signupSub');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const nameVal = name.trim();
    const emailVal = email.trim().toLowerCase();
    const isSignup = mode !== 'signin';

    const guard = checkBotGuard({ openedAt: openedAt.current, honey });
    if (!guard.ok) {
      setError(guard.reason === 'locked' ? t('captcha.tooMany').replace('{s}', guard.wait) : t('captcha.rejected'));
      return;
    }
    setSubmitting(true);

    try {
      // CAPTCHA: odatda ko'rinmas; token bo'lmasa (yuklanmadi / shubha) forma yuborilmaydi.
      const captchaToken = (cap.current && cap.current.enabled) ? await cap.current.getToken() : undefined;
      if (cap.current && cap.current.enabled && !captchaToken) {
        setError(t('captcha.required'));
        cap.current.reset();
        setSubmitting(false);
        return;
      }
      if (isSignup) {
        const { data, error: err } = await supabase.auth.signUp({
          email: emailVal,
          password,
          options: { captchaToken, data: { full_name: nameVal || 'Student', ...(nameVal ? { profile_name_set: true } : {}) } }, // a name typed here is already confirmed
        });
        if (err) throw err;

        // Agar "Confirm email" yoqilgan bo'lsa, session hali yo'q bo'ladi —
        // foydalanuvchi emailini tasdiqlashi kerak.
        if (!data.session) {
          setError(t('auth.signupConfirm'));
          if (cap.current) cap.current.reset();
          setSubmitting(false);
          return;
        }
        noteAuthSuccess();
        // replace: the back button from the dashboard must not land on the login form again.
        navigate(afterAuthDestination('student', '/dashboard?new=1'), { replace: true });
      } else {
        const { data, error: err } = await supabase.auth.signInWithPassword({ email: emailVal, password, options: { captchaToken } });
        if (err) throw err;
        noteAuthSuccess();

        // Rolga qarab yo'naltirish: 'admin' -> admin panel, 'teacher' -> o'qituvchi
        // paneli, qolgan hollarda (oddiy talaba) -> shaxsiy kabinet (dashboard).
        // The role decides the panel. If it cannot be read, nobody is guessed to be a student: sign out and say so.
        const profileRole = await readProfileRole(data.user.id);
        const home = profileRole ? homeRoute(profileRole.role, profileRole.admin_tier) : null;
        if (!profileRole || !home) {
          await ufuqSignOut();
          throw new Error(t('auth.errRole'));
        }
        writeCachedRole(data.user.id, profileRole.role, profileRole.admin_tier);
        navigate(afterAuthDestination(profileRole.role, home), { replace: true });
      }
    } catch (err) {
      console.error('Auth error:', err);
      let msg = err.message || t('auth.errGeneric');
      if (isCaptchaError(err)) msg = t('captcha.rejected');
      else if (/already registered|already exists/i.test(msg)) msg = t('auth.errExists');
      else if (/invalid login credentials/i.test(msg)) msg = t('auth.errInvalid');
      else if (/password should be at least/i.test(msg)) msg = t('auth.errShortPass');
      setError(msg);
      if (cap.current) cap.current.reset(); // token bir martalik
      noteAuthFailure();
      setSubmitting(false);
    }
  }

  // ---- Google orqali kirish (Supabase OAuth) ----
  async function handleGoogle() {
    setError('');
    const guard = checkBotGuard({ openedAt: openedAt.current, honey });
    if (!guard.ok) {
      setError(guard.reason === 'locked' ? t('captcha.tooMany').replace('{s}', guard.wait) : t('captcha.rejected'));
      return;
    }
    setGoogleBusy(true);
    try {
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          // Lands on /index: the role decides the panel there (not a fixed student page).
          redirectTo: `${window.location.origin}/index`,
          // Har safar Google'ning akkaunt tanlash oynasi chiqishi uchun.
          queryParams: { prompt: 'select_account' },
        },
      });
      if (err) throw err;
      // Muvaffaqiyatli bo'lsa, brauzer shu yerda Google'ga o'tib ketadi.
    } catch (err) {
      console.error('Google auth error:', err);
      setError(err.message || t('auth.errGoogle'));
      setGoogleBusy(false);
    }
  }

  // ---- Apple orqali kirish (Supabase OAuth) ----
  async function handleApple() {
    setError('');
    const guard = checkBotGuard({ openedAt: openedAt.current, honey });
    if (!guard.ok) {
      setError(guard.reason === 'locked' ? t('captcha.tooMany').replace('{s}', guard.wait) : t('captcha.rejected'));
      return;
    }
    setAppleBusy(true);
    try {
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: { redirectTo: `${window.location.origin}/index` },
      });
      if (err) throw err;
      // Muvaffaqiyatli bo'lsa, brauzer shu yerda Apple'ga o'tib ketadi.
    } catch (err) {
      console.error('Apple auth error:', err);
      setError(err.message || t('auth.errApple'));
      setAppleBusy(false);
    }
  }

  const submitLabel = submitting
    ? (isSignin ? 'Signing in…' : 'Creating account…')
    : t(isSignin ? 'auth.signinBtn' : 'auth.signupBtn');

  return (
    <div
      className={'auth-overlay' + (open ? ' open' : '')}
      id="authOverlay"
      aria-hidden={!open}
      data-mode={mode}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="authTitle">
        <button type="button" className="auth-close" id="authClose" aria-label="Close" onClick={onClose}>&times;</button>

        <div className="auth-logo-row">
          <img src="/assets/images/img-01.webp" alt="Ufuq" style={{ height: '26px', width: 'auto' }} />
          <span className="auth-logo-word">Ufuq</span>
        </div>

        <h2 id="authTitle">{title}</h2>
        <p className="auth-sub" id="authSub">{sub}</p>

        {(
          <div id="authFormView">
            <div className="auth-social">
              <button type="button" className="social-btn" id="googleAuthBtn" disabled={googleBusy || appleBusy} onClick={handleGoogle}>
                <svg width="18" height="18" viewBox="0 0 18 18">
                  <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.61z" />
                  <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.19l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z" />
                  <path fill="#FBBC05" d="M3.95 10.69A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.16.28-1.69V4.98H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.02l2.99-2.33z" />
                  <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.98l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58z" />
                </svg>
                <span id="googleAuthBtnLabel">{googleBusy ? 'Redirecting…' : t('auth.google')}</span>
              </button>
              <button type="button" className="social-btn social-btn-apple" id="appleAuthBtn" disabled={appleBusy || googleBusy} onClick={handleApple}>
                <svg width="16" height="18" viewBox="0 0 814 1000" aria-hidden="true">
                  <path fill="currentColor" d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-207.5 135.4-317.3 269-317.3 70.1 0 128.4 46.4 172.5 46.4 42.8 0 109.6-49.2 190.6-49.2 30.6 0 108.2 2.6 168.1 83.2zm-197.3-164.5c30.5-37.9 52.1-90.5 52.1-143.1 0-7.3-.6-14.7-1.9-20.7-49.5 1.9-108.2 33-143.7 74.2-27.7 32.1-53.8 84.8-53.8 138.6 0 8 1.3 16 1.9 18.6 3.2.6 8.3 1.3 13.5 1.3 44.4 0 99.9-29.7 131.9-69z" />
                </svg>
                <span id="appleAuthBtnLabel">{appleBusy ? 'Redirecting…' : t('auth.apple')}</span>
              </button>
            </div>

            <div className="auth-divider">{t('auth.or')}</div>

            <form id="authForm" onSubmit={handleSubmit}>
              {!isSignin && (
                <div className="auth-field" id="nameField">
                  <label htmlFor="authName">{t('auth.nameLabel')}</label>
                  <input
                    type="text" id="authName" placeholder={t('auth.namePlaceholder')} required
                    value={name} onChange={(e) => setName(e.target.value)}
                  />
                </div>
              )}
              <div className="auth-field">
                <label htmlFor="authEmail">{t('auth.emailLabel')}</label>
                <input
                  type="email" id="authEmail" placeholder={t('auth.emailPlaceholder')} required
                  value={email} onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="auth-field">
                <label htmlFor="authPassword">{t('auth.passwordLabel')}</label>
                <input
                  type="password" id="authPassword" placeholder={t('auth.passwordPlaceholder')} required minLength={8}
                  value={password} onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="hp-field" aria-hidden="true"><label>Website<input type="text" name="website" tabIndex={-1} autoComplete="off" value={honey} onChange={(e) => setHoney(e.target.value)} /></label></div>
              {open && <Captcha ref={cap} key={mode} action={isSignin ? 'login' : 'signup'} />}
              {error && (
                <p className="auth-error" id="authError" style={{ display: 'block', color: '#E5484D', fontSize: '13.5px', margin: '0 0 14px', lineHeight: 1.5 }}>
                  {error}
                </p>
              )}
              <button type="submit" className="auth-submit" id="authSubmit" disabled={submitting}>{submitLabel}</button>
              <LegalConsent id="authTerms" />
            </form>
            {isSignin && (
              <a
                href="#" id="forgotPasswordLink"
                style={{ display: 'block', fontSize: '12.5px', color: 'var(--gold-bright)', marginTop: '8px', textAlign: 'center' }}
                onClick={(e) => { e.preventDefault(); setResetOpen(true); }}
              >
                {t('auth.forgot')}
              </a>
            )}

            <p className="auth-switch">
              <span id="switchPrompt">{t(isSignin ? 'auth.newHere' : 'auth.haveAccount')}</span>{' '}
              <a
                href="#" id="authSwitchLink"
                onClick={(e) => { e.preventDefault(); setError(''); onModeChange(isSignin ? 'signup' : 'signin'); }}
              >
                {t(isSignin ? 'auth.createAccount' : 'auth.signIn')}
              </a>
            </p>
          </div>
        )}

        <PasswordResetFlow open={resetOpen} onClose={() => setResetOpen(false)} initialEmail={email} />
      </div>
    </div>
  );
}
