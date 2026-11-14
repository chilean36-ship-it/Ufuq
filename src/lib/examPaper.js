/**
 * Paper-style written exams (like the printed "امتحان المنتصف" sheet): parts (النحو …), numbered sections
 * ("السؤال الأول: …") and items that restart at 1 in every section.
 *
 * No database change is needed: the structure travels inside `written_exam_questions.question_text` as optional
 * marker lines at the very top of a question, e.g.
 *
 *   @@part: النحو
 *   @@sec: السؤال الأول: افعل المطلوب بين القوسين
 *   @@bank: على|وجه|السلام          (matching only — the shuffled word list printed next to the section)
 *   العلم ............ (أكمل بخبر جملة اسمية)
 *
 * Only the first question of a section carries the markers. Exams written before this feature have no markers
 * and render as one plain numbered list, exactly as before.
 */

export const Q_TYPES = [
  ['short_answer', 'Short answer'], ['matching', 'Matching'], ['antonym', 'Antonym'],
  ['grammar', 'Grammar'], ['essay', 'Essay'], ['listening', 'Listening'],
];
export const TYPE_LABEL = Object.fromEntries(Q_TYPES);

/**
 * Listening items are stored as ordinary `short_answer` rows (the database only allows the five older types), told apart by
 * two more marker lines: `@@audio: /listening/level1/midterm-m1.mp3` and `@@opts: option 1|option 2|option 3`.
 * The student picks one option and the option's text is the saved answer; the correct option is the criteria (never sent to students).
 */
export const LISTENING_DB_TYPE = 'short_answer';
export const LISTENING_MAX_PLAYS = 2;
export const isListening = (p) => !!(p && p.audio && p.opts && p.opts.length > 1);

const MARK = /^@@(part|sec|bank|audio|opts):[ \t]*(.*)$/;

/** question_text → { part, sec, bank[], audio, opts[], body } */
export function parseQ(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const out = { part: '', sec: '', bank: null, audio: '', opts: null, body: '' };
  let i = 0;
  for (; i < lines.length; i++) {
    const m = lines[i].match(MARK);
    if (!m) break;
    if (m[1] === 'part') out.part = m[2].trim();
    else if (m[1] === 'sec') out.sec = m[2].trim();
    else if (m[1] === 'audio') out.audio = m[2].trim();
    else if (m[1] === 'opts') out.opts = m[2].split('|').map((w) => w.trim()).filter(Boolean);
    else out.bank = m[2].split('|').map((w) => w.trim()).filter(Boolean);
  }
  out.body = lines.slice(i).join('\n').trim();
  return out;
}

/** { part, sec, bank[], audio, opts[], body } → question_text */
export function buildQ({ part, sec, bank, audio, opts, body }) {
  const head = [];
  if (part && part.trim()) head.push('@@part: ' + part.trim());
  if (sec && sec.trim()) head.push('@@sec: ' + sec.trim());
  if (bank && bank.length) head.push('@@bank: ' + bank.join('|'));
  if (audio && audio.trim()) head.push('@@audio: ' + audio.trim());
  if (opts && opts.length) head.push('@@opts: ' + opts.join('|'));
  return head.concat([String(body || '').trim()]).join('\n');
}

/** Plain question text without markers (teacher grading view, AI prompts, previews). */
export function plainQ(text) { return parseQ(text).body; }

export function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}

/** Splits an answer of a two-field item (matching / antonym): first line = chosen word, the rest = the sentence. */
export function splitAnswer(text) {
  const s = String(text || '');
  const nl = s.indexOf('\n');
  return nl < 0 ? { word: s, sentence: '' } : { word: s.slice(0, nl), sentence: s.slice(nl + 1) };
}
export function joinAnswer(word, sentence) {
  return (word || '') + '\n' + (sentence || '');
}

/* ----------------------------------------------------------------- reading passages */
/* A reading question ("اقرأ الفقرة ثم أجب: <text> … 1. question") carries the passage inside its own text. The questions that
   follow it ("2. …", "ب) من الفقرة: …") are shown one at a time, so the student had to go back to re-read the passage.
   layoutQuestions() therefore hands every such follower the passage (item.passage), and the card prints it above the question.
   Rules are deliberately strict: an anchor starts with "اقرأ الفقرة|النص|القطعة …:"; a follower is a question of the same section
   that is either the next number of the anchor's own list (2., 3. …) or says "من الفقرة / في النص …"; the first question that is
   neither ends the run. */
