import { useEffect, useRef } from 'react';

/*
 * Profile photo sync, the same way names are synced (see profileName.js):
 * when the signed-in user changes or removes their photo, every open panel of this tab
 * (student dashboard, teacher and admin panels, profile page) gets the new value at once,
 * and other tabs of the same browser get it through the `storage` event.
 * Other users see it through group_members, which the database keeps in step (see the
 * avatars migration: profiles.avatar_url → group_members.avatar_url trigger).
 */
const SYNC_EVENT = 'ufuq:avatar';
const SYNC_KEY = 'ufuq-avatar-sync';

/** Tell every open panel / tab that this account's photo changed. `url` = new public URL, or null when removed. */
export function announceAvatar(uid, url) {
  if (!uid) return;
  const value = url || null;
  try {
    if (value) localStorage.setItem('ufuq-avatar:' + uid, value);
    else localStorage.removeItem('ufuq-avatar:' + uid);
  } catch (e) { /* storage blocked */ }
  try { window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { uid, url: value } })); } catch (e) { /* ignore */ }
  try { localStorage.setItem(SYNC_KEY, JSON.stringify({ uid, url: value, t: Date.now() })); } catch (e) { /* storage blocked */ }
}

/** Keeps a panel's copy of the signed-in user's photo current. `apply(url | null)` is called on every change. */
export function useLiveAvatar(uid, apply) {
  const ref = useRef(apply);
  ref.current = apply;
  useEffect(() => {
    if (!uid) return undefined;
    const onEvt = (e) => {
      const d = e && e.detail;
      if (d && d.uid === uid && ref.current) ref.current(d.url || null);
    };
    const onStorage = (e) => {
      if (e.key !== SYNC_KEY || !e.newValue) return;
      try {
        const d = JSON.parse(e.newValue);
        if (d && d.uid === uid && ref.current) ref.current(d.url || null);
      } catch (x) { /* ignore */ }
    };
    window.addEventListener(SYNC_EVENT, onEvt);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(SYNC_EVENT, onEvt);
      window.removeEventListener('storage', onStorage);
    };
  }, [uid]);
}
