// Hifz checker core: Arabic normalisation + word-level alignment of "what was heard" against "what should be recited".
// Pure JS (no dependencies) so it runs in Supabase Edge Functions (Deno), in the browser and in Node tests.

/** Letters-only skeleton of an Arabic word: no harakat, no Quran marks, one form per alef/ya/hamza. */
export function normalizeArabic(input) {
  return String(input || '')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08FF\u0640]/g, '') // harakat, dagger alif, Quran signs, tatweel
    .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627') // آ أ إ ٱ -> ا
    .replace(/\u0649/g, '\u064A')                      // ى -> ي
    .replace(/\u0629/g, '\u0647')                      // ة -> ه
    .replace(/\u0624/g, '\u0648')                      // ؤ -> و
    .replace(/\u0626/g, '\u064A')                      // ئ -> ي
    .replace(/\u0621/g, '')                            // ء
    .replace(/[\u06CC]/g, '\u064A')                    // Farsi ya
    .replace(/[\u06A9]/g, '\u0643')                    // Farsi kaf
    .replace(/[^\u0621-\u064A\s]/g, ' ')               // punctuation, digits, latin
    .replace(/\s+/g, ' ')
    .trim();
}

export function splitWords(s) {
  const n = normalizeArabic(s);
  return n ? n.split(' ') : [];
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array(n + 1);
  let cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const c = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + c);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

export function similarity(a, b) {
  const L = Math.max(a.length, b.length);
  return L ? 1 - levenshtein(a, b) / L : 1;
}

/** 'ok' = same word, 'near' = probably same word but a letter differs (ASR noise or a slip), 'no' = different word. */
function level(expected, heard) {
  if (expected === heard) return { lv: 'ok', sim: 1 };
  const sim = similarity(expected, heard);
  // very short words: one different letter is a different word (من/عن), so they must match exactly
  if (Math.max(expected.length, heard.length) <= 3) return { lv: 'no', sim };
  return sim >= 0.6 ? { lv: 'near', sim } : { lv: 'no', sim };
}

const COST_OK = 0;
const COST_NEAR = (sim) => 0.3 + (1 - sim) * 0.5;
const COST_WRONG = 1.2;   // substitution with a different word (still cheaper than missing + extra = 1.9)
const COST_MISSING = 1.0; // expected word not heard
const COST_EXTRA_MID = 0.9;
const COST_EXTRA_EDGE = 0.02; // extra words before the first / after the last expected word (isti'adha, basmala, "sadaqa Allah") are nearly free

function pairCost(expected, heard) {
  const r = level(expected, heard);
  if (r.lv === 'ok') return { cost: COST_OK, lv: 'ok', sim: 1 };
  if (r.lv === 'near') return { cost: COST_NEAR(r.sim), lv: 'near', sim: r.sim };
  return { cost: COST_WRONG, lv: 'wrong', sim: r.sim };
}

/**
 * Align the recited words against the expected words.
 * @param {string[]} expected normalised expected words (in order)
 * @param {string[]} heard    normalised words from the speech recogniser
 * @returns {{ words: {i:number,status:'correct'|'near'|'wrong'|'missing',heard:string}[], extras: {before:number,text:string,edge:boolean}[], counts:object, score:number }}
 */
export function alignRecitation(expected, heard) {
  const n = expected.length, m = heard.length;
  const W = m + 1;
  const D = new Float64Array((n + 1) * W).fill(Infinity);
  const B = new Uint8Array((n + 1) * W); // 1 match/sub, 2 missing, 3 extra, 4 two-expected<-one-heard, 5 one-expected<-two-heard
  const idx = (i, j) => i * W + j;
  D[0] = 0;
  const extraCost = (i) => (i === 0 || i === n ? COST_EXTRA_EDGE : COST_EXTRA_MID);

  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      const cur = D[idx(i, j)];
      if (cur === Infinity) continue;
      if (i < n) { // expected word i not heard
        const c = cur + COST_MISSING;
        if (c < D[idx(i + 1, j)]) { D[idx(i + 1, j)] = c; B[idx(i + 1, j)] = 2; }
      }
      if (j < m) { // extra heard word
        const c = cur + extraCost(i);
        if (c < D[idx(i, j + 1)]) { D[idx(i, j + 1)] = c; B[idx(i, j + 1)] = 3; }
      }
      if (i < n && j < m) {
        const p = pairCost(expected[i], heard[j]);
        const c = cur + p.cost;
        if (c < D[idx(i + 1, j + 1)]) { D[idx(i + 1, j + 1)] = c; B[idx(i + 1, j + 1)] = 1; }
      }
      // recogniser glued two expected words into one heard word ("ولا" heard for "و" "لا")
      if (i + 1 < n && j < m) {
        const p = pairCost(expected[i] + expected[i + 1], heard[j]);
        if (p.lv === 'ok') {
          const c = cur + p.cost + 0.05;
          if (c < D[idx(i + 2, j + 1)]) { D[idx(i + 2, j + 1)] = c; B[idx(i + 2, j + 1)] = 4; }
        }
      }
      // recogniser split one expected word into two heard words
      if (i < n && j + 1 < m) {
        const p = pairCost(expected[i], heard[j] + heard[j + 1]);
        if (p.lv === 'ok') {
          const c = cur + p.cost + 0.05;
          if (c < D[idx(i + 1, j + 2)]) { D[idx(i + 1, j + 2)] = c; B[idx(i + 1, j + 2)] = 5; }
        }
      }
    }
  }

  // backtrack
  const words = new Array(n);
  const extras = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    const b = B[idx(i, j)];
    if (b === 1) {
      const p = pairCost(expected[i - 1], heard[j - 1]);
      words[i - 1] = { i: i - 1, status: p.lv === 'ok' ? 'correct' : p.lv === 'near' ? 'near' : 'wrong', heard: heard[j - 1] };
      i--; j--;
    } else if (b === 2) {
      words[i - 1] = { i: i - 1, status: 'missing', heard: '' };
      i--;
    } else if (b === 3) {
      extras.push({ before: i, text: heard[j - 1], edge: i === 0 || i === n });
      j--;
    } else if (b === 4) {
      const st = 'correct';
      words[i - 1] = { i: i - 1, status: st, heard: heard[j - 1] };
      words[i - 2] = { i: i - 2, status: st, heard: heard[j - 1] };
      i -= 2; j--;
    } else if (b === 5) {
      words[i - 1] = { i: i - 1, status: 'correct', heard: heard[j - 2] + ' ' + heard[j - 1] };
      i--; j -= 2;
    } else { break; }
  }
  extras.reverse();

  const counts = { correct: 0, near: 0, wrong: 0, missing: 0, extra: extras.filter((e) => !e.edge).length, total: n };
  for (const w of words) if (w) counts[w.status]++;
  const score = n ? Math.round(((counts.correct + 0.5 * counts.near) / n) * 1000) / 10 : 0;
  return { words, extras, counts, score };
}
