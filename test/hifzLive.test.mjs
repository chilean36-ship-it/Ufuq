import fs from 'node:fs';
import assert from 'node:assert/strict';
import { flattenSurah, flattenPage, paginate, createLiveSession, evaluateLive, splitWords } from '../src/lib/hifzLive.js';

const load = (n) => JSON.parse(fs.readFileSync(new URL(`../public/quran/${n}.json`, import.meta.url), 'utf8'));
const letters = (states) => states.map((s) => ({ pending: '.', correct: 'c', near: 'n', wrong: 'w', missing: 'm', hint: 'h' }[s])).join('');

// ---------- flattenSurah / paginate ----------
{
  const s2 = flattenSurah(load(2), 1);
  assert.equal(s2.basmala.length, 4, 'basmala is cut from ayah 1 of surah 2');
  assert.equal(s2.words[0].norm, 'الم');
  assert.equal(s2.words[0].ayah, 1);
  const s1 = flattenSurah(load(1), 1);
  assert.equal(s1.basmala, null, 'Fatiha keeps its basmala (it is ayah 1)');
  assert.equal(s1.words[0].norm, 'بسم');
  const s9 = flattenSurah(load(9), 1);
  assert.equal(s9.basmala, null); assert.equal(s9.words[0].norm, 'براه');
  const from3 = flattenSurah(load(2), 3);
  assert.equal(from3.words[0].ayah, 3);
  // every surah loads, has at least one word, pages never split an ayah
  for (let n = 1; n <= 114; n++) {
    const f = flattenSurah(load(n), 1);
    assert.ok(f.words.length > 0, `surah ${n}`);
    const pages = paginate(f.words, 70);
    assert.equal(pages[0].from, 0); assert.equal(pages[pages.length - 1].to, f.words.length - 1);
    for (let p = 0; p < pages.length; p++) {
      assert.ok(f.words[pages[p].to].lastInAyah, `page ends on an ayah end (surah ${n})`);
      if (p) assert.equal(pages[p].from, pages[p - 1].to + 1);
    }
  }
}

// ---------- perfect recitation, word by word (interim growth), with a basmala said first ----------
{
  const { words } = flattenSurah(load(112), 1);
  const norm = words.map((w) => w.norm);
  const ses = createLiveSession(norm);
  let text = 'بسم الله الرحمن الرحيم'; // student opens with the basmala — must cost nothing
  let snap = ses.update(text);
  assert.equal(letters(snap.states), '.'.repeat(norm.length));
  const seen = [];
  for (let i = 0; i < norm.length; i++) {
    text += ' ' + norm[i];
    snap = ses.update(text);
    seen.push(snap.states.filter((s) => s === 'correct').length);
  }
  assert.deepEqual(seen.slice(-3).map((x, k, a) => (k ? x >= a[k - 1] : true)), [true, true, true]);
  assert.equal(letters(snap.states), 'c'.repeat(norm.length)); assert.equal(snap.done, true); assert.equal(snap.score, 100);
}

// ---------- a wrong word and a skipped word in the middle ----------
{
  const { words } = flattenSurah(load(1), 1);
  const norm = words.map((w) => w.norm); // 29 words incl. basmala
  const heard = norm.slice();
  heard[7] = 'الكتاب';                                                            // a different word instead of «العالمين»
  heard.splice(12, 1);                                                            // skipped word «الدين»
  const ses = createLiveSession(norm);
  const mid = ses.update(heard.slice(0, 9).join(' ')); // only 1 word after the wrong one -> not shown yet
  assert.equal(mid.states[7], 'pending');
  const snap = ses.update(heard.join(' '), { final: true });
  assert.equal(snap.states[7], 'wrong'); assert.equal(snap.states[12], 'missing'); // 'الدين' was skipped
  assert.equal(snap.counts.wrong, 1); assert.equal(snap.counts.missing, 1);
  assert.equal(snap.done, true);
  assert.ok(snap.score < 100 && snap.score > 85, `score ${snap.score}`);
}

// ---------- start in the middle of a page (student taps a word): earlier words are NOT errors ----------
{
  const { words } = flattenSurah(load(55), 1); // many repeated phrases (فبأي آلاء ربكما تكذبان)
  const norm = words.slice(0, 80).map((w) => w.norm);
  const startAt = words.findIndex((w) => w.ayah === 5);
  const ses = createLiveSession(norm, { startIdx: startAt });
  const heard = norm.slice(startAt, startAt + 20).join(' ');
  const snap = ses.update(heard, { final: true });
  assert.equal(letters(snap.states.slice(0, startAt)), '.'.repeat(startAt));
  assert.equal(snap.states.slice(startAt, startAt + 20).every((s) => s === 'correct'), true);
  assert.equal(snap.nextIdx, startAt + 20);
}

