// One place for the exam scoring rules. Keep in sync with supabase/migrations/20261107_exam_scoring_150.sql.
// Per-question scores and submissions.total_score are a 0..100 percentage; points = percentage scaled to the exam's max.
export const MIDTERM_MAX = 50;
export const FINAL_MAX = 100;
export const LEVEL_MAX = MIDTERM_MAX + FINAL_MAX;   // 150
export const PASS_MARK = LEVEL_MAX / 2;             // 75 (50 %)

/** Max points of one exam: midterm 50, final 100, an exam without a kind (custom) 100. */
export function examMax(kind) { return kind === 'midterm' ? MIDTERM_MAX : FINAL_MAX; }

/** Percentage (0..100) -> points of that exam, one decimal. null stays null. */
export function examPoints(totalScore, kind) {
  if (totalScore === null || totalScore === undefined || totalScore === '') return null;
  const pct = Math.max(0, Math.min(100, Number(totalScore) || 0));
  return Math.round(pct * examMax(kind) / 10) / 10;
}

/** 36 -> "36", 36.5 -> "36.5" */
export function fmtPts(v) { return v === null || v === undefined ? '\u2014' : String(Math.round(Number(v) * 10) / 10); }
