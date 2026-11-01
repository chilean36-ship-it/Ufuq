import { supabase } from '../../../lib/supabaseClient';

/* Written exams — student side. Every write goes through a SECURITY DEFINER RPC (supabase/migrations/20261016_written_exams_only.sql),
   so a student never meets a raw "row-level security" error: the server answers with a clear code instead. */

const MESSAGES = {
  PAYMENT_REQUIRED: "Your access has ended. Renew it in Billing to take exams.",
  LEVEL_MISMATCH: "This exam is for a different level. You can take the exams of your current level only.",
  NOT_IN_GROUP: "This exam is not for your group. Check the group code or ask your teacher.",
  EXAM_NOT_PUBLISHED: "This exam is closed for now. Try again once your teacher opens it.",
  EXAM_DEADLINE_PASSED: "The deadline for this exam has passed. Ask your teacher.",
  EXAM_NOT_FOUND: "Exam not found — it may have been deleted.",
  NOT_AUTHENTICATED: "Your session has expired. Please sign in again.",
  SUBMISSION_NOT_FOUND: "Submission not found. Please refresh the page.",
};

/** Turns a Supabase/Postgres error into text a student can act on. */
export function friendlyExamError(err) {
  const raw = String((err && (err.message || err.details)) || err || '');
  const code = Object.keys(MESSAGES).find((k) => raw.includes(k));
  if (code) return MESSAGES[code];
  if (/row-level security|permission denied/i.test(raw)) return "You are not allowed to do this. Only a student who is a member of the group can take the exam.";
  if (/fetch|network|failed to|timeout/i.test(raw)) return "Connection lost. Check your internet and try again.";
  return raw || "Unknown error. Please try again.";
}

