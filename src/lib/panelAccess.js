import { supabase } from './supabaseClient';

/** Panel -> route. Used by the "Switch panel" menu in the Admin and Teacher top bars. */
export const PANEL_ROUTES = { admin: '/admin', teacher: '/teacher' };

/**
 * Super Admin = profiles.role 'admin' AND admin_tier 'super' (a missing/NULL tier counts as 'super', the same
 * rule the database uses in public.is_super_admin()). A standard admin and a teacher are NOT super admins.
 */
export function isSuperAdmin(role, adminTier) {
  return role === 'admin' && adminTier !== 'standard' && !!adminTier;
}

/**
 * Reads the signed-in user's profile for a panel guard and resolves the admin tier.
 * Resolves to { data, error } where data = { role, full_name, avatar_url, admin_tier } and admin_tier is
 * 'super' | 'standard' for admins and null for everyone else.
 *
 * Fails CLOSED: if the tier cannot be determined (column missing and the RPC fails), an admin is treated as
 * 'standard', so the Switch-panel entry is never shown by mistake. The real enforcement stays server-side
 * (RLS + is_super_admin()); this only decides what the UI offers.
 */
export async function fetchPanelProfile(userId) {
  // Right after a Google sign-in the very first read can fail for a moment: retry before giving up.
  let last = { data: null, error: new Error('no profile') };
  for (let attempt = 0; attempt < 4; attempt++) {
    last = await fetchPanelProfileOnce(userId);
    if (last.data) return last;
    if (attempt < 3) await new Promise((r) => setTimeout(r, 450 * (attempt + 1)));
  }
  return last;
}

async function fetchPanelProfileOnce(userId) {
  let tierKnown = true;
  let { data, error } = await supabase.from('profiles').select('role, full_name, avatar_url, admin_tier').eq('id', userId).single();
  if (error) { // admin_tier column not created yet (migration pending)
    tierKnown = false;
    ({ data, error } = await supabase.from('profiles').select('role, full_name, avatar_url').eq('id', userId).single());
  }
  if (error || !data) return { data: null, error: error || new Error('no profile') };

  let adminTier = null;
  if (data.role === 'admin') {
    if (tierKnown) {
      adminTier = data.admin_tier === 'standard' ? 'standard' : 'super';
    } else {
      try {
        const res = await supabase.rpc('is_super_admin');
        adminTier = !res.error && res.data === true ? 'super' : 'standard';
      } catch (e) { adminTier = 'standard'; }
    }
  }
  return { data: { ...data, admin_tier: adminTier }, error: null };
}

/**
 * Fresh server-side check right before a panel switch (the role may have been changed since the page loaded).
 * Asks public.is_super_admin() — the same function the RLS policies rely on. Fails CLOSED on any error.
 */
export async function verifySuperAdmin() {
  try {
    const { data, error } = await supabase.rpc('is_super_admin');
    return !error && data === true;
  } catch (e) { return false; }
}
