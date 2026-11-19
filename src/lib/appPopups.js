import { supabase } from './supabaseClient';

/**
 * "What's new" pop-ups for the Ufuq app (table app_popups, written by the super admin on Messages > App pop-up).
 * A pop-up is shown once per student: the seen list lives in app_popup_seen (so it follows the account across devices)
 * and, as a safety net, in localStorage. If the tables are not installed yet nothing is shown and nothing breaks.
 */
const SEEN_KEY = 'ufuq-popups-seen';
const localSeen = () => { try { return JSON.parse(localStorage.getItem(SEEN_KEY)) || []; } catch (e) { return []; } };

export async function fetchPendingPopup(userId) {
  if (!userId) return null;
  try {
    const { data, error } = await supabase.from('app_popups')
      .select('id, title, body, image_url, cta_label, cta_link, group_code, created_at')
      .eq('is_active', true).order('created_at', { ascending: false }).limit(10);
    if (error || !data || !data.length) return null;
    const seen = new Set(localSeen());
    try {
      const r = await supabase.from('app_popup_seen').select('popup_id').eq('user_id', userId);
      if (!r.error && r.data) r.data.forEach((x) => seen.add(x.popup_id));
    } catch (e) { /* the local list is enough */ }
    return data.find((p) => !seen.has(p.id)) || null;
  } catch (e) { return null; }
}

export async function markPopupSeen(id, userId) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...new Set([...localSeen(), id])].slice(-50))); } catch (e) { /* storage blocked */ }
  try { await supabase.from('app_popup_seen').upsert({ popup_id: id, user_id: userId }, { onConflict: 'popup_id,user_id', ignoreDuplicates: true }); } catch (e) { /* best effort */ }
}
