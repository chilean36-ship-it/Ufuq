import { supabase } from './supabaseClient';

/** Role -> its home route. Admin has no fixed home; it may open any of them. */
export const ROLE_PAGES = { teacher: '/teacher', student: '/dashboard', admin: '/admin', login: '/index' };

/**
 * Where a signed-in person lands first.
 *   main admin (admin, tier not 'standard') -> teacher panel (can switch to the admin panel from there)
 *   ordinary admin (tier 'standard')        -> admin panel (never the student panel; the student panel stays one click away)
 *   teacher -> teacher panel, student -> student panel
 */
export function homeRoute(role, tier) {
  if (role === 'admin') return tier === 'standard' ? ROLE_PAGES.admin : ROLE_PAGES.teacher;
  return ROLE_PAGES[role] || ROLE_PAGES.login;
}

/** True while the browser has just come back from Google / Apple (the session is still being read from the URL). */
export function isOAuthCallback() {
  try {
    const h = window.location.hash || '';
    const q = window.location.search || '';
    return /(^|[#&])access_token=/.test(h) || /(^|[?&])code=/.test(q);
  } catch (e) { return false; }
}

/* ------------------------------------------------------------------
   "Eslab qolish": oxirgi kirgan foydalanuvchining roli localStorage'da
   saqlanadi, shunda sayt linki ochilganda (tarmoq so'rovini kutmasdan)
   darrov kerakli panelga o'tiladi, login oynasi ko'rinmaydi.
   ------------------------------------------------------------------ */
const ROLE_CACHE_KEY = 'ufuq-last-role';

export function readCachedRole() {
  try {
    const raw = localStorage.getItem(ROLE_CACHE_KEY);
    return raw ? JSON.parse(raw) : null; // { uid, role }
  } catch (e) { return null; }
}
export function writeCachedRole(uid, role, tier) {
  try { if (uid && role) localStorage.setItem(ROLE_CACHE_KEY, JSON.stringify({ uid, role, tier: tier || null })); } catch (e) { /* storage blocked */ }
}
export function clearCachedRole() {
  try { localStorage.removeItem(ROLE_CACHE_KEY); } catch (e) { /* storage blocked */ }
}

/** Saqlangan Supabase sessiyasining foydalanuvchi ID'si (sinxron). Topilmasa null. */
export function storedSessionUserId() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
        const v = JSON.parse(localStorage.getItem(k) || 'null');
        return (v && v.user && v.user.id) || null;
      }
    }
  } catch (e) { /* storage blocked */ }
  return null;
}

/** Brauzerda Supabase sessiyasi saqlanganmi (sinxron, tarmoqsiz tekshiruv). */
export function hasStoredSession() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) return true;
    }
  } catch (e) { /* storage blocked */ }
  return false;
}

// Boshqa tabda yoki sessiya tugaganda chiqib ketilsa — eslab qolingan rol ham o'chadi.
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') clearCachedRole();
});

/**
 * Joriy sessiyani (foydalanuvchi tizimga kirganmi yoki yo'q) tekshiradi.
 * @returns {Promise<import('@supabase/supabase-js').Session|null>}
 */
export async function ufuqGetSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('Session olishda xatolik:', error.message);
    return null;
  }
  return data.session;
}

/**
 * Session + role (from public.profiles) in one call; null when signed out.
 * Profil so'rovi vaqtincha xato bersa (tarmoq uzilishi) foydalanuvchi "chiqib
 * ketgan" hisoblanmaydi: bir marta qayta uriniladi, keyin eslab qolingan rol ishlatiladi.
 */
/** Reads { role, full_name, admin_tier } from profiles, retrying a few times. Null when it cannot be read. Never guesses. */
export async function readProfileRole(userId) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await supabase.from('profiles').select('role, full_name, admin_tier').eq('id', userId).maybeSingle();
    if (res.data && res.data.role) return res.data;
    if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
  }
  return null;
}

export async function getSessionAndRole() {
  const { data } = await supabase.auth.getSession();
  const session = data && data.session;
  if (!session) return null;

  let profile = null;
  for (let attempt = 0; attempt < 2 && !profile; attempt++) {
    const res = await supabase
      .from('profiles')
      .select('role, full_name, admin_tier, status')
      .eq('id', session.user.id)
      .maybeSingle();
    if (res.data) profile = res.data;
    else if (attempt === 0) await new Promise((r) => setTimeout(r, 400));
  }

  if (profile) {
    writeCachedRole(session.user.id, profile.role, profile.admin_tier);
    return { user: session.user, role: profile.role, full_name: profile.full_name, admin_tier: profile.admin_tier, status: profile.status };
  }

  const cached = readCachedRole();
  if (cached && cached.uid === session.user.id) {
    return { user: session.user, role: cached.role, full_name: null, admin_tier: cached.tier || undefined };
  }
  return null;
}

/** Tizimdan chiqish (caller navigates to '/index' afterwards). */
export async function ufuqSignOut(scope) {
  clearCachedRole();
  await supabase.auth.signOut(scope ? { scope } : undefined); // scope: 'global' (every device) | 'others' | 'local'
}
