import assert from 'node:assert/strict';
import { parseQ, buildQ, layoutQuestions, isMcq, isListening } from '../src/lib/examPaper.js';
import { examMax, examPoints, LEVEL_MAX, PASS_MARK } from '../src/lib/scoring.js';

// scoring: pop1 25 + pop2 50 + midterm 25 + final 50 = 150, pass 75
assert.equal(examMax('pop1'), 25); assert.equal(examMax('pop2'), 50);
assert.equal(examMax('midterm'), 25); assert.equal(examMax('final'), 50); assert.equal(examMax(null), 100);
assert.equal(LEVEL_MAX, 150); assert.equal(PASS_MARK, 75);
assert.equal(examPoints(80, 'pop1'), 20); assert.equal(examPoints(80, 'final'), 40); assert.equal(examPoints(null, 'final'), null);

// MCQ item: options + shared passage survive build -> parse, and layout hands the passage to the question
const text = buildQ({ sec: 'القراءة', opts: ['أ', 'ب', 'ج', 'د'], pass: 'نص قصير للقراءة يتكرر مع كل سؤال.', body: 'ما فكرة النص؟' });
const p = parseQ(text);
assert.deepEqual(p.opts, ['أ', 'ب', 'ج', 'د']); assert.equal(p.pass, 'نص قصير للقراءة يتكرر مع كل سؤال.'); assert.equal(p.body, 'ما فكرة النص؟');
assert.ok(isMcq(p)); assert.ok(!isListening(p));
const laid = layoutQuestions([{ id: 'a', type: 'short_answer', question_text: text }, { id: 'b', type: 'short_answer', question_text: 'ما اسمك؟' }]);
assert.equal(laid[0].passage, 'نص قصير للقراءة يتكرر مع كل سؤال.'); assert.equal(laid[1].passage, null);
console.log('examPop tests passed');
