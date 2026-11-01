// Live "mushaf" hifz checker — the logic behind My Learning → Hifz Mushaf.
// Pure JS (no React, no browser APIs) so it can be tested in Node: `node test/hifzLive.test.mjs`.
// It reuses the same aligner as the server-side check (supabase/functions/_shared/hifz-align.js), so scores agree.
import { alignRecitation, normalizeArabic, splitWords, similarity } from '../../supabase/functions/_shared/hifz-align.js';

export { splitWords, normalizeArabic };

const BASMALA = ['بسم', 'الله', 'الرحمن', 'الرحيم'];

/**
 * Flat word list of a surah (from `fromAyah` on), built from public/quran/{n}.json.
 * Tanzil glues the basmala onto ayah 1 of every surah except 1 and 9; it is cut off here and returned separately
 * (the Fatiha's ayah 1 IS the basmala, so it stays).
 * @returns {{ words: {i:number, ayah:number, text:string, norm:string, lastInAyah:boolean}[], basmala: string[]|null }}
 */
export function flattenSurah(data, fromAyah = 1) {
  const surah = Number(data.surah);
  const words = [];
  let basmala = null;
  for (const ay of data.ayahs) {
    let skip = 0;
    if (ay.n === 1 && surah !== 1 && surah !== 9 && ay.clean.length > BASMALA.length
        && BASMALA.every((w, k) => normalizeArabic(ay.clean[k]) === w)) {
      skip = BASMALA.length;
      basmala = ay.words.slice(0, BASMALA.length);
    }
    if (ay.n < fromAyah) continue;
    for (let k = skip; k < ay.words.length; k++) {
      words.push({
        i: words.length, ayah: ay.n, text: ay.words[k], norm: normalizeArabic(ay.clean[k]),
        lastInAyah: k === ay.words.length - 1,
      });
    }
  }
  return { words, basmala };
}

/**
 * Words of ONE real mushaf page (Madina mushaf, 604 pages). A page may hold the tail of one surah and the start of the next
 * (or three short surahs, like page 604), so it is built from several surah files.
 * `segments` come from pageSegments(p) in ./mushafPages.js; `dataBySurah[n]` is the parsed public/quran/{n}.json.
 * `heads` = surah headers inside the page: { at: index of the first word after the header, surah, basmala: string[]|null }.
 * The basmala is shown above the surah (not counted as words) — except Fatiha (it is ayah 1) and At-Tawba (none).
 * @returns {{ words: {i:number, surah:number, ayah:number, text:string, norm:string, lastInAyah:boolean}[], heads: {at:number, surah:number, basmala:string[]|null}[] }}
 */
export function flattenPage(segments, dataBySurah) {
  const words = [];
  const heads = [];
  for (const seg of segments) {
    const data = dataBySurah[seg.surah];
    if (!data) throw new Error(`quran data ${seg.surah} missing`);
    const fl = flattenSurah(data, seg.from);
    if (seg.from === 1) heads.push({ at: words.length, surah: seg.surah, basmala: fl.basmala });
    for (const w of fl.words) {
      if (w.ayah > seg.to) break;
      words.push({ ...w, i: words.length, surah: seg.surah });
    }
  }
  return { words, heads };
}

/** Group whole ayahs into pages of about `target` words (an ayah is never split). Returns [{from, to}] (inclusive, into `words`). */
export function paginate(words, target = 70) {
  const pages = [];
  let from = 0;
  for (let i = 0; i < words.length; i++) {
    const endOfAyah = i === words.length - 1 || words[i + 1].ayah !== words[i].ayah;
    if (endOfAyah && (i - from + 1 >= target || i === words.length - 1)) { pages.push({ from, to: i }); from = i + 1; }
  }
  return pages;
}

/**
 * One alignment pass: recited words (`heard`) against the expected words.
 * `final = false` while the recogniser is still talking: a mistake is only shown once the student has gone on for 2 more words.
 * Words before the first / after the last matched word are 'pending' (not recited yet) — never errors.
 */
export function evaluateLive(norm, heard, { startIdx = 0, final = false } = {}) {
  const states = new Array(norm.length).fill('pending');
  const exp = norm.slice(startIdx);
  if (!exp.length || !heard.length) return { states, last: -1 };
  const al = alignRecitation(exp, heard, { prefix: true, lenient: true });
  const ok = (k) => { const w = al.words[k]; return !!w && (w.status === 'correct' || w.status === 'near'); };
  // A match is trusted only if the word before or after it matched too (or it is the very first word of the range).
  // Otherwise a stray word — e.g. the "الله" of the basmala said before the ayah — would light up a far-away "الله".
  const supported = (k) => ok(k) && (k === 0 || ok(k - 1) || ok(k + 1));
  let first = -1, last = -1, lastAny = -1;
  al.words.forEach((w, k) => {
    if (!w || w.status === 'missing') return;
    if (supported(k)) { if (first < 0) first = k; last = k; lastAny = k; } else if (first >= 0 && k > last) lastAny = Math.max(lastAny, k);
  });
  if (first < 0) return { states, last: -1 };
  const shownLast = final ? lastAny : last;
  for (let k = first; k <= shownLast; k++) {
    const w = al.words[k];
    let st = w ? w.status : 'missing';
    // A short word (و، في، من، لا…) the recogniser dropped or garbled between two correct words is far more likely recognition noise
    // than a real mistake: show it as doubtful, not as an error.
    if ((st === 'wrong' || st === 'missing') && exp[k].length <= 3 && k > 0 && ok(k - 1) && ok(k + 1)) st = 'near';
    if ((st === 'wrong' || st === 'missing') && !final && last - k < 2) continue; // not settled yet
    states[startIdx + k] = st;
  }
  return { states, last: last < 0 ? -1 : startIdx + last };
}