const PASSAGE_HEAD = /^\s*اقرأ\s+(?:الفقرة|النص|القطعة)(?:\s+التالي(?:ة|ا)?)?[^:：\n]*[:：]/;
const PASSAGE_STOP = /^\s*\.?\s*(?:\d+|[ء-ي])\s*[.)]/;       // "1." / "2)" / "أ)" / ".ب)" starts the questions
const PASSAGE_REF = /(?:من|في|عن|حسب)\s+(?:الفقرة|النص|القطعة)/;
const LIST_NO = /^\s*(\d+)\s*[.)]/;

/** question body → { text, lastNo } when it is a reading question, else null. */
export function extractPassage(body) {
  const m = PASSAGE_HEAD.exec(String(body || ''));
  if (!m) return null;
  const lines = String(body).slice(m[0].length).split('\n');
  const out = [];
  let lastNo = 0;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (out.length === 0) { if (ln.trim() === '') continue; out.push(ln.trim()); continue; }   // the first text line is always passage
    if (ln.trim() === '' || PASSAGE_STOP.test(ln)) {
      // the passage is over; remember the last list number of this question ("1. …") for the numbering check
      for (let j = i; j < lines.length; j++) { const n = LIST_NO.exec(lines[j]); if (n) lastNo = Number(n[1]); }
      break;
    }
    out.push(ln.trim());
  }
  const text = out.join('\n').trim();
  return text.length >= 40 ? { text, lastNo } : null;
}

/** Student-side: walk the questions once and attach section info + a per-section item number (+ the passage a question refers to). */
export function layoutQuestions(questions) {
  let part = '', sec = '', bank = null, n = 0;
  const hasSections = questions.some((q) => /^@@sec:/m.test(q.question_text || ''));
  const laid = questions.map((q, idx) => {
    const p = parseQ(q.question_text);
    const newPart = p.part && p.part !== part;
    const newSec = !!p.sec;
    if (p.part) part = p.part;
    if (newSec) { sec = p.sec; bank = p.bank; n = 0; }
    n += 1;
    return {
      q, body: p.body,
      partHead: newPart ? p.part : '',
      secHead: newSec ? p.sec : '',
      bank: q.type === 'matching' ? (newSec ? p.bank : bank) : null,
      showBank: newSec && !!(p.bank && p.bank.length),
      audio: p.audio, opts: p.opts,
      number: hasSections ? n : idx + 1,
      passage: null,
    };
  });
  // reading passages: followers of a reading question get its text
  let active = null;
  laid.forEach((l) => {
    const own = l.audio ? null : extractPassage(l.body);
    if (own) { active = { text: own.text, last: own.lastNo }; return; }
    if (!active) return;
    const startsNew = !!(l.partHead || l.secHead);
    const no = LIST_NO.exec(l.body);
    const follows = !startsNew && !l.audio && (
      (no && active.last > 0 && Number(no[1]) === active.last + 1) || PASSAGE_REF.test(l.body));
    if (!follows) { active = null; return; }
    if (no) active.last = Number(no[1]);
    l.passage = active.text;
  });
  return laid;
}

/* ----------------------------------------------------------------- templates */
/* A template is a list of sections: { part, title, type, items: [{ text, criteria }] }.
   For matching, `text` = the first word and `criteria` = its partner (the partner list is shuffled on save). */

