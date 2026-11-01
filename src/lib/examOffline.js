import { supabase } from './supabaseClient';

/*
 * Offline resilience for the written exam. Answers are kept in this browser (localStorage) until the server
 * confirms them, and the outage time is reported to the server so the exam clock is effectively paused.
 */

const KEY = (subId) => 'ufuq-xr-kept:' + subId;

/** Keeps the latest answer texts (question_id → text) on this device. Never throws. */
export function stashWrite(subId, texts) {
  try { localStorage.setItem(KEY(subId), JSON.stringify(texts || {})); } catch (e) { /* storage blocked */ }
}

/** Returns the answers kept on this device for a submission, or null. */
export function stashRead(subId) {
  try {
    const raw = localStorage.getItem(KEY(subId));
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : null;
  } catch (e) { return null; }
}

export function stashClear(subId) {
  try { localStorage.removeItem(KEY(subId)); } catch (e) { /* ignore */ }
}

/**
 * Tells the server how many seconds the student was offline. The server caps the total and shifts the exam
 * clock by the granted amount. Resolves with the seconds granted (0 if none), or null when the server did not
 * confirm, so the caller keeps the seconds and tries again later.
 */
export async function reportOfflineSeconds(subId, seconds) {
  if (!(seconds >= 1)) return 0;
  try {
    const { data, error } = await supabase.rpc('written_exam_offline_credit', {
      p_submission_id: subId,
      p_seconds: Math.min(Math.round(seconds), 900),
    });
    if (error) return null;
    return Number(data) || 0;
  } catch (e) {
    return null;
  }
}