const RANK = { pending: 0, missing: 1, wrong: 1, near: 2, correct: 3, hint: 4 };

/**
 * A recitation session over one page. Feed it the recogniser's text; read `snapshot()` to paint the page.
 * Revealed words are sticky (interim recogniser results flicker), a mistake can still be upgraded if the student
 * says the word again correctly, and a hint is never overwritten.
 */
export function createLiveSession(norm, { startIdx = 0 } = {}) {
  const n = norm.length;
  const sticky = new Array(n).fill('pending');
  let start = Math.min(Math.max(0, startIdx), Math.max(0, n - 1));
  let heard = [];

  const put = (i, st) => {
    if (i < 0 || i >= n || st === 'pending') return;
    if (sticky[i] === 'hint') return;
    if (st === 'hint' || RANK[st] > RANK[sticky[i]]) sticky[i] = st;
    else if (RANK[st] === RANK[sticky[i]] && st !== sticky[i]) sticky[i] = st; // wrong <-> missing: take the newer verdict
  };

  function nextIdx() {
    let last = -1;
    for (let i = start; i < n; i++) if (sticky[i] === 'correct' || sticky[i] === 'near' || sticky[i] === 'hint') last = i;
    return last < 0 ? start : Math.min(n - 1, last + 1);
  }

  // Fast path: reveal a word the moment it is heard at the cursor — no need to wait for the full alignment or for the next word.
  // Only the word AT the cursor can be revealed this way (no skipping ahead), and the very first word needs the second word to
  // confirm it (so a stray «الله» of the isti'adha cannot light up a far-away word). The alignment still runs after it and may
  // upgrade or add; a revealed word is never taken back.
  let fastPos = 0;
  function fast(h) {
    if (fastPos > h.length) fastPos = h.length;
    while (fastPos < h.length) {
      let c = -1;
      let last = -1;
      for (let i = start; i < n; i++) if (sticky[i] === 'correct' || sticky[i] === 'near' || sticky[i] === 'hint') last = i;
      c = last < 0 ? start : last + 1;
      if (c >= n) return;
      if (sticky[c] !== 'pending') return; // the alignment already decided this one
      const w = h[fastPos], e = norm[c];
      let hit = null;
      if (w === e) hit = 'correct';
      else if (e.length >= 4 && w.length >= 4 && similarity(e, w) >= 0.8) hit = 'near';
      if (hit && last < 0) { // first word of the recitation: the second word must confirm it
        const nx = h[fastPos + 1];
        if (nx === undefined) return;
        if (!(c + 1 < n && (nx === norm[c + 1] || similarity(norm[c + 1], nx) >= 0.8))) { fastPos++; continue; }
      }
      if (hit) { put(c, hit); fastPos++; continue; }
      if (fastPos === h.length - 1) return; // the last word is still being recognised: do not judge it yet
      fastPos++; // a stray word
    }
  }

  function snapshot() {
    const counts = { correct: 0, near: 0, wrong: 0, missing: 0, hint: 0 };
    for (const s of sticky) if (counts[s] !== undefined) counts[s]++;
    const counted = counts.correct + counts.near + counts.wrong + counts.missing + counts.hint;
    // finished = the last word is shown AND most of the page from the start point was really recited (a lone tap or a stray match on the
    // last word must not count as "page complete", it would turn the page by itself)
    let shownCount = 0;
    for (let i = start; i < n; i++) if (sticky[i] !== 'pending') shownCount++;
    const done = n > 0 && ['correct', 'near', 'hint'].includes(sticky[n - 1]) && shownCount >= Math.ceil((n - start) * 0.6);
    const score = counted ? Math.round(((counts.correct + 0.5 * counts.near) / counted) * 1000) / 10 : 0;
    return { states: sticky.slice(), counts, counted, score, done, nextIdx: done ? -1 : nextIdx(), startIdx: start };
  }

  return {
    /** text = everything the recogniser has produced since the last (re)start, final + interim. */
    update(text, { final = false } = {}) {
      heard = splitWords(text);
      fast(heard);
      const r = evaluateLive(norm, heard, { startIdx: start, final });
      r.states.forEach((st, i) => put(i, st));
      return snapshot();
    },
    /** Called when the microphone (re)starts: new heard-text, and the alignment continues from the first unrecited word. */
    resume() { heard = []; fastPos = 0; start = Math.max(start, 0); const nx = nextIdx(); start = nx; return snapshot(); },
    /** Reveal the next word as a hint (scores 0). `at` reveals a specific word (tap on a hidden word). */
    hint(at) { const i = at === undefined ? nextIdx() : at; if (sticky[i] === 'pending' || sticky[i] === 'wrong' || sticky[i] === 'missing') sticky[i] = 'hint'; return snapshot(); },
    setStart(i) { start = Math.min(Math.max(0, i), Math.max(0, n - 1)); heard = []; fastPos = 0; return snapshot(); },
    snapshot,
  };
}
