import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import useLiveRefresh from './liveRefresh';

/**
 * The code a student types to join a group is group_access_codes.code — NOT the internal groups.code.
 * `joinCodes[groupCode]` → that code, or undefined while loading / when the group has none. There is NO fallback
 * to the internal group code: join_group() only accepts the 7-character access code, so showing the internal
 * 5-digit code would be a code students can never use.
 * Re-reads every few seconds (silently) so a changed code shows up without a page reload.
 */
export default function useJoinCodes(groupCodes) {
  const key = (groupCodes || []).join(',');
  const [joinCodes, setJoinCodes] = useState({});
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const codes = key ? key.split(',') : [];
    if (!codes.length) { setJoinCodes({}); setLoaded(true); return; }
    const { data, error } = await supabase.from('group_access_codes').select('code, group_code').in('group_code', codes);
    if (error) { setLoaded(true); return; }
    const map = {};
    (data || []).forEach((r) => { map[r.group_code] = r.code; });
    setJoinCodes((cur) => (JSON.stringify(cur) === JSON.stringify(map) ? cur : map));
    setLoaded(true);
  }, [key]);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load);
  return { joinCodes, loaded, reload: load };
}
