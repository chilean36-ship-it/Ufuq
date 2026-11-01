import { createContext, useContext } from 'react';

/** Filled by <RequireRole>. Replaces the old window.ufuqCurrentUser / window.ufuqCurrentRole globals. */
export const AuthContext = createContext({ user: null, role: null, fullName: null });
export const useAuth = () => useContext(AuthContext);
