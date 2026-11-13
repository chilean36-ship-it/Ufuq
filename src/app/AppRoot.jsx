import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { markFromApp } from '../components/BackToApp';
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
import { Ico, Logo } from './ui';
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

function StaffScreen({ auth, onStudent }) {
  const { t } = useApp();
  const isAdmin = auth.role === 'admin';
  // main admin (any tier but "standard") and teachers start in the teacher panel; an ordinary admin starts in the admin panel
  const href = isAdmin && auth.tier === 'standard' ? '/app/admin' : auth.role === 'teacher' ? '/app/teacher' : isAdmin && auth.tier ? '/app/teacher' : '/app/admin';
  const label = href === '/app/admin' ? t('adminPanel') : t('teacherPanel');
  return (
    <div className="ua-screen ua-staff-screen">
      <div className="ua-staff-top"><Logo size={64} /><h2>{t('teacherAcc')}</h2><p className="ua-sub">{t('staffHint')}</p></div>
      <div className="ua-staff-list">
        <a className="ua-staff-card gold" href={href} onClick={markFromApp}><span className="ua-row-ic"><Ico n="settings" size={22} /></span><span className="ua-row-t">{label}</span><Ico n="chev" size={18} /></a>
        {isAdmin && href !== '/app/admin' && <a className="ua-staff-card" href="/app/admin" onClick={markFromApp}><span className="ua-row-ic"><Ico n="settings" size={22} /></span><span className="ua-row-t">{t('adminPanel')}</span><Ico n="chev" size={18} /></a>}
        {isAdmin && onStudent && <button type="button" className="ua-staff-card" onClick={onStudent}><span className="ua-row-ic"><Ico n="home" size={22} /></span><span className="ua-row-t">{t('studentApp')}</span><Ico n="chev" size={18} /></button>}
      </div>
      <div className="ua-actions" style={{ width: '100%' }}>
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
  const [studentView, setStudentView] = useState(() => { try { return sessionStorage.getItem('ufuq-staff-student') === '1'; } catch (e) { return false; } });
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
    setAuth({ user: result.user, role: result.role, fullName: result.full_name, status: result.status, tier: result.admin_tier || null });
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
    // admins may use the student app too (as on the website); teachers go to their panel
    if (auth.role !== 'student' && !(auth.role === 'admin' && studentView)) return <StaffScreen auth={auth} onStudent={auth.role === 'admin' ? () => { try { sessionStorage.setItem('ufuq-staff-student', '1'); } catch (e) { /* ignore */ } setStudentView(true); } : null} />;
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
    if (vp) vp.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content');
    const zoomable = (e) => !!(e.target && e.target.closest && e.target.closest('[data-zoomable]'));
    const noGesture = (e) => { if (!zoomable(e)) e.preventDefault(); };
    const noCtrlWheel = (e) => { if (e.ctrlKey && !zoomable(e)) e.preventDefault(); };
    const noMultiTouch = (e) => { if (e.touches && e.touches.length > 1 && !zoomable(e)) e.preventDefault(); };
    // The app (and the exam room) fill the VISIBLE area: when the keyboard opens the page shrinks to what is left above it
    // instead of the keyboard covering the bottom (Chrome on Android overlays by default). --ua-vh is that height.
    const vv = window.visualViewport;
    const root = document.documentElement;
    const syncVV = () => {
      const h = vv ? vv.height : window.innerHeight;
      root.style.setProperty('--ua-vh', Math.round(h) + 'px');
      root.style.setProperty('--ua-vt', Math.round(vv ? vv.offsetTop : 0) + 'px');
      const kb = (window.innerHeight - h) > 140 || (vv && window.innerHeight - vv.height > 140);
      document.body.classList.toggle('ua-kb', !!kb);
    };
    syncVV();
    if (vv) { vv.addEventListener('resize', syncVV); vv.addEventListener('scroll', syncVV); }
    window.addEventListener('resize', syncVV);
    document.addEventListener('gesturestart', noGesture);
    document.addEventListener('gesturechange', noGesture);
    document.addEventListener('wheel', noCtrlWheel, { passive: false });
    document.addEventListener('touchmove', noMultiTouch, { passive: false });
    return () => {
      document.body.classList.remove('ua-body'); document.documentElement.classList.remove('ua-html');
      if (vp && vpWas) vp.setAttribute('content', vpWas);
      if (vv) { vv.removeEventListener('resize', syncVV); vv.removeEventListener('scroll', syncVV); }
      window.removeEventListener('resize', syncVV);
      root.style.removeProperty('--ua-vh'); root.style.removeProperty('--ua-vt'); document.body.classList.remove('ua-kb');
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