// ---------- student starts reciting in the middle of the page WITHOUT tapping a start word ----------
{
  const { words } = flattenSurah(load(36), 1);
  const norm = words.slice(0, 70).map((w) => w.norm);
  const at = words.findIndex((w) => w.ayah === 4);
  const ses = createLiveSession(norm); // start = 0
  let snap = ses.update(norm.slice(at, at + 3).join(' '));       // interim: 3 words only
  snap = ses.update(norm.slice(at, at + 12).join(' '), { final: true });
  assert.equal(letters(snap.states.slice(0, at)), '.'.repeat(at), 'words before the start stay pending, not errors');
  assert.ok(snap.states.slice(at, at + 12).every((s) => s === 'correct'));
  assert.equal(snap.counts.missing + snap.counts.wrong, 0);
}

// ---------- a one-or-two-letter slip is 'near' (doubtful), not wrong ----------
{
  const { words } = flattenSurah(load(1), 1);
  const norm = words.map((w) => w.norm);
  const heard = norm.slice(); heard[7] = 'الظالمين';
  const snap = createLiveSession(norm).update(heard.join(' '), { final: true });
  assert.equal(snap.states[7], 'near');
}

// ---------- hint + resume (stop / start the microphone again) ----------
{
  const { words } = flattenSurah(load(112), 1);
  const norm = words.map((w) => w.norm);
  const ses = createLiveSession(norm);
  let snap = ses.update(norm.slice(0, 3).join(' '), { final: true });
  assert.equal(snap.nextIdx, 3);
  snap = ses.hint();
  assert.equal(snap.states[3], 'hint'); assert.equal(snap.nextIdx, 4);
  snap = ses.resume(); // mic restarted: new recogniser text, alignment continues from word 4
  snap = ses.update(norm.slice(4).join(' '), { final: true });
  assert.equal(letters(snap.states), 'ccc' + 'h' + 'c'.repeat(norm.length - 4));
  assert.equal(snap.done, true);
  assert.ok(snap.score < 100, 'a hint costs points');
}

// ---------- recogniser noise: a near word is kept, silence changes nothing ----------
{
  const { words } = flattenSurah(load(112), 1);
  const norm = words.map((w) => w.norm);
  const ses = createLiveSession(norm);
  assert.equal(ses.update('').counted, 0);
  const noisy = norm.slice(); noisy[5] = noisy[5] + 'ا';
  const snap = ses.update(noisy.join(' '), { final: true });
  assert.ok(['near', 'correct'].includes(snap.states[5]));
}

// ---------- speed: the longest page, an update per recogniser event ----------
{
  const { words } = flattenSurah(load(2), 1);
  const pages = paginate(words, 70);
  let longest = pages.reduce((a, p) => (p.to - p.from > a.to - a.from ? p : a), pages[0]);
  const norm = words.slice(longest.from, longest.to + 1).map((w) => w.norm);
  const ses = createLiveSession(norm);
  const t0 = performance.now();
  for (let i = 1; i <= norm.length; i++) ses.update(norm.slice(0, i).join(' '));
  const per = (performance.now() - t0) / norm.length;
  console.log(`longest page: ${norm.length} words, ${per.toFixed(2)} ms per update`);
  assert.ok(per < 25, 'update must stay far below a recogniser event interval');
}

console.log('hifzLive tests passed');

