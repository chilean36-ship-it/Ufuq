// node test/aiFeedback.test.mjs — the AI comment shows in the language chosen in the cabinet.
import assert from 'node:assert/strict';
import { pickFeedback, needsFeedbackTranslation } from '../src/lib/aiFeedback.js';
import { fmtDate, dateLocale, currentLang } from '../src/lib/dateLocale.js';

const t = (k) => ({ 'No answer was written.': 'NO-ANSWER-T' }[k] || k);
const full = { ai_feedback: "To'g'ri.", ai_feedback_i18n: { uz: "To'g'ri.", en: 'Correct.', ru: 'Верно.', ar: 'صحيح.' } };

// 1. every language comes back in its own language
assert.equal(pickFeedback(full, 'UZ', t), "To'g'ri.");
assert.equal(pickFeedback(full, 'EN', t), 'Correct.');
assert.equal(pickFeedback(full, 'RU', t), 'Верно.');
assert.equal(pickFeedback(full, 'AR', t), 'صحيح.');

// 2. an old row (Uzbek only) falls back to Uzbek and asks for a translation
const old = { ai_feedback: "Noto'g'ri, to'g'risi: كبير" };
assert.equal(pickFeedback(old, 'RU', t), "Noto'g'ri, to'g'risi: كبير");
assert.equal(needsFeedbackTranslation({ a: old }, 'RU'), true);
assert.equal(needsFeedbackTranslation({ a: old }, 'UZ'), false);   // Uzbek is the stored text
assert.equal(needsFeedbackTranslation({ a: full }, 'AR'), false);

// 3. the fixed "no answer" comment of old rows is translated locally, no AI call needed
assert.equal(pickFeedback({ ai_feedback: 'Javob yozilmagan.' }, 'EN', t), 'NO-ANSWER-T');

// 4. a JSON string from the database works too; a partly translated row asks for the missing language only
const asString = { ai_feedback: 'x', ai_feedback_i18n: JSON.stringify({ uz: 'x', en: 'y' }) };
assert.equal(pickFeedback(asString, 'EN', t), 'y');
assert.equal(needsFeedbackTranslation({ a: asString }, 'EN'), false);
assert.equal(needsFeedbackTranslation({ a: asString }, 'AR'), true);

// 5. rows without a comment never ask for translation
assert.equal(needsFeedbackTranslation({ a: { ai_feedback: '' }, b: null }, 'RU'), false);

// 6. dates follow the cabinet language
assert.equal(dateLocale('UZ'), 'uz-UZ'); assert.equal(dateLocale('xx'), 'en-GB');
assert.notEqual(fmtDate('2026-10-29T00:00:00', 'RU', { month: 'long' }), fmtDate('2026-10-29T00:00:00', 'EN', { month: 'long' }));
assert.equal(fmtDate('not a date', 'EN'), '');
assert.equal(currentLang(), 'EN');   // no localStorage in node → default, no crash

console.log('aiFeedback tests passed');
