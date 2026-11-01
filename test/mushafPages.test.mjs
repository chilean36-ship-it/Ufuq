import fs from 'node:fs';
import assert from 'node:assert/strict';
import { PAGE_STARTS, PAGE_COUNT, JUZ_STARTS, SURAH_AYAHS, pageOf, pageSegments, juzOf } from '../src/lib/mushafPages.js';

const load = (n) => JSON.parse(fs.readFileSync(new URL(`../public/quran/${n}.json`, import.meta.url), 'utf8'));
const ayahCount = [0]; for (let n = 1; n <= 114; n++) ayahCount.push(load(n).ayahs.length);

// 1) 604 sahifa, qat'iy o'sib boradi, har bir boshlanish haqiqiy oyat
assert.equal(PAGE_STARTS.length, PAGE_COUNT);
assert.deepEqual(PAGE_STARTS[0], [1, 1]); assert.deepEqual(PAGE_STARTS[603], [112, 1]);
for (let i = 0; i < PAGE_STARTS.length; i++) {
  const [s, a] = PAGE_STARTS[i];
  assert.ok(s >= 1 && s <= 114 && a >= 1 && a <= ayahCount[s], `sahifa ${i + 1}: ${s}:${a} mavjud emas`);
  if (i) { const [ps, pa] = PAGE_STARTS[i - 1]; assert.ok(s > ps || (s === ps && a > pa), `sahifa ${i + 1} tartibi buzilgan`); }
}

// 2) Sura 1-oyati qaysi sahifada (mustaqil ro'yxat: mushafning standart sura-sahifa jadvali)
const SURAH_START_PAGE = [0, 1, 2, 50, 77, 106, 128, 151, 177, 187, 208, 221, 235, 249, 255, 262, 267, 282, 293, 305, 312, 322, 332, 342, 350, 359, 367, 377, 385, 396, 404, 411, 415, 418, 428, 434, 440, 446, 453, 458, 467, 477, 483, 489, 496, 499, 502, 507, 511, 515, 518, 520, 523, 526, 528, 531, 534, 537, 542, 545, 549, 551, 553, 554, 556, 558, 560, 562, 564, 566, 568, 570, 572, 574, 575, 577, 578, 580, 582, 583, 585, 586, 587, 587, 589, 590, 591, 591, 592, 593, 594, 595, 595, 596, 596, 597, 597, 598, 598, 599, 599, 600, 600, 601, 601, 601, 602, 602, 602, 603, 603, 603, 604, 604, 604];
assert.equal(SURAH_START_PAGE.length, 115);
for (let s = 1; s <= 114; s++) assert.equal(pageOf(s, 1), SURAH_START_PAGE[s], `sura ${s} boshlanish sahifasi`);

// 3) Juz: 30 ta; mushafda har bir juz 20 sahifa (1-juz: 1..21 emas, 1..21 = 21 sahifa; qolganlari 20)
assert.equal(JUZ_STARTS.length, 30);
const juzPages = JUZ_STARTS.map(([s, a]) => pageOf(s, a));
assert.deepEqual(juzPages, [1, 22, 42, 62, 82, 102, 121, 142, 162, 182, 201, 222, 242, 262, 282, 302, 322, 342, 362, 382, 402, 422, 442, 462, 482, 502, 522, 542, 562, 582]);
assert.equal(juzOf(1), 1); assert.equal(juzOf(21), 1); assert.equal(juzOf(22), 2); assert.equal(juzOf(61), 3); assert.equal(juzOf(62), 4); assert.equal(juzOf(604), 30);

// 4) Taniqli sahifalar
assert.equal(pageOf(2, 282), 48); assert.equal(pageOf(2, 255), 42); // Oyat al-Kursiy
assert.equal(pageOf(18, 1), 293); assert.equal(pageOf(36, 1), 440); assert.equal(pageOf(67, 1), 562);
assert.equal(pageOf(112, 1), 604); assert.equal(pageOf(114, 6), 604); assert.equal(pageOf(1, 7), 1);

// 5) pageSegments: sahifalar oraliqsiz va ustma-ust tushmasdan butun Qur'onni (6236 oyat) qoplaydi
let total = 0, prev = null;
for (let p = 1; p <= PAGE_COUNT; p++) {
  for (const seg of pageSegments(p)) {
    const to = Math.min(seg.to, ayahCount[seg.surah]);
    assert.ok(seg.from >= 1 && to >= seg.from, `sahifa ${p}: bo'sh bo'lak`);
    if (prev) { // oldingi bo'lak tugagan joydan davom etadi
      const nextExpected = prev.to === ayahCount[prev.surah] ? [prev.surah + 1, 1] : [prev.surah, prev.to + 1];
      assert.deepEqual([seg.surah, seg.from], nextExpected, `sahifa ${p}: uzilish`);
    }
    total += to - seg.from + 1; prev = { surah: seg.surah, to };
  }
}
assert.equal(SURAH_AYAHS.length, 115); assert.equal(SURAH_AYAHS.reduce((a, b) => a + b, 0), 6236);
assert.equal(total, 6236); assert.deepEqual([prev.surah, prev.to], [114, 6]);
assert.deepEqual(pageSegments(604).map((x) => x.surah), [112, 113, 114]);
assert.deepEqual(pageSegments(1), [{ surah: 1, from: 1, to: Infinity }]);
assert.deepEqual(pageSegments(2), [{ surah: 2, from: 1, to: 5 }]);

console.log('mushafPages: hammasi o\'tdi (604 sahifa, 6236 oyat, 114 sura, 30 juz)');
