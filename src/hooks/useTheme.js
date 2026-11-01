import { useCallback, useEffect, useState } from 'react';

const KEY = 'ufuq-theme';
const systemTheme = () => {
  try { return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'; } catch (e) { return 'dark'; }
};

/**
 * Dark/light theme shared by every cabinet page. The stored value is 'dark' | 'light' | 'system'.
 * Returns [theme (resolved), toggleTheme, mode, setMode] — older callers only use the first two.
 */
export function useTheme() {
  const [mode, setModeState] = useState(() => {
    try { return localStorage.getItem(KEY) || 'dark'; } catch (e) { return 'dark'; }
  });
  const [sys, setSys] = useState(systemTheme);
  const theme = mode === 'system' ? sys : mode;

  useEffect(() => {
    if (mode !== 'system' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const on = () => setSys(mq.matches ? 'light' : 'dark');
    on();
    if (mq.addEventListener) mq.addEventListener('change', on); else mq.addListener(on);
    return () => { if (mq.removeEventListener) mq.removeEventListener('change', on); else mq.removeListener(on); };
  }, [mode]);

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);

  const setMode = useCallback((next) => {
    try { localStorage.setItem(KEY, next); } catch (e) { /* ignore */ }
    setModeState(next);
  }, []);
  const toggleTheme = useCallback(() => setMode(theme === 'light' ? 'dark' : 'light'), [theme, setMode]);

  return [theme, toggleTheme, mode, setMode];
}
