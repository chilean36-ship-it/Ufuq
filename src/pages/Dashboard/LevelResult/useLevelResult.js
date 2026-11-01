import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import useLiveRefresh from '../../../lib/liveRefresh';

const COLS = 'id, from_level, to_level, outcome, total_points, midterm_points, final_points, from_group_name, to_group_name, to_group, reason, created_at';

/**
 * The newest level result the student has not seen yet (level_transitions.seen_at is null).
 * `dismiss()` marks it seen on the server (which also restarts the level's exams after a fail on the same level).
 */
export default function useLevelResult(userId, enabled = true) {
  const [item, setItem] = useState(null);
  const closing = useRef(null);

  const load = useCallback(async () => {
    if (!userId || !enabled) return;
    const { data, error } = await supabase.from('level_transitions').select(COLS)
      .eq('user_id', userId).is('seen_at', null).order('created_at', { ascending: false }).limit(1);
    if (error) return;
    const next = (data && data[0]) || null;
    if (next && next.id === closing.current) return;      // just closed: do not flash it again before the server confirms
    setItem((cur) => (cur && next && cur.id === next.id ? cur : next));
  }, [userId, enabled]);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(() => load());

  const dismiss = useCallback(async () => {
    if (!item) return;
    closing.current = item.id;
    const id = item.id;
    setItem(null);
    try { await supabase.rpc('ack_level_transition', { p_id: id }); } catch (e) { /* the window comes back next visit */ }
  }, [item]);

  return { item, dismiss };
}
