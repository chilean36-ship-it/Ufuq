// Exam scoring core: the AI lists the ERRORS of an answer, the SERVER turns them into the score.
// Pure JS (no dependencies): runs in Supabase Edge Functions (Deno) and in Node tests.
//
// Why: the teacher's policy says spelling (imlo) costs exactly 0 points. A prompt rule alone is sometimes ignored by the
// model, so the points of every error whose type is "spelling" or "style" are thrown away here, whatever the model wrote.
//
// Model item: { question_id, score, errors: [{ type, points, note? }], feedback }
//   type: "spelling" | "style"                    -> never costs points
//         "grammar" | "meaning" | "incomplete" | "language"  -> costs `points`

export const FREE_TYPES = ['spelling', 'style'];
export const COSTLY_TYPES = ['grammar', 'meaning', 'incomplete', 'language'];

/** A deduction the model did not itemise this big (or bigger) is trusted as a real deduction. */
export const UNEXPLAINED_LIMIT = 20;

const clamp100 = (n) => Math.max(0, Math.min(100, Math.round(n)));

/** Reads a score the model returned, tolerating "85", 85, "85/100", "85,5". NaN when there is no usable number. */
export function readScore(v) {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return NaN;
  const m = v.match(/-?\d+(?:[.,]\d+)?/);
  return m ? Number(m[0].replace(',', '.')) : NaN;
}

function normType(t) {
  const s = String(t || '').toLowerCase().trim();
  if (/^(spell|orthog|typo|imlo)/.test(s)) return 'spelling';
  if (/^(style|wording|phras|tashkeel|vowel|punct)/.test(s)) return 'style';
  if (/^gramm|^i'?rab|^agree|^syntax/.test(s)) return 'grammar';
  if (/^mean|^wrong|^content|^off/.test(s)) return 'meaning';
  if (/^incomplete|^missing|^length|^short/.test(s)) return 'incomplete';
  if (/^lang|^script/.test(s)) return 'language';
  return 'unknown';
}

/**
 * Final score (0-100) of one item.
 *  - no usable `errors` array  -> the model's own score (older behaviour, nothing is lost);
 *  - otherwise                 -> 100 minus the points of the costly errors only (spelling / style cost 0);
 *  - guard: if the model's own score is far lower than that and the gap is not explained by the free errors it listed,
 *    the model deducted something it did not itemise -> its own (lower) score is kept, so a wrong answer is never 100.
 * Returns { score, source, ignored, costly, modelScore } for logging / tests.
 */
export function computeScore(item) {
  const modelScore = readScore(item && item.score);
  const errs = item && Array.isArray(item.errors) ? item.errors : null;
  if (!errs) {
    return { score: Number.isFinite(modelScore) ? clamp100(modelScore) : NaN, source: 'model', ignored: 0, costly: 0, modelScore };
  }
  let costly = 0, ignored = 0;
  for (const e of errs) {
    const pts = Math.max(0, Math.min(100, Math.round(readScore(e && e.points) || 0)));
    const t = normType(e && e.type);
    if (t === 'spelling' || t === 'style') ignored += pts;
    else costly += pts;   // grammar / meaning / incomplete / language - and an unknown type counts: only a clearly free type is free
  }
  const computed = clamp100(100 - costly);
  if (Number.isFinite(modelScore)) {
    const unexplained = computed - clamp100(modelScore) - ignored;
    if (unexplained >= UNEXPLAINED_LIMIT) {
      return { score: clamp100(modelScore) + ignored, source: 'model-guard', ignored, costly, modelScore };
    }
  }
  return { score: computed, source: 'errors', ignored, costly, modelScore };
}
