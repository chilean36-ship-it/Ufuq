import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import Loader from './Loader';
import { clearCachedRole, getSessionAndRole, homeRoute, isOAuthCallback, ROLE_PAGES } from '../lib/auth';
import { AuthContext } from '../context/AuthContext';
import NameGate from './NameGate';

/**
 * Unified Supabase Auth + RBAC guard (port of auth-guard.js).
 *   - No session               -> /index
 *   - role === 'admin'         -> always allowed (bypasses requiredRole)
 *   - role !== requiredRole    -> redirected to that role's own page
 *   - role === requiredRole    -> children render
 * Nothing sensitive renders until the check has finished.
 */
export default function RequireRole({ role: requiredRole, children }) {
  const [state, setState] = useState({ status: 'checking', auth: null, redirect: null });
  const { pathname } = useLocation();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let result;
      try {
        // Never hang on a blank screen if the network/Supabase doesn't answer.
        result = await Promise.race([
          getSessionAndRole(),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000)),
        ]);
      } catch (e) { result = null; }
      if (cancelled) return;
      if (!result) { clearCachedRole(); return setState({ status: 'redirect', auth: null, redirect: ROLE_PAGES.login }); }
      const auth = { user: result.user, role: result.role, fullName: result.full_name };
      // Super admin (main admin) never lands in the student panel: /dashboard sends them to the teacher panel.
      // admin_tier undefined = tier unknown (cached-role fallback) -> keep the old behaviour.
      const isSuperAdmin = result.role === 'admin' && result.admin_tier !== undefined && result.admin_tier !== 'standard';
      if (requiredRole === 'student' && isSuperAdmin) {
        return setState({ status: 'redirect', auth: null, redirect: homeRoute('admin', result.admin_tier) });
      }
      // An admin who arrives on the bare "/" (e.g. Google / the email link sending the visitor to the site root instead of /index)
      // is sent to their own panel. An ordinary admin can still open /dashboard on purpose from the admin sidebar.
      if (requiredRole === 'student' && result.role === 'admin' && (pathname === '/' || isOAuthCallback())) {
        return setState({ status: 'redirect', auth: null, redirect: homeRoute('admin', result.admin_tier) });
      }
      if (result.role === 'admin' || result.role === requiredRole) {
        return setState({ status: 'ok', auth, redirect: null });
      }
      setState({ status: 'redirect', auth, redirect: ROLE_PAGES[result.role] || ROLE_PAGES.login });
    })();
    return () => { cancelled = true; };
  }, [requiredRole]);

  if (state.status === 'checking') return <Loader />;
  if (state.status === 'redirect') return <Navigate to={state.redirect} replace />;
  return <AuthContext.Provider value={state.auth}><NameGate>{children}</NameGate></AuthContext.Provider>;
}
