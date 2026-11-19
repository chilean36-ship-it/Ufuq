// One place for the exam scoring rules. Keep in sync with supabase/migrations/20261205_exam_v2_pop_quizzes.sql.
// Per-question scores and submissions.total_score are a 0..100 percentage; points = percentage scaled to the exam's max.
// A level has FOUR exams: pop quiz 1 (25) + pop quiz 2 (50) + midterm (25) + final (50) = 150. The two pop quizzes are the
// teacher's surprise tests: they are closed until a teacher opens them. The pass mark is half of the points that were open
// to the student (150 -> 75; with the pop quizzes still closed 75 -> 37.5).
export const POP1_MAX = 25;
export const POP2_MAX = 50;
export const MIDTERM_MAX = 25;
export const FINAL_MAX = 50;
export const LEVEL_MAX = POP1_MAX + POP2_MAX + MIDTERM_MAX + FINAL_MAX;   // 150
export const PASS_MARK = LEVEL_MAX / 2;                                   // 75 (50 %)

const MAX_BY_KIND = { pop1: POP1_MAX, pop2: POP2_MAX, midterm: MIDTERM_MAX, final: FINAL_MAX };
export const isPopKind = (kind) => kind === 'pop1' || kind === 'pop2';

/** Max points of one exam: pop quiz 1 = 25, pop quiz 2 = 50, midterm 25, final 50, an exam without a kind (custom) 100. */
export function examMax(kind) { return MAX_BY_KIND[kind] || 100; }

/** Percentage (0..100) -> points of that exam, one decimal. null stays null. */
export function examPoints(totalScore, kind) {
  if (totalScore === null || totalScore === undefined || totalScore === '') return null;
  const pct = Math.max(0, Math.min(100, Number(totalScore) || 0));
  return Math.round(pct * examMax(kind) / 10) / 10;
}

/** 36 -> "36", 36.5 -> "36.5" */
export function fmtPts(v) { return v === null || v === undefined ? '—' : String(Math.round(Number(v) * 10) / 10); }
