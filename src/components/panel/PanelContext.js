import { createContext, useContext } from 'react';

/**
 * Shared state of the Admin / Teacher panels (replaces the closure variables `myGroups`, `currentGroupCode`,
 * `currentUser`, `toast()`, `askConfirm()` and `window.t()` of the old inline scripts).
 */
export const PanelContext = createContext(null);

export function usePanel() {
  const ctx = useContext(PanelContext);
  if (!ctx) throw new Error('usePanel must be used inside a panel shell (<Admin> / <Teacher>)');
  return ctx;
}
