/* Entry points to payment on the public site (pricing card). Nested under `payEntry`. Merged in i18n/index.js. */
const en = { payEntry: {
  ctaMonthly: 'Pay monthly — $30', ctaYearly: 'Pay yearly — $298.80',
  haveAccount: 'Already have an account?', signinToPay: 'Sign in to pay',
  methods: 'Payment methods', card: 'Bank card', bank: 'Bank transfer', secure: 'Secure payment',
  note: 'Pay in advance for the period you choose. Nothing renews automatically.',
} };
const uz = { payEntry: {
  ctaMonthly: 'Oylik to‘lash — $30', ctaYearly: 'Yillik to‘lash — $298.80',
  haveAccount: 'Akkauntingiz bormi?', signinToPay: 'Kirib to‘lash',
  methods: 'To‘lov usullari', card: 'Bank kartasi', bank: 'Bank o‘tkazmasi', secure: 'Xavfsiz to‘lov',
  note: 'Tanlangan muddat uchun oldindan to‘lanadi. Hech narsa o‘zi yangilanmaydi.',
} };
const ru = { payEntry: {
  ctaMonthly: 'Оплатить месяц — $30', ctaYearly: 'Оплатить год — $298.80',
  haveAccount: 'Уже есть аккаунт?', signinToPay: 'Войти и оплатить',
  methods: 'Способы оплаты', card: 'Банковская карта', bank: 'Банковский перевод', secure: 'Безопасная оплата',
  note: 'Оплата вперёд за выбранный период. Ничего не продлевается автоматически.',
} };
const ar = { payEntry: {
  ctaMonthly: 'ادفع شهريًا — $30', ctaYearly: 'ادفع سنويًا — $298.80',
  haveAccount: 'لديك حساب بالفعل؟', signinToPay: 'سجّل الدخول للدفع',
  methods: 'طرق الدفع', card: 'بطاقة بنكية', bank: 'تحويل بنكي', secure: 'دفع آمن',
  note: 'الدفع مقدّمًا عن المدة التي تختارها. لا يتجدد أي شيء تلقائيًا.',
} };
export default { EN: en, UZ: uz, RU: ru, AR: ar };
