import { useSyncExternalStore } from 'react';
import { supabase } from './supabaseClient';

/**
 * Who is online right now (site or app, student / teacher / admin), for the green dot in front of an avatar in the group chat.
 * One Realtime presence room shared by everybody who is signed in; each person announces only their account id.
 * A person counts as online while a page of Ufuq is open and visible, and drops out when the page is hidden or closed.
 */
const ROOM = 'ufuq-presence';
let channel = null;
let me = null;
let online = new Set();
const subs = new Set();
const emit = () => subs.forEach((f) => { try { f(); } catch (e) { /* ignore */ } });

function sync() {
  if (!channel) return;
  online = new Set(Object.keys(channel.presenceState()));
  emit();
}

function announce() {
  if (!channel || !me) return;
  if (document.visibilityState === 'visible') channel.track({ at: Date.now() }).catch(() => {});
  else channel.untrack().catch(() => {});
}

function stop() {
  if (channel) { try { supabase.removeChannel(channel); } catch (e) { /* ignore */ } }
  channel = null; me = null; online = new Set(); emit();
}

function start(user) {
  if (!user || (channel && me === user.id)) return;
  stop();
  me = user.id;
  channel = supabase.channel(ROOM, { config: { presence: { key: me } } });
  channel.on('presence', { event: 'sync' }, sync);
  channel.subscribe((status) => { if (status === 'SUBSCRIBED') announce(); });
}

try {
  supabase.auth.getSession().then(({ data }) => { if (data && data.session) start(data.session.user); }).catch(() => {});
  supabase.auth.onAuthStateChange((event, session) => { if (session && session.user) start(session.user); else stop(); });
  document.addEventListener('visibilitychange', announce);
  window.addEventListener('pagehide', () => { if (channel) channel.untrack().catch(() => {}); });
} catch (e) { /* presence is a nicety: never break the app */ }

/** Set of account ids that are online now. */
export function useOnline() {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => online, () => online);
}
