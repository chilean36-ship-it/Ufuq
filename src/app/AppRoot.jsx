import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getSessionAndRole, hasStoredSession, isOAuthCallback, ufuqSignOut } from '../lib/auth';
import BlockedNotice from '../components/BlockedNotice';
import { applyUiPrefs } from '../lib/uiPrefs';
import tokensCss from '../styles/tokens.css?inline';
import PageStyle from '../components/PageStyle';
import appCss from './app.css?inline';
import appCss2 from './app-v2.css?inline';
import { AppProvider, isOnboarded, useApp } from './AppContext';
import Onboarding from './Onboarding';
import AuthScreen from './AuthScreen';
import { Logo } from './ui';
import { ToastProvider } from './hooks';
import Celebrate from './Celebrate';
import { useTheme } from '../hooks/useTheme';

const AppShell = lazy(() => import('./AppShell'));

function Splash({ label }) {
  return (
    <div className="ua-screen ua-splash" role="status" aria-live="polite">
      <Logo size={96} />
      {label ? <p className="ua-hint">{label}</p> : <span className="ua-spin" aria-hidden="true" />}
    </div>
  );
}

function StaffScreen({ auth }) {
  const { t } = useApp();
  const href = auth.role === 'admin' ? '/admin' : '/teacher';
  return (
    <div className="ua-screen ua-splash">
      <Logo size={72} />
      <h2 className="center">{t('teacherAcc')}</h2>
      <p className="ua-sub center">{t('teacherAccSub')}</p>
      <div className="ua-actions" style={{ width: '100%' }}>
        <a className="ua-btn ua-btn-primary" href={href}>{t('openPanel')}</a>
        <button type="button" className="ua-btn ua-btn-ghost" onClick={async () => { await ufuqSignOut(); window.location.reload(); }}>{t('signOut')}</button>
      </div>
    </div>
  );
}

function Root() {
  const { t } = useApp();
  useTheme(); // applies data-theme on <html> (the same saved choice as the website cabinet)
  const [phase, setPhase] = useState(() => (hasStoredSession() || isOAuthCallback() ? 'checking' : 'guest'));
  const [auth, setAuth] = useState(null);
  const [guest, setGuest] = useState(() => (isOnboarded() ? 'signin' : 'onboarding'));
  const [failed, setFailed] = useState(false);
  const alive = useRef(true);

  const check = useCallback(async () => {
    setPhase('checking'); setFailed(false);
    const oauth = isOAuthCallback();
    let result = null;
    try {
      for (let i = 0; i < (oauth ? 5 : 1) && !result; i++) {
        result = await Promise.race([getSessionAndRole(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000))]);
        if (!alive.current) return;
        if (!result && oauth && i < 4) await new Promise((r) => setTimeout(r, 600));
      }
    } catch (e) {
      if (!alive.current) return;
      if (hasStoredSession()) { setFailed(true); return; } // signed in, but the network did not answer: offer a retry, never log out
      result = null;
    }
    if (!alive.current) return;
    if (!result) { setAuth(null); setPhase('guest'); return; }
    setAuth({ user: result.user, role: result.role, fullName: result.full_name, status: result.status });
    setPhase('in');
    // clean ?code= / #access_token= left by Google/Apple sign-in
    if (oauth) window.history.replaceState(null, '', '/app');
  }, []);

  useEffect(() => {
    alive.current = true;
    if (phase === 'checking') check();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' && alive.current) { setAuth(null); setPhase('guest'); setGuest('signin'); }
    });
    return () => { alive.current = false; sub.subscription.unsubscribe(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (failed) {
    return (
      <div className="ua-screen ua-splash"><Logo size={72} /><p className="ua-hint center">{t('errNet')}</p>
        <button type="button" className="ua-btn ua-btn-primary" style={{ maxWidth: 260 }} onClick={check}>{t('retry')}</button></div>
    );
  }
  if (phase === 'checking') return <Splash />;
  if (phase === 'in' && auth) {
    if (auth.role === 'student' && auth.status === 'blocked') return <BlockedNotice />;
    if (auth.role !== 'student') return <StaffScreen auth={auth} />;
    return <Suspense fallback={<Splash />}><AppShell auth={auth} /></Suspense>;
  }
  if (guest === 'onboarding') return <Onboarding onFinish={() => setGuest('signup')} onHaveAccount={() => setGuest('signin')} />;
  return <AuthScreen key={guest} initialMode={guest} onBack={() => setGuest('onboarding')} onAuthed={check} />;
}

/** `/app/*` — the Ufuq app: onboarding → account → (always signed in afterwards) the student's app. */
export default function AppRoot() {
  useEffect(() => {
    document.body.classList.add('ua-body');
    document.documentElement.classList.add('ua-html');
    try { applyUiPrefs(); } catch (e) { /* ignore */ }
    // An app does not zoom: lock the page scale while the app is open (restored when leaving /app) and swallow pinch / ctrl+wheel gestures.
    const vp = document.querySelector('meta[name="viewport"]');
    const vpWas = vp ? vp.getAttribute('content') : null;
    if (vp) vp.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover');
    const noGesture = (e) => e.preventDefault();
    const noCtrlWheel = (e) => { if (e.ctrlKey) e.preventDefault(); };
    const noMultiTouch = (e) => { if (e.touches && e.touches.length > 1) e.preventDefault(); };
    document.addEventListener('gesturestart', noGesture);
    document.addEventListener('gesturechange', noGesture);
    document.addEventListener('wheel', noCtrlWheel, { passive: false });
    document.addEventListener('touchmove', noMultiTouch, { passive: false });
    return () => {
      document.body.classList.remove('ua-body'); document.documentElement.classList.remove('ua-html');
      if (vp && vpWas) vp.setAttribute('content', vpWas);
      document.removeEventListener('gesturestart', noGesture);
      document.removeEventListener('gesturechange', noGesture);
      document.removeEventListener('wheel', noCtrlWheel);
      document.removeEventListener('touchmove', noMultiTouch);
    };
  }, []);
  return (
    <AppProvider>
      <PageStyle css={tokensCss} />
      <PageStyle css={appCss} />
      <PageStyle css={appCss2} />
      <ToastProvider><Celebrate /><Root /></ToastProvider>
    </AppProvider>
  );
}
