import assert from 'node:assert/strict';
import { parseQ, buildQ, layoutQuestions, isListening, LISTENING_SECTIONS } from '../src/lib/examPaper.js';

// every ready-made item survives build -> parse, and its correct option is one of its options
for (const [level, kinds] of Object.entries(LISTENING_SECTIONS)) {
  for (const [kind, sec] of Object.entries(kinds)) {
    assert.equal(sec.items.length, 5, `level ${level} ${kind}: five questions`);
    sec.items.forEach((it, i) => {
      const text = buildQ({ sec: i === 0 ? sec.title : '', audio: it.audio, opts: it.opts, body: it.text });
      const p = parseQ(text);
      assert.equal(p.audio, it.audio);
      assert.deepEqual(p.opts, it.opts);
      assert.equal(p.body, it.text);
      assert.ok(isListening(p));
      assert.ok(it.opts.includes(it.criteria), `${kind} #${i + 1}: key is an option`);
    });
  }
}

// layout carries audio/opts per question and leaves ordinary questions untouched
const sec = LISTENING_SECTIONS[1].midterm;
const qs = sec.items.map((it, i) => ({ id: 'q' + i, type: 'short_answer', question_text: buildQ({ sec: i === 0 ? sec.title : '', audio: it.audio, opts: it.opts, body: it.text }) }));
qs.push({ id: 'plain', type: 'short_answer', question_text: 'ما اسمك؟' });
const laid = layoutQuestions(qs);
assert.equal(laid[0].audio, sec.items[0].audio);
assert.equal(laid[4].opts.length, 3);
assert.equal(laid[5].audio, '');
assert.ok(!isListening(parseQ('ما اسمك؟')));
console.log('listening tests passed');