// ---------- flattenPage: haqiqiy mushaf sahifalari ----------
{
  const { pageSegments, PAGE_COUNT } = await import('../src/lib/mushafPages.js');
  const cache = {};
  const dataFor = (segs) => { for (const sg of segs) cache[sg.surah] ||= load(sg.surah); return cache; };
  // 604-sahifa: Ixlos, Falaq, Nos — uchta sarlavha, har birida basmala
  const p604 = flattenPage(pageSegments(604), dataFor(pageSegments(604)));
  assert.deepEqual(p604.heads.map((h) => h.surah), [112, 113, 114]);
  assert.ok(p604.heads.every((h) => h.basmala && h.basmala.length === 4));
  assert.equal(p604.words[0].norm, 'قل'); assert.equal(p604.words[0].surah, 112);
  assert.equal(p604.words.at(-1).surah, 114); assert.equal(p604.words.at(-1).ayah, 6);
  // 1-sahifa: Fotiha — basmala 1-oyatning o'zi (sarlavhada alohida emas)
  const p1 = flattenPage(pageSegments(1), dataFor(pageSegments(1)));
  assert.equal(p1.heads.length, 1); assert.equal(p1.heads[0].basmala, null); assert.equal(p1.words[0].norm, 'بسم');
  assert.equal(p1.words.at(-1).ayah, 7);
  // 2-sahifa: Baqara 1–5, 3-sahifa o'rtadan boshlanadi (sarlavhasiz)
  const p2 = flattenPage(pageSegments(2), dataFor(pageSegments(2)));
  assert.equal(p2.words.at(-1).ayah, 5); assert.equal(p2.heads[0].surah, 2);
  const p3 = flattenPage(pageSegments(3), dataFor(pageSegments(3)));
  assert.equal(p3.heads.length, 0); assert.equal(p3.words[0].ayah, 6);
  // 187-sahifa: Tavba boshi — sarlavha bor, basmala yo'q
  const p187 = flattenPage(pageSegments(187), dataFor(pageSegments(187)));
  assert.equal(p187.heads[0].surah, 9); assert.equal(p187.heads[0].basmala, null);
  // Butun Qur'on: sahifalar so'zlarni qoldirmaydi va takrorlamaydi (har sura so'z soni = sahifalardagi yig'indi)
  const perSurah = new Array(115).fill(0);
  for (let p = 1; p <= PAGE_COUNT; p++) {
    const segs = pageSegments(p);
    const f = flattenPage(segs, dataFor(segs));
    assert.ok(f.words.length > 0, `sahifa ${p} bo'sh`);
    assert.ok(f.words.at(-1).lastInAyah, `sahifa ${p} oyat oxirida tugamadi`);
    f.words.forEach((w, k) => { assert.equal(w.i, k); perSurah[w.surah]++; });
  }
  for (let n = 1; n <= 114; n++) assert.equal(perSurah[n], flattenSurah(load(n), 1).words.length, `sura ${n}: so'zlar soni mos emas`);
}
console.log('flattenPage: hammasi o\'tdi');

// ---------- speed: a word is revealed the moment it is heard (no one-word lag), also with vowel-spelling differences ----------
{
  const { words } = flattenSurah(load(1), 1);
  const norm = words.map((w) => w.norm);
  const ses = createLiveSession(norm);
  const heardWords = norm.map((w) => w.replace(/^(.{2,})$/, (x) => x)); // exact words
  heardWords[2] = 'الرحمان'; // recogniser spells the long vowel out (expected «الرحمن»)
  let lag = 0, text = '';
  for (let i = 0; i < norm.length; i++) {
    text += (i ? ' ' : '') + heardWords[i];
    const snap = ses.update(text);
    if (i >= 1 && snap.states[i] === 'pending') lag++; // word i must already be shown after it is heard (word 0 needs word 1 to confirm it)
    if (i >= 1) assert.ok(['correct', 'near'].includes(snap.states[i]) || snap.states[i] === 'pending');
  }
  assert.equal(lag, 0, 'every word after the first is revealed as soon as it is heard');
  const fin = ses.update(text, { final: true });
  assert.equal(fin.states[2], 'correct', 'الرحمان is accepted for الرحمن');
  assert.equal(fin.done, true);
  console.log('fast reveal test passed');
}

// ---------- fewer false errors: look-alike sounds are "doubtful", a dropped short word is never an error, stray last word != page done ----------
{
  const { words } = flattenSurah(load(1), 1);
  const norm = words.map((w) => w.norm);
  const heard = norm.slice();
  const iSirat = norm.indexOf('الصراط');
  heard[iSirat] = 'السراط';                 // ص heard as س
  const iFi = norm.indexOf('الله');           // drop a word between correct neighbours: use a short one instead
  const short = norm.findIndex((w, i) => w.length <= 3 && i > 8 && i < norm.length - 3);
  heard.splice(short, 1);
  const ses = createLiveSession(norm);
  const snap = ses.update(heard.join(' '), { final: true });
  assert.notEqual(snap.states[iSirat], 'wrong', 'ص/س confusion is not a hard error');
  assert.ok(['correct', 'near'].includes(snap.states[iSirat]));
  assert.notEqual(snap.states[short], 'missing', 'a dropped short word between correct words is only doubtful');
  assert.notEqual(snap.states[short], 'wrong');
  // a stray match of the very last word must not finish the page
  const ses2 = createLiveSession(norm);
  const s2 = ses2.update(norm.slice(-2).join(' '));
  assert.equal(s2.done, false, 'two words at the end are not a finished page');
  const s3 = createLiveSession(norm).hint(norm.length - 1);
  assert.equal(s3.done, false, 'peeking at the last word does not finish the page');
  console.log('leniency tests passed', iFi >= 0);
}
