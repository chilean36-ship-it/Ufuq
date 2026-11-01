import { normalizeArabic, splitWords, alignRecitation } from '../supabase/functions/_shared/hifz-align.js';
import assert from 'node:assert/strict';

const exp = splitWords('ذَهَبَ الْوَلَدُ إِلَى الْمَدْرَسَةِ صَبَاحًا مَعَ أَصْدِقَائِهِ');
assert.deepEqual(exp, ['ذهب', 'الولد', 'الي', 'المدرسه', 'صباحا', 'مع', 'اصدقايه']);
assert.equal(normalizeArabic('ٱلْحَمْدُ'), 'الحمد');

const st = (r) => r.words.map((w) => w.status[0]).join('');

// 1) perfect
let r = alignRecitation(exp, [...exp]);
assert.equal(st(r), 'ccccccc'); assert.equal(r.score, 100);

// 2) one word skipped in the middle
r = alignRecitation(exp, exp.filter((_, i) => i !== 3));
assert.equal(st(r), 'cccmccc'); assert.equal(r.counts.missing, 1);

// 3) a different word instead of one (wrong), and a near word
let h = [...exp]; h[1] = 'الطالب'; h[4] = 'صباحاا'.replace('اا', 'ا') + 'ن';
r = alignRecitation(exp, h);
assert.equal(r.words[1].status, 'wrong'); assert.equal(r.words[4].status, 'near');

// 4) extra words before / after are free (isti'adha, "sadaqa Allah"), extra word in the middle is reported
h = ['اعوذ', 'بالله', ...exp, 'صدق', 'الله'];
r = alignRecitation(exp, h);
assert.equal(r.score, 100); assert.equal(r.counts.extra, 0); assert.ok(r.extras.every((e) => e.edge));
h = [...exp]; h.splice(3, 0, 'كلمه');
r = alignRecitation(exp, h);
assert.equal(r.counts.extra, 1); assert.equal(r.score, 100);

// 5) stops early: the rest is missing
r = alignRecitation(exp, exp.slice(0, 4));
assert.equal(st(r), 'ccccmmm');

// 6) recogniser glued / split words are not punished
r = alignRecitation(['و', 'لا', 'تقربوا', 'الزنا'], ['ولا', 'تقربوا', 'الزنا']);
assert.equal(st(r), 'cccc');
r = alignRecitation(['ولا', 'تقربوا', 'الزنا'], ['و', 'لا', 'تقربوا', 'الزنا']);
assert.equal(st(r), 'ccc');

// 7) nothing heard
r = alignRecitation(exp, []);
assert.equal(r.counts.missing, 7); assert.equal(r.score, 0);

// 8) speed: 300 expected words
const big = Array.from({ length: 300 }, (_, i) => 'كلمه' + 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي'[i % 28] + 'ب'.repeat(i % 3));
const t0 = Date.now(); alignRecitation(big, big.slice(0, 280)); assert.ok(Date.now() - t0 < 300, 'too slow');
console.log('all alignment tests passed');
