// Profile page strings that were missing in some languages (level names, account deletion + security-check messages).
const LEVELS = {
  EN: ['Beginner', 'Elementary', 'Pre-Intermediate', 'Intermediate', 'Upper-Intermediate', 'Advanced', 'Proficient', 'Mastery', 'Expert', 'Scholar', 'Distinguished', 'Elite', 'Sage', 'Luminary'],
  UZ: ["Boshlang'ich", "Elementar", "O'rtadan quyi", "O'rta", "O'rtadan yuqori", "Ilg'or", "Malakali", "Mukammal", "Ekspert", "Olim", "Taniqli", "Oliy", "Hakim", "Alloma"],
  RU: ['Начальный', 'Элементарный', 'Ниже среднего', 'Средний', 'Выше среднего', 'Продвинутый', 'Свободный', 'Мастерство', 'Эксперт', 'Знаток', 'Выдающийся', 'Элита', 'Мудрец', 'Светило'],
  AR: ['مبتدئ', 'أساسي', 'ما قبل المتوسط', 'متوسط', 'فوق المتوسط', 'متقدم', 'محترف', 'إتقان', 'خبير', 'عالم', 'متميز', 'نخبة', 'حكيم', 'علّامة'],
};
const EN_LEVELS = LEVELS.EN;
const MSG = {
  EN: {
    'Security check is not finished yet. Please wait a moment and try again.': 'Security check is not finished yet. Please wait a moment and try again.',
    'Security check was not passed. Please try again.': 'Security check was not passed. Please try again.',
    'Could not delete the account. Please try again or contact support.': 'Could not delete the account. Please try again or contact support.',
    'Back': 'Back',
  },
  UZ: {
    'Security check is not finished yet. Please wait a moment and try again.': 'Xavfsizlik tekshiruvi hali tugamadi. Biroz kuting va qayta urinib ko‘ring.',
    'Security check was not passed. Please try again.': 'Xavfsizlik tekshiruvidan o‘tilmadi. Qayta urinib ko‘ring.',
    'Could not delete the account. Please try again or contact support.': 'Hisobni o‘chirib bo‘lmadi. Qayta urinib ko‘ring yoki qo‘llab-quvvatlash xizmatiga murojaat qiling.',
    'Back': 'Orqaga',
  },
  RU: {
    'Security check is not finished yet. Please wait a moment and try again.': 'Проверка безопасности ещё не завершена. Подождите немного и попробуйте снова.',
    'Security check was not passed. Please try again.': 'Проверка безопасности не пройдена. Попробуйте снова.',
    'Could not delete the account. Please try again or contact support.': 'Не удалось удалить аккаунт. Попробуйте снова или обратитесь в поддержку.',
    'Back': 'Назад',
  },
  AR: {
    'Security check is not finished yet. Please wait a moment and try again.': 'لم يكتمل التحقق الأمني بعد. يرجى الانتظار قليلاً والمحاولة مرة أخرى.',
    'Security check was not passed. Please try again.': 'لم يتم اجتياز التحقق الأمني. حاول مرة أخرى.',
    'Could not delete the account. Please try again or contact support.': 'تعذّر حذف الحساب. حاول مرة أخرى أو تواصل مع الدعم.',
    'Back': 'رجوع',
  },
};
const out = {};
Object.keys(MSG).forEach((l) => {
  out[l] = { ...MSG[l] };
  EN_LEVELS.forEach((k, i) => { out[l][k] = LEVELS[l][i]; });
});
export default out;
