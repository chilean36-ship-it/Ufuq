/* ============================================================
   Ufuq — Supabase client (shared across the whole app)
   Project ID: ldbthwpikixtykwmvudy
   Only the public (publishable) key belongs in the browser.
   ============================================================ */
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://ldbthwpikixtykwmvudy.supabase.co';
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_872FZikCbCvaFfeao1azmQ_20FnUjJy';

// Bitta global client — barcha sahifalar shundan foydalanadi
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Same name the old inline scripts used, so ported code reads identically.
export const supabaseClient = supabase;
export default supabase;
