/* Extra landing / site strings (nested like uz.js etc.). Merged in i18n/index.js. */
const en = {
  fp: {
    title: 'Forgot your password?',
    sub: 'Enter the email of your account. We will send you a secure link and, if your email contains one, a 6-digit code.',
    send: 'Send', sending: 'Sending…',
    sentTitle: 'Check your email',
    sentSub: 'We sent a message to {email}. Open the link in it to continue, or type the 6-digit code below if the email has one.',
    code: 'Code from the email', verify: 'Confirm code', verifying: 'Checking…',
    resend: 'Send again', resendIn: 'Send again in {s}s',
    newTitle: 'Create a new password', newSub: 'Choose a password with at least 8 characters.',
    pw1: 'New password', pw2: 'Repeat the password', save: 'Save and sign in', saving: 'Saving…',
    mismatch: 'The passwords do not match.', short: 'The password must be at least 8 characters.',
    badCode: 'The code is wrong or has expired.', tooMany: 'Too many attempts. Please wait a minute and try again.',
    failed: 'Something went wrong. Please try again.', back: 'Back to sign in', close: 'Close',
    sentOk: 'If this email has an account, a message is on its way.',
  },
};
const uz = {
  fp: {
    title: 'Parolni unutdingizmi?',
    sub: 'Akkauntingiz emailini kiriting. Biz xavfsiz havola yuboramiz, xatda 6 xonali kod bo‘lsa, uni ham kiritishingiz mumkin.',
    send: 'Yuborish', sending: 'Yuborilmoqda…',
    sentTitle: 'Emailingizni tekshiring',
    sentSub: '{email} manziliga xat yubordik. Davom etish uchun undagi havolani oching yoki xatda 6 xonali kod bo‘lsa, pastga kiriting.',
    code: 'Xatdagi kod', verify: 'Kodni tasdiqlash', verifying: 'Tekshirilmoqda…',
    resend: 'Qayta yuborish', resendIn: '{s} soniyadan keyin qayta yuborish',
    newTitle: 'Yangi parol yarating', newSub: 'Kamida 8 belgidan iborat parol tanlang.',
    pw1: 'Yangi parol', pw2: 'Parolni takrorlang', save: 'Saqlash va kirish', saving: 'Saqlanmoqda…',
    mismatch: 'Parollar mos kelmadi.', short: 'Parol kamida 8 belgidan iborat bo‘lishi kerak.',
    badCode: 'Kod noto‘g‘ri yoki muddati o‘tgan.', tooMany: 'Urinishlar juda ko‘p. Bir daqiqadan keyin qayta urining.',
    failed: 'Xatolik yuz berdi. Qayta urinib ko‘ring.', back: 'Kirishga qaytish', close: 'Yopish',
    sentOk: 'Agar bu email bilan akkaunt bo‘lsa, xat yuborildi.',
  },
};
const ru = {
  fp: {
    title: 'Забыли пароль?',
    sub: 'Введите email вашего аккаунта. Мы отправим безопасную ссылку и, если в письме есть 6-значный код, вы сможете ввести его.',
    send: 'Отправить', sending: 'Отправка…',
    sentTitle: 'Проверьте почту',
    sentSub: 'Мы отправили письмо на {email}. Откройте ссылку в нём или введите ниже 6-значный код, если он есть в письме.',
    code: 'Код из письма', verify: 'Подтвердить код', verifying: 'Проверка…',
    resend: 'Отправить ещё раз', resendIn: 'Отправить ещё раз через {s} с',
    newTitle: 'Создайте новый пароль', newSub: 'Выберите пароль не короче 8 символов.',
    pw1: 'Новый пароль', pw2: 'Повторите пароль', save: 'Сохранить и войти', saving: 'Сохранение…',
    mismatch: 'Пароли не совпадают.', short: 'Пароль должен быть не короче 8 символов.',
    badCode: 'Код неверный или просрочен.', tooMany: 'Слишком много попыток. Подождите минуту и повторите.',
    failed: 'Что-то пошло не так. Попробуйте ещё раз.', back: 'Назад ко входу', close: 'Закрыть',
    sentOk: 'Если для этого email есть аккаунт, письмо уже в пути.',
  },
};
const ar = {
  fp: {
    title: 'هل نسيت كلمة المرور؟',
    sub: 'أدخل بريد حسابك الإلكتروني. سنرسل رابطًا آمنًا، وإن كانت الرسالة تحتوي على رمز من 6 أرقام فيمكنك إدخاله.',
    send: 'إرسال', sending: 'جارٍ الإرسال…',
    sentTitle: 'تحقق من بريدك',
    sentSub: 'أرسلنا رسالة إلى {email}. افتح الرابط فيها للمتابعة، أو اكتب الرمز المكوّن من 6 أرقام أدناه إن وُجد في الرسالة.',
    code: 'الرمز من الرسالة', verify: 'تأكيد الرمز', verifying: 'جارٍ التحقق…',
    resend: 'إعادة الإرسال', resendIn: 'إعادة الإرسال بعد {s} ث',
    newTitle: 'أنشئ كلمة مرور جديدة', newSub: 'اختر كلمة مرور لا تقل عن 8 أحرف.',
    pw1: 'كلمة المرور الجديدة', pw2: 'أعد كتابة كلمة المرور', save: 'حفظ وتسجيل الدخول', saving: 'جارٍ الحفظ…',
    mismatch: 'كلمتا المرور غير متطابقتين.', short: 'يجب ألا تقل كلمة المرور عن 8 أحرف.',
    badCode: 'الرمز خاطئ أو منتهي الصلاحية.', tooMany: 'محاولات كثيرة. انتظر دقيقة ثم أعد المحاولة.',
    failed: 'حدث خطأ. حاول مرة أخرى.', back: 'العودة إلى تسجيل الدخول', close: 'إغلاق',
    sentOk: 'إن كان لهذا البريد حساب، فالرسالة في الطريق.',
  },
};
export default { EN: en, UZ: uz, RU: ru, AR: ar };
