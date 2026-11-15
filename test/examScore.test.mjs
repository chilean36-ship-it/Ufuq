// node test/examScore.test.mjs — spelling / style never cost points; the server computes the score from the AI's error list.
import assert from 'node:assert/strict';
import { computeScore } from '../supabase/functions/_shared/exam-score.js';

const sc = (o) => computeScore(o).score;

// 1. spelling only: the model wrongly lowered the score, the server gives 100 back (Q16: "يكرفه" 85 -> 100)
assert.equal(sc({ score: 85, errors: [{ type: 'spelling', points: 15 }] }), 100);
// the model forgot to put points:0 on a spelling item - still free
assert.equal(sc({ score: 90, errors: [{ type: 'spelling', points: 10, note: 'مواعد' }] }), 100);
// style / loose sentence is free too (Q15: 75 for a correct use)
assert.equal(sc({ score: 75, errors: [{ type: 'style', points: 25 }] }), 100);
// spelling name variants
assert.equal(sc({ score: 92, errors: [{ type: 'Typo', points: 8 }] }), 100);
assert.equal(sc({ score: 92, errors: [{ type: 'orthography', points: 8 }] }), 100);

// 2. a real grammar error is counted exactly, a spelling item beside it is not
assert.equal(sc({ score: 65, errors: [{ type: 'grammar', points: 35 }] }), 65);
assert.equal(sc({ score: 60, errors: [{ type: 'grammar', points: 35 }, { type: 'spelling', points: 5 }] }), 65);
assert.equal(sc({ score: 50, errors: [{ type: 'meaning', points: 20 }, { type: 'grammar', points: 10 }, { type: 'spelling', points: 20 }] }), 70);

// 3. matching / antonym: missing sentence = incomplete 40
assert.equal(sc({ score: 60, errors: [{ type: 'incomplete', points: 40 }] }), 60);

// 4. unknown type still costs (only clearly free types are free)
assert.equal(sc({ score: 80, errors: [{ type: 'weird', points: 20 }] }), 80);

// 5. wrong answer the model forgot to itemise is NOT turned into 100 (guard)
const g = computeScore({ score: 10, errors: [] });
assert.equal(g.score, 10); assert.equal(g.source, 'model-guard');
assert.equal(sc({ score: 20, errors: [{ type: 'spelling', points: 5 }] }), 25);   // keeps the model's score + the free points

// 6. no errors array (older answer shape): the model's score is used as before
assert.equal(sc({ score: 88 }), 88);
assert.equal(sc({ score: '85/100' }), 85);
assert.ok(Number.isNaN(sc({ score: 'x' })));

// 7. perfect answer, clamps, bad points
assert.equal(sc({ score: 100, errors: [] }), 100);
assert.equal(sc({ score: 0, errors: [{ type: 'meaning', points: 500 }] }), 0);
assert.equal(sc({ score: 70, errors: [{ type: 'grammar', points: 'abc' }] }), 70);   // unreadable points: the guard keeps the model's score

console.log('examScore.test.mjs ok');
