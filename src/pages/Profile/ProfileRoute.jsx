import Loader from '../../components/Loader';
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { getSessionAndRole, ROLE_PAGES } from '../../lib/auth';
import RequireAuth from '../../components/RequireAuth';
import RequireRole from '../../components/RequireRole';
import NameGate from '../../components/NameGate';
import Dashboard from '../Dashboard/Dashboard';
import Profile from './Profile';

/**
 * `/profile` — students see their profile *inside* the dashboard (same sidebar, topbar and
 * notifications as every other tab); teachers and admins, who have no student cabinet,
 * get the standalone page with a sidebar that fits their role.
 */
export default function ProfileRoute() {
  const [state, setState] = useState({ status: 'checking', role: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let result;
      try { result = await getSessionAndRole(); } catch (e) { result = null; }
      if (cancelled) return;
      setState(result ? { status: 'ok', role: result.role, tier: result.admin_tier } : { status: 'none', role: null });
    })();
    return () => { cancelled = true; };
  }, []);

  if (state.status === 'checking') return <Loader />;
  if (state.status === 'none') return <Navigate to={ROLE_PAGES.login} replace />;
  // Main admin works in the teacher panel (shown as a teacher); an ordinary admin uses the student cabinet.
  const isMainAdmin = state.role === 'admin' && state.tier !== 'standard';
  if (state.role === 'teacher' || isMainAdmin) {
    return <RequireAuth><NameGate><Profile role="teacher" /></NameGate></RequireAuth>;
  }
  return <RequireRole role="student"><Dashboard initialView="profile" /></RequireRole>;
}