export const TEMPLATES = [
  {
    id: 'level7-midterm',
    label: 'Sample: Level 7 midterm (from the paper)',
    title: 'امتحان المنتصف للمستوى السابع',
    sections: [
      {
        part: '', title: 'السؤال الأول: أجب عن الأسئلة التالية', type: 'short_answer',
        items: [
          { text: 'ما الفرق بين القرآن المكي والقرآن المدني؟', criteria: '' },
          { text: 'كيف يكون الناشئ قدوة لزملائه؟', criteria: '' },
          { text: 'اذكر الحديث الذي يدعو إلى إتقان العمل؟', criteria: 'إن الله يحب إذا عمل أحدكم عملاً أن يتقنه' },
          { text: 'اذكر دعاء الخروج من البيت.', criteria: 'بسم الله، توكلت على الله، ولا حول ولا قوة إلا بالله' },
          { text: 'ما الفوائد التي حصلت عليها من دراسة هذا المستوى؟', criteria: 'جواب حر — يُقبل أي جواب معقول من الطالب' },
        ],
      },
      {
        part: '', title: 'السؤال الثاني: صل بين كل كلمتين تأتيان معاً ثم ضعهما في جملة', type: 'matching',
        items: [
          { text: 'إفشاء', criteria: 'السلام' },
          { text: 'ضبط', criteria: 'النفس' },
          { text: 'تقوى', criteria: 'الله' },
          { text: 'يحرص', criteria: 'على' },
          { text: 'أكمل', criteria: 'وجه' },
        ],
      },
      {
        part: '', title: 'السؤال الثالث: هات مضاد الكلمات التالية في جمل', type: 'antonym',
        items: [
          { text: 'اليسر', criteria: 'العسر' },
          { text: 'هادف', criteria: 'عابث / لاهٍ' },
          { text: 'أخيار', criteria: 'أشرار' },
          { text: 'يلي', criteria: 'يسبق' },
          { text: 'يضيع', criteria: 'يحفظ' },
        ],
      },
      {
        part: 'النحو', title: 'السؤال الأول: افعل المطلوب بين القوسين', type: 'grammar',
        items: [
          { text: 'العلم ............ (أكمل بخبر جملة اسمية)', criteria: 'مثال: العلم نوره ساطع' },
          { text: 'الصديقان ............ (أكمل بخبر جملة فعلية)', criteria: 'مثال: الصديقان يذهبان إلى المدرسة' },
          { text: 'السيارة أمام بيتي ............ (اجعل الخبر واجب التقديم)', criteria: 'أمام بيتي سيارة' },
          { text: 'ما مجتهدٌ إلا خالد ............ (لماذا تأخر المبتدأ؟)', criteria: 'لأن الخبر محصور بـ «إلا» فيجب تقديم الخبر وتأخير المبتدأ' },
          { text: 'أستاذنا حبيب القلوب ............ (بيّن نوع الخبر)', criteria: 'الخبر مفرد (حبيبُ القلوب خبر مفرد وهو مضاف)' },
        ],
      },
      {
        part: '', title: 'السؤال الثاني: أعرب الجمل التالية', type: 'grammar',
        items: [
          { text: '«إن للمتقين مفازاً»', criteria: 'إنَّ: حرف توكيد ونصب. للمتقين: شبه جملة (جار ومجرور) في محل رفع خبر إنَّ مقدم. مفازاً: اسم إنَّ منصوب مؤخر' },
          { text: '«متى نصر الله»', criteria: 'متى: اسم استفهام مبني في محل نصب ظرف زمان. نصرُ: مبتدأ مرفوع. الله: مضاف إليه مجرور' },
          { text: '«ولا يزالون مختلفين»', criteria: 'لا: نافية. يزالون: فعل مضارع ناقص (من أخوات كان) والواو اسمه. مختلفين: خبر يزال منصوب وعلامة نصبه الياء' },
        ],
      },
      {
        part: 'التعبير', title: 'اكتب صحيفة أو أكثر عن موضوع (يوم في حياتي) — اكتب بخط جميل ومناسب', type: 'essay',
        items: [
          { text: 'يوم في حياتي', criteria: 'تعبير حر: يُراعى سلامة اللغة والترتيب وعدد الجمل' },
        ],
      },
    ],
  },
  {
    id: 'easy-practice',
    label: 'Easy exercises (beginners)',
    title: 'تمارين سهلة — المستوى الأول',
    sections: [
      {
        part: 'اللغة', title: 'السؤال الأول: أجب عن الأسئلة التالية', type: 'short_answer',
        items: [
          { text: 'ما اسمك؟', criteria: 'اسمي ... (أي اسم صحيح)' },
          { text: 'ماذا تقول عند دخول البيت؟', criteria: 'السلام عليكم' },
          { text: 'ما لون السماء؟', criteria: 'السماء زرقاء' },
          { text: 'كم يوماً في الأسبوع؟', criteria: 'سبعة أيام' },
          { text: 'ماذا تقول قبل الأكل؟', criteria: 'بسم الله' },
        ],
      },
      {
        part: '', title: 'السؤال الثاني: صل بين كل كلمتين تأتيان معاً ثم ضعهما في جملة', type: 'matching',
        items: [
          { text: 'قرأ', criteria: 'الكتاب' },
          { text: 'شرب', criteria: 'الماء' },
          { text: 'فتح', criteria: 'الباب' },
          { text: 'كتب', criteria: 'الدرس' },
          { text: 'ذهب إلى', criteria: 'المدرسة' },
        ],
      },
      {
        part: '', title: 'السؤال الثالث: هات مضاد الكلمات التالية في جمل', type: 'antonym',
        items: [
          { text: 'كبير', criteria: 'صغير' },
          { text: 'طويل', criteria: 'قصير' },
          { text: 'حار', criteria: 'بارد' },
          { text: 'جديد', criteria: 'قديم' },
          { text: 'سهل', criteria: 'صعب' },
        ],
      },
      {
        part: 'النحو', title: 'السؤال الأول: افعل المطلوب بين القوسين', type: 'grammar',
        items: [
          { text: 'الطالب ............ (أكمل بخبر مفرد)', criteria: 'مثال: الطالب مجتهد' },
          { text: 'الأولاد ............ (أكمل بخبر جملة فعلية)', criteria: 'مثال: الأولاد يلعبون' },
          { text: 'الحديقة ............ (أكمل بخبر شبه جملة)', criteria: 'مثال: الحديقة أمام البيت' },
          { text: 'الجو جميل — حدد المبتدأ والخبر', criteria: 'المبتدأ: الجو، الخبر: جميل' },
          { text: 'أعرب: الكتابُ مفيدٌ', criteria: 'الكتابُ: مبتدأ مرفوع وعلامة رفعه الضمة. مفيدٌ: خبر مرفوع وعلامة رفعه الضمة' },
        ],
      },
      {
        part: 'التعبير', title: 'اكتب خمس جمل عن موضوع (بيتي)', type: 'essay',
        items: [{ text: 'بيتي', criteria: 'خمس جمل صحيحة ومترابطة' }],
      },
    ],
  },
];

