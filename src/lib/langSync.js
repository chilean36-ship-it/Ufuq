// Keeps the student's cabinet language on the server (profiles.preferred_lang), so AI comments on exams are written in
// it on any device, and so that the server (grade-exam) knows it even when a teacher triggers the grading.
import { supabase } from './supabaseClient';

const CODE = { UZ: 'uz', EN: 'en', RU: 'ru', AR: 'ar' };

/** Called when the person picks a language. Never throws: a failed save only means the old language stays on the server. */
export async function saveLangToProfile(lang) {
  const code = CODE[lang];
  if (!code) return;
  try {
    const { data } = await supabase.auth.getUser();
    const uid = data?.user?.id;
    if (!uid) return;
    await supabase.from('profiles').update({ preferred_lang: code }).eq('id', uid);
  } catch (e) { /* offline or signed out: nothing to save */ }
}

/** On load: if the account has no language yet (existing users), store the one already chosen in this browser. */
export async function ensureProfileLang(lang) {
  const code = CODE[lang];
  if (!code) return;
  try {
    const { data } = await supabase.auth.getUser();
    const uid = data?.user?.id;
    if (!uid) return;
    const { data: row } = await supabase.from('profiles').select('preferred_lang').eq('id', uid).maybeSingle();
    if (row && !row.preferred_lang) await supabase.from('profiles').update({ preferred_lang: code }).eq('id', uid);
  } catch (e) { /* ignore */ }
}
