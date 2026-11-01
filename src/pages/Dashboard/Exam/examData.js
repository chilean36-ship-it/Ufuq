import { supabase } from '../../../lib/supabaseClient';

/*
 * Exam results for the Progress page / Home panel / class ranking. Exams are written-only: the percentage is the
 * graded written paper's `total_score` (0–100). The server side lives in supabase/migrations/20261016_written_exams_only.sql
 * (my_written_history(), group_written_ranking()).
 */

/** Every graded written exam the student has taken, oldest first — drives the Progress charts. */
export async function getExamHistory(groupCode, userId) {
  // Only the graded papers of the group that is selected at the top — switching groups switches the results.
  if (!groupCode) return [];
  const { data: exams, error: e1 } = await supabase.from('written_exams').select('id, title').eq('group_code', groupCode);
  if (e1) { console.error('Imtihonlarni olishda xatolik:', e1.message); return []; }
  const titles = {}; (exams || []).forEach((x) => { titles[x.id] = x.title; });
  const ids = Object.keys(titles);
  if (ids.length === 0) return [];
  let q = supabase.from('written_exam_submissions')
    .select('id, exam_id, total_score, submitted_at, started_at').eq('status', 'graded').not('total_score', 'is', null).in('exam_id', ids);
  if (userId) q = q.eq('user_id', userId);
  const { data, error } = await q;
  if (error) { console.error('Natijalarni olishda xatolik:', error.message); return []; }
  return (data || [])
    .map((r) => ({
      id: r.id, title: titles[r.exam_id] || '—', level: null, kind: 'written',
      score: r.total_score, total: 100, pct: Math.max(0, Math.min(100, Math.round(r.total_score))), at: r.submitted_at || r.started_at,
    }))
    .sort((a, b) => new Date(a.at) - new Date(b.at));
}

/** Class ranking by average written-exam score. Returns null if the RPC isn't installed yet. */
export async function fetchGroupRanking(groupCode) {
  const { data, error } = await supabase.rpc('group_written_ranking', { p_group_code: groupCode });
  if (error) { console.error('Reytingni olishda xatolik:', error.message); return null; }
  return (data || []).map((r) => ({ userId: r.user_id, name: r.name || '—', avg: r.avg_pct, taken: r.exams_taken, rank: r.rank }));
}