/* ----------------------------------------------------------- listening sections */
/* One ready-made listening section per exam kind of a level (5 questions, Arabic only). The mp3 files live in
   public/listening/ and are made by scripts/gen-listening-audio.mjs from the same texts. The correct option is the `criteria`. */
export const LISTENING_SECTIONS = {
  1: {
    midterm: {
      part: '', title: "الاستماع: استمع إلى الصوت ثم اختر الإجابة الصحيحة", type: 'listening',
      items: [
        { text: "مِنْ أَيْنَ زَيْنَب؟", criteria: "مِنْ مِصْرَ",
          audio: "/listening/level1/midterm-m1.mp3", opts: ["مِنْ سُورِيَا","مِنْ مِصْرَ","مِنْ تُرْكِيَا"] },
        { text: "مَا مِهْنَةُ وَالِدِ عَلِيّ؟", criteria: "مُهَنْدِس",
          audio: "/listening/level1/midterm-m2.mp3", opts: ["طَبِيب","مُدَرِّس","مُهَنْدِس"] },
        { text: "كَمْ غُرْفَةً فِي البَيْتِ؟", criteria: "ثَلَاثُ غُرَف",
          audio: "/listening/level1/midterm-m3.mp3", opts: ["ثَلَاثُ غُرَف","أَرْبَعُ غُرَف","خَمْسُ غُرَف"] },
        { text: "مَتَى يَسْتَيْقِظُ طَارِق يَوْمَ العُطْلَة؟", criteria: "مُتَأَخِّراً",
          audio: "/listening/level1/midterm-m4.mp3", opts: ["مُبَكِّراً","مُتَأَخِّراً","عِنْدَ الفَجْر"] },
        { text: "اخْتَرِ الجَوَابَ المُنَاسِب.", criteria: "أَقْرَأُ القُرْآن",
          audio: "/listening/level1/midterm-m5.mp3", opts: ["أَذْهَبُ بِالحَافِلَة","أَسْتَيْقِظُ مُبَكِّراً","أَقْرَأُ القُرْآن"] },
      ],
    },
    final: {
      part: '', title: "الاستماع: استمع إلى الصوت ثم اختر الإجابة الصحيحة", type: 'listening',
      items: [
        { text: "مَاذَا تَطْلُبُ المُسَافِرَةُ مِنَ الطَّعَام؟", criteria: "الدَّجَاجُ وَالخُبْز",
          audio: "/listening/level1/final-f1.mp3", opts: ["السَّمَكُ وَالأَرُزّ","الدَّجَاجُ وَالخُبْز","اللَّحْمُ وَالسَّلَطَة"] },
        { text: "كَيْفَ يُسَافِرُ صَالِح إِلَى المَدِينَة؟", criteria: "بِالطَّائِرَة",
          audio: "/listening/level1/final-f2.mp3", opts: ["بِالسَّيَّارَة","بِالحَافِلَة","بِالطَّائِرَة"] },
        { text: "كَمْ حِصَّةً يَدْرُسُ غَسَّان فِي اليَوْم؟", criteria: "سِتُّ حِصَص",
          audio: "/listening/level1/final-f3.mp3", opts: ["سِتُّ حِصَص","خَمْسُ حِصَص","سَبْعُ حِصَص"] },
        { text: "كَمْ طِفْلاً لِمَرْيَم؟", criteria: "خَمْسَةُ أَطْفَال",
          audio: "/listening/level1/final-f4.mp3", opts: ["ثَلَاثَةُ أَطْفَال","سِتَّةُ أَطْفَال","خَمْسَةُ أَطْفَال"] },
        { text: "اخْتَرِ الجَوَابَ المُنَاسِب.", criteria: "أُصَلِّي الفَجْرَ فِي البَيْت",
          audio: "/listening/level1/final-f5.mp3", opts: ["أُصَلِّي الفَجْرَ فِي البَيْت","أُصَلِّي الظُّهْرَ فِي المَسْجِد","أَذْهَبُ بِالسَّيَّارَة"] },
      ],
    },
  },
};
