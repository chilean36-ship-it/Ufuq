/* The AI comment on a written-exam answer exists in four languages (uz / en / ru / ar).
   written_exam_answers.ai_feedback keeps the Uzbek text (older rows have nothing else);
   written_exam_answers.ai_feedback_i18n holds all four: { uz, en, ru, ar }. */

const NO_ANSWER_UZ = 'Javob yozilmagan.';   // the fixed comment the server gives to an empty answer

function readI18n(a) {
  let v = a && a.ai_feedback_i18n;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
  return v && typeof v === 'object' ? v : null;
}

/**
 * The comment in the language the person chose in the cabinet ('EN' | 'UZ' | 'RU' | 'AR').
 * `t` is only used for the fixed "no answer" comment of old rows. Falls back to the Uzbek text
 * while a translation is still missing (needsFeedbackTranslation() tells the screen to fetch it).
 */
export function pickFeedback(a, lang, t) {
  if (!a) return '';
  const code = String(lang || 'EN').toLowerCase();
  const map = readI18n(a);
  if (map && typeof map[code] === 'string' && map[code].trim()) return map[code];
  const base = typeof a.ai_feedback === 'string' ? a.ai_feedback.trim() : '';
  if (base === NO_ANSWER_UZ && typeof t === 'function') return t('No answer was written.');
  return base;
}

/** True when some answer has an AI comment but not yet in this language. */
export function needsFeedbackTranslation(answers, lang) {
  const code = String(lang || 'EN').toLowerCase();
  if (code === 'uz') return false;
  return Object.values(answers || {}).some((a) => {
    if (!a || !a.ai_feedback || !String(a.ai_feedback).trim()) return false;
    const map = readI18n(a);
    return !(map && typeof map[code] === 'string' && map[code].trim());
  });
}
