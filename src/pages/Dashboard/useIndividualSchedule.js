import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

/** Local calendar date as YYYY-MM-DD (port of isoDateOf). */
export function isoDateOf(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/**
 * "Individual" (1:1) groups — the student's own slot + the day's queue.
 * Reads the safe views `individual_sessions_for_student` and `group_slots_for_student` (they never expose the
 * teacher-only `note` column) and refetches whenever the teacher's panel broadcasts `slots_changed` on
 * the `group_slots:<code>` realtime channel. Port of loadIndividualScheduleData / subscribeIndividualRealtime.
 */
export function useIndividualSchedule(groupCode, enabled) {
  const [sessions, setSessions] = useState([]); // {id, group_code, session_date, window_start, window_end}
  const [slots, setSlots] = useState([]);       // {id, session_id, group_code, user_id, student_name, start_at, end_at, status}
  const [avatarsByUser, setAvatarsByUser] = useState({});
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!groupCode) return;
    try {
      const [sessRes, slotRes, memRes] = await Promise.all([
        supabase.from('individual_sessions_for_student').select('*').eq('group_code', groupCode).order('session_date'),
        supabase.from('group_slots_for_student').select('*').eq('group_code', groupCode).order('start_at'),
        supabase.from('group_members').select('user_id, avatar_url').eq('group_code', groupCode),
      ]);
      if (sessRes.error) throw sessRes.error;
      if (slotRes.error) throw slotRes.error;
      if (memRes.error) throw memRes.error;
      const avatars = {};
      (memRes.data || []).forEach((m) => { avatars[m.user_id] = m.avatar_url || null; });
      setSessions(sessRes.data || []);
      setSlots(slotRes.data || []);
      setAvatarsByUser(avatars);
    } catch (err) {
      console.error('Individual schedule load failed:', err.message);
      setSessions([]);
      setSlots([]);
    }
    setLoaded(true);
  }, [groupCode]);

  useEffect(() => {
    setSessions([]); setSlots([]); setLoaded(false);
    if (!enabled || !groupCode) return undefined;
    load();
    const channel = supabase
      .channel('group_slots:' + groupCode)
      .on('broadcast', { event: 'slots_changed' }, () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [enabled, groupCode, load]);

  return { sessions, slots, avatarsByUser, loaded };
}
