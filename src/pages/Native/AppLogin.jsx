import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import tokensCss from '../../styles/tokens.css?inline';
import shellCss from '../../styles/app-shell.css?inline';
import PageStyle from '../../components/PageStyle';
import Loader from '../../components/Loader';
import LangSelect from '../../components/LangSelect';
import AuthModal from '../Landing/AuthModal';
import { useI18n } from '../../context/I18nContext';
import { getSessionAndRole, hasStoredSession, homeRoute, isOAuthCallback, readCachedRole, ROLE_PAGES, storedSessionUserId } from '../../lib/auth';
import { afterAuthDestination } from '../../lib/payIntent';
import { LEGAL_DOCS, legalUi } from '../Legal/legalContent';

/**
 * The Android app's first screen (replaces the marketing landing page, which only makes sense in a browser).
 *   - signed in before  -> straight to the cabinet (the session is kept on the device, so this is automatic)
 *   - not signed in     -> a plain login screen; after signing in the user is routed by role, as on the site
 */
export default function AppLogin() {
  const { lang } = useI18n();
  const navigate = useNavigate();
  const [mode, setMode] = useState('signin');
  const [checking, setChecking] = useState(() => hasStoredSession() || isOAuthCallback());

  useEffect(() => {
    let cancelled = false;
    const cached = readCachedRole();
    const uid = storedSessionUserId();
    // Fast path: a role cached for this very user -> open the cabinet at once (the cabinet re-checks session and role itself).
    if (uid && cached && cached.uid === uid && ROLE_PAGES[cached.role]) {
      navigate(afterAuthDestination(cached.role, homeRoute(cached.role, cached.tier)), { replace: true });
      return undefined;
    }
    (async () => {
      let result = null;
      try { result = await getSessionAndRole(); } catch (e) { result = null; }
      if (cancelled) return;
      if (!result) { setChecking(false); return; }
      navigate(afterAuthDestination(result.role, homeRoute(result.role, result.admin_tier)), { replace: true });
    })();
    return () => { cancelled = true; };
  }, [navigate]);

  if (checking) return <Loader />;

  const ui = legalUi(lang);
  return (
    <>
      <PageStyle css={tokensCss} />
      <PageStyle css={shellCss} />
      <div style={{ position: 'fixed', inset: 0, background: 'radial-gradient(560px 360px at 50% 28%, rgba(201,162,75,.14), transparent 70%), var(--bg, #121212)' }} />
      <div style={{ position: 'fixed', top: 'calc(14px + env(safe-area-inset-top))', right: 14, zIndex: 1001 }}><LangSelect /></div>
      <AuthModal open embedded mode={mode} onModeChange={setMode} onClose={() => {}} />
      <nav style={{ position: 'fixed', left: 0, right: 0, bottom: 'calc(10px + env(safe-area-inset-bottom))', zIndex: 1001, display: 'flex', justifyContent: 'center', gap: 14, fontSize: 12, flexWrap: 'wrap', padding: '0 12px' }}>
        {LEGAL_DOCS.slice(0, 2).map((d) => <Link key={d} to={`/${d}`} style={{ color: 'var(--text-muted, #a8a29b)' }}>{ui.docs[d]}</Link>)}
      </nav>
    </>
  );
}
