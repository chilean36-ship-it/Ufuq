import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';

/**
 * Notifications state — port of loadNotificationsFromServer() / markNotificationRead() /
 * mark-all-read / subscribeToNotifications() in dashboard.html. The last 50 rows for the signed-in user
 * (RLS scopes them), plus a realtime INSERT subscription so new ones arrive instantly.
 * `enabled` is the "paid account" gate: notifications are a paid feature, so nothing is fetched otherwise.
 */
export function useNotifications(userId, enabled) {
  const [items, setItems] = useState([]);
  const itemsRef = useRef([]);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const commit = useCallback((next) => { itemsRef.current = next; if (mounted.current) setItems(next); }, []);

  const refresh = useCallback(async () => {
    if (!userId || !enabled) return;
    const { data, error } = await supabase
      .from('notifications')
      .select('id, kind, title, body, link, is_read, created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) { console.error('Bildirishnomalarni olishda xatolik:', error.message); return; }
    const next = (data || []).map((n) => ({
      id: n.id, type: n.kind, title: n.title, text: n.body, link: n.link,
      time: new Date(n.created_at).getTime(), read: n.is_read,
    }));
    if (JSON.stringify(next) !== JSON.stringify(itemsRef.current)) commit(next); // unchanged → no re-render
  }, [userId, enabled, commit]);

  // Initial load + realtime: new rows for this user arrive instantly.
  useEffect(() => {
    if (!userId || !enabled) { commit([]); return undefined; }
    refresh();
    const poll = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 5000); // silent safety net next to Realtime
    const channel = supabase
      .channel('notifications-' + userId)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + userId },
        () => { refresh(); })
      .subscribe();
    return () => { clearInterval(poll); supabase.removeChannel(channel); };
  }, [userId, enabled, refresh, commit]);

  const markRead = useCallback(async (id) => {
    const n = itemsRef.current.find((x) => String(x.id) === String(id));
    if (!n || n.read) return;
    commit(itemsRef.current.map((x) => (x === n ? { ...x, read: true } : x)));
    const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    if (error) console.error('Bildirishnomani belgilashda xatolik:', error.message);
  }, [commit]);

  const markAllRead = useCallback(async () => {
    const unreadIds = itemsRef.current.filter((n) => !n.read).map((n) => n.id);
    commit(itemsRef.current.map((n) => ({ ...n, read: true })));
    if (unreadIds.length) {
      const { error } = await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds);
      if (error) console.error("Barchasini o'qilgan deb belgilashda xatolik:", error.message);
    }
  }, [commit]);

  const unread = items.filter((n) => !n.read).length;
  return { items, unread, refresh, markRead, markAllRead };
}
