import { useCallback, useState } from 'react';

const KEY = 'ufuq-sidebar-collapsed';

/**
 * Desktop "icon-only" sidebar state shared by the student cabinet pages (Dashboard, Profile).
 * The choice is remembered across reloads. On phones the sidebar is an off-canvas drawer and the
 * CSS ignores `.collapsed`, so this only affects wide screens.
 */
export default function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; }
  });

  const set = useCallback((next) => {
    setCollapsed((cur) => {
      const value = typeof next === 'function' ? next(cur) : next;
      try { localStorage.setItem(KEY, value ? '1' : '0'); } catch (e) { /* ignore */ }
      return value;
    });
  }, []);

  const toggle = useCallback(() => set((c) => !c), [set]);
  return [collapsed, toggle, set];
}
