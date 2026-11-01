/*
 * Standard exam names in four languages. A exam that has exam_kind ('midterm' | 'final') and a level is shown
 * with the name of its kind and level, in the language the person chose (AR, EN, RU, UZ). Older/custom exams
 * without a kind keep their own title.
 */
import { MAX_LEVEL } from './levels';
const ORDINAL_AR = ['', 'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر', 'الحادي عشر', 'الثاني عشر', 'الثالث عشر', 'الرابع عشر'];

const NAMES = {
  AR: { midterm: (n) => 'اختبار المنتصف للمستوى ' + ORDINAL_AR[n], final: (n) => 'الاختبار النهائي للمستوى ' + ORDINAL_AR[n] },
  EN: { midterm: (n) => 'Midterm exam — Level ' + n, final: (n) => 'Final exam — Level ' + n },
  RU: { midterm: (n) => 'Промежуточный экзамен — уровень ' + n, final: (n) => 'Итоговый экзамен — уровень ' + n },
  UZ: { midterm: (n) => "O'rta imtihon — " + n + '-daraja', final: (n) => 'Yakuniy imtihon — ' + n + '-daraja' },
};

/** Display title of an exam in the given language code ('AR' | 'EN' | 'RU' | 'UZ'). */
export function examTitleFor(exam, lang) {
  if (!exam) return '';
  const dict = NAMES[lang] || NAMES.EN;
  if ((exam.exam_kind === 'midterm' || exam.exam_kind === 'final') && exam.level >= 1 && exam.level <= MAX_LEVEL) {
    return dict[exam.exam_kind](exam.level);
  }
  return exam.title || '';
}