/** Published exams of ONE group (the one the student has selected). Throws on error. */
export async function fetchPublishedWrittenExams(groupCode) {
  let q = supabase.from('written_exams').select('id, title, created_at, group_code, duration_minutes, deadline_at, level, exam_kind').eq('is_published', true);
  if (groupCode) q = q.eq('group_code', groupCode);
  const { data, error } = await q.order('level', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/**
 * The midterm / final exams of MY level, whatever group I sit in - published or not (one copy per level + kind).
 * An unpublished one comes back with is_published=false: the student sees it locked until a teacher / admin opens it.
 * Free (test) accounts and staff get an empty list (they use the group list). Never throws: [] when the server function is missing.
 */
export async function fetchMyLevelExams() {
  try {
    const { data, error } = await supabase.rpc('my_level_exams');
    if (error || !Array.isArray(data)) return [];
    return data;
  } catch (e) { return []; }
}

export async function fetchMySubmissions(userId, examIds) {
  const map = {};
  if (!userId || !examIds.length) return map;
  const { data } = await supabase
    .from('written_exam_submissions').select('*').eq('user_id', userId).in('exam_id', examIds);
  (data || []).forEach((s) => { map[s.exam_id] = s; });
  return map;
}

/** How many questions the student has already answered in each unfinished paper: { submissionId: count }. A failed lookup just means "unknown". */
export async function fetchAnswerCounts(submissionIds) {
  const map = {};
  if (!submissionIds || !submissionIds.length) return map;
  const { data, error } = await supabase.from('written_exam_answers').select('submission_id, answer_text').in('submission_id', submissionIds);
  if (error) return map;
  (data || []).forEach((a) => {
    if (a.answer_text && String(a.answer_text).replace(/\s+/g, '') !== '') map[a.submission_id] = (map[a.submission_id] || 0) + 1;
  });
  return map;
}

/** Deadline extensions the teacher gave ME: { examId: ISO until_at }. Students can read only their own rows. */
export async function fetchMyExtensions(userId, examIds) {
  const map = {};
  if (!userId || !examIds.length) return map;
  const { data } = await supabase.from('written_exam_extensions').select('exam_id, until_at').eq('user_id', userId).in('exam_id', examIds);
  (data || []).forEach((x) => { map[x.exam_id] = x.until_at; });
  return map;
}

/**
 * Question counts per exam. A missing key means "unknown" (not "zero"): the student screens must never
 * conclude \"no questions\" from a failed or permission-blocked lookup. Only a real count is returned.
 */
export async function fetchQuestionCounts(examIds) {
  const counts = {};
  if (!examIds || !examIds.length) return counts;
  // Students cannot read the questions table directly, so the count comes from a server function.
  const { data, error } = await supabase.rpc('written_exam_question_counts', { p_exam_ids: examIds });
  if (!error && Array.isArray(data)) {
    data.forEach((r) => { if (r && r.exam_id != null) counts[r.exam_id] = Number(r.n) || 0; });
    return counts;
  }
  // Function not reachable yet: teachers/admins can still count from the table directly.
  try {
    const res = await supabase.from('written_exam_questions').select('exam_id').in('exam_id', examIds);
    if (!res.error && Array.isArray(res.data)) {
      res.data.forEach((q) => { counts[q.exam_id] = (counts[q.exam_id] || 0) + 1; });
    }
  } catch (e) { /* unknown stays unknown */ }
  return counts;
}

/** Opens (or resumes) the student's paper. Creates the draft the first time; the server checks group + published. */
export async function startExam(examId) {
  const { data, error } = await supabase.rpc('start_written_exam', { p_exam_id: examId });
  if (error) throw new Error(friendlyExamError(error));
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error(MESSAGES.SUBMISSION_NOT_FOUND);
  return row;
}

/** Questions come through an RPC so `criteria_text` never reaches the browser. */
export async function fetchRunnerQuestions(examId) {
  const { data, error } = await supabase.rpc('student_written_exam_questions', { p_exam_id: examId });
  if (error) throw new Error(friendlyExamError(error));
  return data || [];
}

export async function fetchAnswers(submissionId) {
  const { data, error } = await supabase.from('written_exam_answers').select('*').eq('submission_id', submissionId);
  if (error) throw new Error(friendlyExamError(error));
  return data || [];
}

/** Autosave. Resolves false (no error) when the paper was already handed in. Retries once on a network blip. */
export async function saveAnswers(submissionId, rows) {
  const payload = rows.map((r) => ({ question_id: r.question_id, answer_text: r.answer_text || '' }));
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await supabase.rpc('save_written_answers', { p_submission_id: submissionId, p_answers: payload });
    if (!error) return data !== false;
    lastErr = error;
    await new Promise((r) => setTimeout(r, 700));
  }
  throw new Error(friendlyExamError(lastErr));
}

/** "Finish": idempotent, so a double click or an auto-submit racing a click is harmless. */
export async function submitExam(submissionId) {
  const { data, error } = await supabase.rpc('submit_written_exam', { p_submission_id: submissionId });
  if (error) throw new Error(friendlyExamError(error));
  return Array.isArray(data) ? data[0] : data;
}

export async function fetchSubmission(id) {
  const { data } = await supabase.from('written_exam_submissions').select('*').eq('id', id).single();
  return data || null;
}

/**
 * AI grading with patience: the edge function already retries / falls back between models; on top of that the browser
 * tries up to 3 times with growing pauses, so a busy moment never leaves a paper unchecked. Resolves with the function's
 * reply ({ ok, graded, total_score }); throws only if every attempt failed.
 */
export async function gradeExam(submissionId, { attempts = 3, jitter = 0 } = {}) {
  let lastErr = null;
  // a whole group presses "Finish" in the same minute: spread the first requests out a little
  if (jitter > 0) await new Promise((r) => setTimeout(r, Math.random() * jitter));
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await supabase.functions.invoke('grade-exam', { body: { submission_id: submissionId } });
      if (res.error) throw res.error;
      if (res.data && res.data.ok) return res.data;
      lastErr = new Error((res.data && res.data.error) || 'AI check failed');
    } catch (e) { lastErr = e; }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1500 * (i + 1) + Math.random() * 500));
  }
  throw lastErr || new Error('AI check failed');
}

/**
 * Adds the missing languages to AI comments that only exist in Uzbek (results from before comments were written in four languages).
 * Never re-grades and never changes a score. Resolves true when something was translated; never throws.
 */
export async function translateFeedback(submissionId) {
  try {
    const res = await supabase.functions.invoke('grade-exam', { body: { submission_id: submissionId, translate_only: true } });
    if (res.error || !res.data || !res.data.ok) return false;
    return Number(res.data.translated) > 0;
  } catch (e) { return false; }
}

/** Seconds left on the SERVER clock for this draft (null = no time limit). The browser clock is never trusted. */
export async function fetchRemaining(submissionId) {
  const { data, error } = await supabase.rpc('written_exam_remaining', { p_submission_id: submissionId });
  if (error) throw new Error(friendlyExamError(error));
  return data === null || data === undefined ? null : Number(data);
}

/** Starts the exam clock on the server (set once, never reset). Resolves with the seconds left (null = no time limit). */
export async function beginExam(submissionId) {
  const { data, error } = await supabase.rpc('begin_written_exam', { p_submission_id: submissionId });
  if (error) throw new Error(friendlyExamError(error));
  return data === null || data === undefined ? null : Number(data);
}
