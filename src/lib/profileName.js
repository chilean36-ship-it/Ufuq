import { useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';

/**
 * The display name has two copies: the `profiles.full_name` column (the AUTHORITY) and the auth user's metadata.
 * saveFullName() only reports success once the profiles row holds the new name, so the row always wins; the metadata
 * copy is just a fallback for accounts without a row yet. (A stale metadata copy must never bring an old name back.)
 */
export function resolveFullName(user, rowName) {
  const m = (user && user.user_metadata) || {};
  return rowName || m.full_name || null;
}

/** The session's user as the auth client knows it right now (a `user` object held in React state can be stale after an edit). */
export async function getFreshUser(fallback) {
  try {
    const { data } = await supabase.auth.getSession();
    return (data && data.session && data.session.user) || fallback || null;
  } catch (e) {
    return fallback || null;
  }
}

/** Collapse whitespace the same way the database does (set_my_name). */
export function cleanName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

const SYNC_EVENT = 'ufuq:name';
const SYNC_KEY = 'ufuq-name-sync';

/** Tell every open panel / tab that this account's display name just changed (same tab: window event, other tabs: storage event). */
export function announceName(uid, name) {
  if (!uid || !name) return;
  try { localStorage.setItem('ufuq-profile-name', name); } catch (e) { /* storage blocked */ }
  try { window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { uid, name } })); } catch (e) { /* ignore */ }
  try { localStorage.setItem(SYNC_KEY, JSON.stringify({ uid, name, t: Date.now() })); } catch (e) { /* storage blocked */ }
}

/**
 * Keeps a panel's copy of the signed-in user's name current: follows a rename made on the Profile page, in another
 * panel, in another tab, or on another device (auth metadata change). `apply(name)` is called with the new name.
 */
export function useLiveName(uid, apply) {
  const ref = useRef(apply);
  ref.current = apply;
  useEffect(() => {
    if (!uid) return undefined;
    const take = (n) => { if (n) ref.current(n); };
    const onEvt = (e) => { const d = e && e.detail; if (d && d.uid === uid) take(d.name); };
    const onStorage = (e) => {
      if (e.key !== SYNC_KEY || !e.newValue) return;
      try { const d = JSON.parse(e.newValue); if (d && d.uid === uid) take(d.name); } catch (x) { /* ignore */ }
    };
    window.addEventListener(SYNC_EVENT, onEvt);
    window.addEventListener('storage', onStorage);
    let sub = null;
    try {
      const res = supabase.auth.onAuthStateChange((event, session) => {
        if (event !== 'USER_UPDATED' || !session || !session.user || session.user.id !== uid) return;
        const m = session.user.user_metadata || {};
        if (m.profile_name_set && m.full_name) take(m.full_name);
      });
      sub = res && res.data && res.data.subscription;
    } catch (e) { /* ignore */ }
    return () => {
      window.removeEventListener(SYNC_EVENT, onEvt);
      window.removeEventListener('storage', onStorage);
      if (sub && sub.unsubscribe) sub.unsubscribe();
    };
  }, [uid]);
}

/**
 * Persist a new name for good, everywhere at once. The database function `set_my_name` writes it to
 * profiles.full_name and to every denormalised copy (group_members, chat messages / reactions / read marks,
 * 1:1 slots); the auth metadata copy is flagged with `profile_name_set`. The saved value is READ BACK from
 * profiles, and if the database does not hold the new name the call throws (NAME_NOT_SAVED) instead of pretending
 * it worked — otherwise the old name would come back on the next refresh. On success every open panel is told.
 */
export async function saveFullName(user, rawName) {
  const name = cleanName(rawName);
  const uid = (user && user.id) || null;
  let rowSaved = false;
  try {
    const { error: rpcErr } = await supabase.rpc('set_my_name', { p_name: name });
    if (rpcErr) throw rpcErr;
  } catch (e) {
    if (e && /INVALID_NAME/.test(e.message || '')) throw new Error('INVALID_NAME');
    console.warn('set_my_name failed, falling back to a direct profiles update:', e && e.message);
    if (uid) {
      try { await supabase.from('profiles').update({ full_name: name }).eq('id', uid); } catch (x) { /* verified below */ }
    }
  }
  if (uid) {
    try {
      const { data: row } = await supabase.from('profiles').select('full_name').eq('id', uid).maybeSingle();
      rowSaved = !!row && row.full_name === name;
    } catch (e) { rowSaved = false; }
  }
  if (!rowSaved) throw new Error('NAME_NOT_SAVED');

  const { error } = await supabase.auth.updateUser({ data: { full_name: name, profile_name_set: true } });
  if (error) console.warn('auth metadata name was not updated:', error.message); // the profiles row (the authority) is already saved
  announceName(uid, name);
  return { rowSaved, name };
}
