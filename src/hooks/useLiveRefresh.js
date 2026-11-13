import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

let lastTouch = Date.now();
if (typeof window !== 'undefined') {
  const touch = () => { lastTouch = Date.now(); };
  ['pointerdown', 'keydown', 'touchstart', 'scroll'].forEach((e) => window.addEventListener(e, touch, { passive: true, capture: true }));
}

/**
 * Keeps a view's numbers in step with the database while it is on screen.
 *
 *  - Supabase Realtime: any insert/update/delete on the listed tables (optionally filtered) triggers `refresh`.
 *  - Safety nets, in case Realtime isn't enabled for a table: refresh when the tab becomes visible again,
 *    when the window regains focus, and every `interval` ms while the tab is visible.
 *
 * `tables` is a list of `{ table, filter? }`, e.g. `{ table: 'tasks', filter: 'group_code=eq.ABC' }`.
 * Bursts of events are coalesced into one refresh (400 ms debounce).
 */
export default function useLiveRefresh(refresh, tables, { enabled = true, interval = 5000 } = {}) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const key = JSON.stringify(tables);

  useEffect(() => {
    if (!enabled) return undefined;
    let timer = null;
    const run = () => {
      clearTimeout(timer);
      timer = setTimeout(() => refreshRef.current && refreshRef.current(), 400);
    };

    let channel = supabase.channel('home-live-' + Math.random().toString(36).slice(2, 9));
    JSON.parse(key).forEach(({ table, filter }) => {
      const cfg = { event: '*', schema: 'public', table };
      if (filter) cfg.filter = filter;
      channel = channel.on('postgres_changes', cfg, run);
    });
    channel.subscribe();

    const onVisible = () => { if (document.visibilityState === 'visible') run(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', run);
    // Safety-net poll: jittered (devices never line up), 4x slower while the person is idle. Realtime does the real work.
    let pollTimer = 0; let stopped = false;
    const pollNext = () => {
      const idle = Date.now() - lastTouch > 90000;
      const base = Math.max(interval, 12000) * (idle ? 4 : 1);
      pollTimer = setTimeout(() => { if (stopped) return; if (document.visibilityState === 'visible') run(); pollNext(); }, base * (0.85 + Math.random() * 0.3));
    };
    pollNext();
    const poll = { stop: () => { stopped = true; clearTimeout(pollTimer); } };

    return () => {
      clearTimeout(timer);
      poll.stop();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', run);
      supabase.removeChannel(channel);
    };
  }, [enabled, key, interval]);
}
