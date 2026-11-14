import { useCallback, useEffect, useState } from 'react';
import useLiveRefresh from './liveRefresh';
import { supabase } from './supabaseClient';
import { tashkentDateKey, isExamDay } from './tzTime';

export { tashkentDateKey, isExamDay };

/**
 * Exam day = no lesson. A published exam with an opening time (written_exams.open_at) takes the place of the group's
 * weekly lesson on that Tashkent calendar day. The server (exam_days(), migration 20261203_exam_open_at.sql) gives the dates;
 * every schedule helper takes the same `examDays` argument: an array (or Set) of 'YYYY-MM-DD' Tashkent dates.
 */

/**
 * { groupCode: ['YYYY-MM-DD', ...] } for the given groups (null = every group a staff member may see).
 * Never throws: {} when the server function is not there yet, so lessons simply stay as they were.
 */
export async function fetchExamDays(groupCodes) {
  try {
    const args = Array.isArray(groupCodes) ? { p_groups: groupCodes } : {};
    if (Array.isArray(groupCodes) && groupCodes.length === 0) return {};
    const { data, error } = await supabase.rpc('exam_days', args);
    if (error || !Array.isArray(data)) return {};
    const out = {};
    data.forEach((r) => { if (r && r.group_code && r.day) (out[r.group_code] = out[r.group_code] || []).push(String(r.day).slice(0, 10)); });
    return out;
  } catch (e) { return {}; }
}

/** Staff panels: { groupCode: ['YYYY-MM-DD', ...] } for every group the signed-in teacher / admin can see; refreshes quietly. */
export function useExamDays() {
  const [map, setMap] = useState({});
  const load = useCallback(async () => {
    const next = await fetchExamDays(null);
    setMap((cur) => (JSON.stringify(cur) === JSON.stringify(next) ? cur : next));
  }, []);
  useEffect(() => { load(); }, [load]);
  useLiveRefresh(() => load(), 60000);
  return map;
}
