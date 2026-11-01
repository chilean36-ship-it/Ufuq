import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ufuqGetSession } from '../lib/auth';
import Loader from './Loader';
import { AuthContext } from '../context/AuthContext';

/**
 * "Any signed-in user" guard (port of ufuqRequireAuth). No session -> /index.
 * Renders nothing until the session check has finished.
 */
export default function RequireAuth({ children }) {
  const [state, setState] = useState({ status: 'checking', user: null });

  useEffect(() => {
    let cancelled = false;
    ufuqGetSession().then((session) => {
      if (cancelled) return;
      setState(session ? { status: 'ok', user: session.user } : { status: 'redirect', user: null });
    });
    return () => { cancelled = true; };
  }, []);

  if (state.status === 'checking') return <Loader />;
  if (state.status === 'redirect') return <Navigate to="/index" replace />;
  return <AuthContext.Provider value={{ user: state.user, role: null, fullName: null }}>{children}</AuthContext.Provider>;
}
