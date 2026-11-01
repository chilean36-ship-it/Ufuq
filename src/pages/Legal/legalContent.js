import { LEGAL, ph } from './legalConfig';

/** Short strings used around the site (consent lines, footer, page chrome). */
export const LEGAL_UI = {
  EN: {
    consentPrefix: 'By continuing, you agree to Ufuq\'s', terms: 'Terms of Service', and: 'and', privacy: 'Privacy Policy',
    checkoutRefund: 'Refund Policy', updated: 'Last updated', back: 'Back to Ufuq', contents: 'Contents',
    fallback: '', footerTitle: 'Legal', cookies: 'Cookie Policy', refund: 'Refund Policy',
    docs: { terms: 'Terms of Service', privacy: 'Privacy Policy', cookies: 'Cookie Policy', refund: 'Refund Policy' },
  },
  UZ: {
    consentPrefix: 'Davom etish orqali siz Ufuqning', terms: 'Foydalanish shartlari', and: 'va', privacy: 'Maxfiylik siyosatiga',
    checkoutRefund: 'Pulni qaytarish siyosati', updated: 'Oxirgi yangilanish', back: 'Ufuqqa qaytish', contents: 'Mundarija',
    fallback: '', footerTitle: 'Huquqiy', cookies: 'Cookie siyosati', refund: 'Pulni qaytarish siyosati',
    docs: { terms: 'Foydalanish shartlari', privacy: 'Maxfiylik siyosati', cookies: 'Cookie siyosati', refund: 'Pulni qaytarish siyosati' },
  },
  RU: {
    consentPrefix: 'Продолжая, вы соглашаетесь с', terms: 'Условиями использования', and: 'и', privacy: 'Политикой конфиденциальности',
    checkoutRefund: 'Политикой возврата', updated: 'Последнее обновление', back: 'Вернуться в Ufuq', contents: 'Содержание',
    fallback: 'Полный текст документа доступен на английском и узбекском языках. Ниже показана английская версия; при расхождениях ориентируйтесь на неё.',
    footerTitle: 'Правовая информация', cookies: 'Политика cookie', refund: 'Политика возврата',
    docs: { terms: 'Условия использования', privacy: 'Политика конфиденциальности', cookies: 'Политика cookie', refund: 'Политика возврата' },
  },
  AR: {
    consentPrefix: 'بمتابعتك فإنك توافق على', terms: 'شروط الخدمة', and: 'و', privacy: 'سياسة الخصوصية',
    checkoutRefund: 'سياسة الاسترداد', updated: 'آخر تحديث', back: 'العودة إلى أُفُق', contents: 'المحتويات',
    fallback: 'النص الكامل متوفر بالإنجليزية والأوزبكية. تُعرض أدناه النسخة الإنجليزية وهي المرجع عند أي اختلاف.',
    footerTitle: 'قانوني', cookies: 'سياسة ملفات تعريف الارتباط', refund: 'سياسة الاسترداد',
    docs: { terms: 'شروط الخدمة', privacy: 'سياسة الخصوصية', cookies: 'سياسة ملفات تعريف الارتباط', refund: 'سياسة الاسترداد' },
  },
};

export const legalUi = (lang) => LEGAL_UI[lang] || LEGAL_UI.EN;

const who = () => ph(LEGAL.operator, 'operator legal name');
const mail = () => ph(LEGAL.email, 'contact e-mail');
const addr = () => ph(LEGAL.address, 'registered address');
const law = () => ph(LEGAL.governingLaw, 'governing law / jurisdiction');

/* Each doc: [{ h: heading, p: [paragraph...], ul: [bullet...] }] */
const EN = () => ({
  terms: [
    { h: '1. Who we are and what these Terms cover', p: [
      `Ufuq (“Ufuq”, “we”, “us”) is an online Arabic-learning platform operated by ${who()}, ${addr()}. These Terms of Service govern your use of the Ufuq website, student dashboard, teacher and admin panels, live lessons, AI assistant and any related services (the “Service”).`,
      'By creating an account, signing in, purchasing a plan or otherwise using the Service you confirm that you have read and agree to these Terms and to our Privacy Policy. If you do not agree, please do not use the Service.' ] },
    { h: '2. Eligibility and accounts', p: [
      `You must be at least ${LEGAL.minAge} years old to create an account. If you are younger, a parent or legal guardian must create or approve the account and accepts these Terms on your behalf.`,
      'You must provide accurate information, keep your password confidential and are responsible for everything that happens under your account. Tell us promptly if you suspect unauthorised access. One account is for one person; sharing accounts or reselling access is not allowed.' ] },
    { h: '3. Plans, prices and payment', p: [
      'Some features are free; others need an active paid plan. A plan gives access for a fixed period (for example 1 or 12 months) that you pay for in advance. Prices are set in US dollars. At checkout we show an estimate in your local currency and the exact amount that will be charged (normally in Egyptian pounds, EGP) before you pay; exchange rates and your bank’s fees can make the amount on your statement differ slightly.',
      'Plans do not renew automatically. We never store your card details and never charge you again unless you make a new purchase; we send a reminder before your access ends. Taxes (such as VAT) are shown on your invoice where they apply. When access ends, the paid sections are locked, but your account and data stay.',
      'Card payments are processed by Paymob, a licensed payment provider, on its own secure page. You can also pay by bank transfer; then access starts after we see the money on our bank statement. By paying you ask for access to start immediately. Refunds are governed by the Refund Policy and by any statutory rights you have.' ] },
    { h: '4. Acceptable use', p: ['You agree not to:'], ul: [
      'break the law, or infringe other people’s rights;',
      'harass, insult or discriminate against other students or teachers, or post offensive, hateful or sexual content;',
      'upload malware, attempt to access other users’ data, probe or disrupt the Service, or bypass technical limits;',
      'record, copy, publish or resell lessons, materials, exams or answers without our written permission;',
      'cheat in exams or tests, including using the Service on behalf of someone else;',
      'use automated tools (bots, scrapers) against the Service.' ] },
    { h: '5. AI assistant', p: [
      'Ufuq includes an AI assistant (text and optional voice) that helps you practise Arabic. Your messages are sent to an AI provider to generate answers.',
      'AI output can be wrong, incomplete or out of date. It is a study aid, not a replacement for your teacher, and must not be relied on for religious rulings, legal, medical or other professional advice. Do not enter passwords, payment-card numbers or other sensitive personal data into the chat.' ] },
    { h: '6. Live lessons, recordings and exams', p: [
      'Live lessons run through third-party video tools (such as Zoom) and may be recorded for the students of the relevant group. By joining a lesson you accept that your voice, image and name may be visible to the group and, where recording is announced, captured in the recording.',
      'During exams we may apply integrity measures (for example full-screen mode and counting of tab switches, copy/paste and print attempts). Violations are shown to you and reported to your teacher together with your result. These measures do not access your camera, microphone or files.' ] },
    { h: '7. Content and intellectual property', p: [
      'All lessons, texts, audio, video, design, logos and software of the Service belong to Ufuq or its licensors and are licensed to you for personal, non-commercial learning only.',
      'Content you submit (messages, homework, profile photo) stays yours. You grant us a limited licence to host, display and process it only to run the Service (for example showing your homework to your teacher). You confirm you have the right to submit it.' ] },
    { h: '8. Third-party services', p: [
      'The Service relies on providers such as hosting/database and authentication (Supabase), video lessons (Zoom), Google sign-in, AI and speech providers and payment processors. Their own terms and privacy notices apply to their services.' ] },
    { h: '9. Availability and changes', p: [
      'We work to keep the Service available but do not guarantee uninterrupted or error-free operation; maintenance, outages or events outside our control may occur. We may change, add or remove features, and update these Terms. For material changes we will notify you (for example by e-mail or a notice in the app); continued use after the effective date means you accept the updated Terms.' ] },
    { h: '10. Suspension and termination', p: [
      'You can stop using the Service and delete your account at any time (see the Privacy Policy). We may suspend or close an account that seriously or repeatedly breaks these Terms or the law; where reasonable we will warn you first. Sections that by nature should survive (intellectual property, liability, governing law) continue after termination.' ] },
    { h: '11. Disclaimers and limitation of liability', p: [
      'The Service is provided “as is” and “as available”. Language learning results depend on your own effort and we cannot promise a particular level or outcome.',
      'To the maximum extent permitted by law, Ufuq is not liable for indirect or consequential loss, lost profits or lost data, and our total liability for any claim is limited to the amount you paid us in the 12 months before the claim. Nothing in these Terms limits liability that cannot be limited by law, including your mandatory consumer rights.' ] },
    { h: '12. Governing law and disputes', p: [
      `These Terms are governed by the laws of ${law()}, without affecting any mandatory consumer-protection rules of your country of residence. We encourage you to contact us first so we can try to resolve a problem informally; otherwise disputes are handled by the competent courts of that jurisdiction.` ] },
    { h: '13. Contact', p: [`Questions about these Terms: ${mail()} or via Telegram support (${LEGAL.supportUrl}).`] },
  ],
  privacy: [
    { h: '1. Who is responsible', p: [
      `${who()}, ${addr()} (“Ufuq”) is the controller of the personal data processed through the Service. Contact: ${mail()}.`,
      'This policy explains what we collect, why, who receives it and what choices you have.' ] },
    { h: '2. What we collect', ul: [
      'Account data: name, e-mail, password (stored only as a secure hash by our authentication provider), profile photo, chosen language and role. If you sign in with Google we receive your name, e-mail and avatar from Google.',
      'Learning data: groups, attendance, homework and task submissions, grades, exam answers and results, exam-integrity events (e.g. number of tab switches), progress and goals.',
      'Messages: group-chat messages and messages you send to the AI assistant. Chat history of the AI assistant is stored in your own browser.',
      'Voice: if you use voice mode, audio is processed to convert speech to text; we do not keep audio recordings beyond what is needed to provide the feature, unless a live lesson is recorded and announced.',
      'Payment data: billing name, e-mail, country, plan and transaction status. Card payments are processed by Paymob; card details never reach Ufuq. Bank-transfer receipts are kept in private storage visible only to you and Ufuq administrators. Invoices and payment records are kept for the period required by tax and accounting law, even after an account is deleted (the link to your profile is removed).',
      'Technical data: device/browser type, IP address, language, error logs and usage events needed for security and reliability.' ] },
    { h: '3. Why we use it', ul: [
      'to create and run your account and deliver lessons, groups, tasks, exams and the AI assistant (performance of the contract);',
      'to process payments and prevent fraud (contract, legal obligation, legitimate interest);',
      'to keep the Service secure, fix bugs and improve it (legitimate interest);',
      'to send service messages such as password resets and important notices;',
      'to send marketing or news only if you opted in — you can opt out at any time;',
      'to comply with legal obligations.' ], p: ['We do not sell your personal data and we do not use it for third-party advertising.'] },
    { h: '4. Who we share it with', p: [
      'We share data only with service providers that help us run Ufuq, under contract and only as needed: database, authentication and file storage (Supabase); video lessons (Zoom); AI and speech-to-text providers; payment processors; Google (if you use Google sign-in). Your teachers and group admins can see your learning data and name/avatar for groups you belong to. We may disclose data if required by law or to protect rights and safety.' ] },
    { h: '5. International transfers', p: [
      'Our providers may process data in countries other than yours. Where required we rely on appropriate safeguards such as contractual clauses.' ] },
    { h: '6. Retention', p: [
      'We keep data while your account is active and as long as needed to provide the Service, then delete or anonymise it, except where we must keep it longer (for example payment records for tax and accounting) or to handle disputes. Exam and attendance records may be kept for the duration of the course.' ] },
    { h: '7. Your rights', p: [
      'Depending on your country you may have the right to access, correct, delete or export your data, to object to or restrict some processing, to withdraw consent and to complain to your data-protection authority. You can edit your name and photo in your profile; to delete your account or exercise other rights, contact us at the address above. We will respond within a reasonable time (generally within 30 days).' ] },
    { h: '8. Children', p: [
      `The Service is not directed at children under ${LEGAL.minAge}. Younger learners may use it only through an account created or approved by a parent or guardian, who can ask us to access or delete the child’s data at any time. If you believe a child has registered without permission, contact us and we will remove the account.` ] },
    { h: '9. Security', p: [
      'We use encryption in transit, access controls and role-based permissions. No system is perfectly secure; please use a strong unique password and tell us if you suspect a problem. If a breach affects your data we will notify you and the authorities as the law requires.' ] },
    { h: '10. Cookies and local storage', p: ['See our Cookie Policy for what is stored in your browser.'] },
    { h: '11. Changes', p: ['We may update this policy; the date at the top shows the latest version. For material changes we will notify you in the app or by e-mail.'] },
  ],
  cookies: [
    { h: '1. What this covers', p: ['Ufuq uses cookies and similar browser storage (localStorage / sessionStorage). We do not use advertising or cross-site tracking cookies.'] },
    { h: '2. What we store', ul: [
      'Strictly necessary: your sign-in session (needed to stay logged in) and security tokens.',
      'Preferences: interface language, light/dark theme, collapsed menus, last selected tabs.',
      'Features: AI assistant chat history, drafts and cached role information, kept only in your browser.',
      'Third-party: Google sign-in, Zoom and embedded media may set their own cookies when you use them.' ] },
    { h: '3. Your choices', p: [
      'Strictly necessary storage cannot be switched off without breaking sign-in. You can clear or block cookies and site data in your browser settings; preferences and local chat history will then be reset.' ] },
    { h: '4. Contact', p: [`Questions: ${mail()}.`] },
  ],
  refund: [
    { h: '1. Overview', p: ['We want you to be happy with Ufuq. This policy explains when you can get your money back for a paid plan or course.'] },
    { h: '2. Refund window', p: [`You can request a full refund within ${LEGAL.refundDays} days of a payment, provided that in this period you have attended no more than 2 live lessons and have not downloaded course materials in bulk.`] },
    { h: '3. After that', ul: [
      'Bank-transfer refunds are returned to the account the money came from. Card refunds go back to the same card.',
      'If you are a consumer with a statutory right to withdraw from a digital service, you agree at checkout that access starts immediately; where the law allows, the right of withdrawal then ends for the part already provided, but the refund window above still applies to you.',
      'Fees for a period already started are generally non-refundable, but we may refund the unused part in justified cases (for example a long outage, or if we cancel a course).',
      'If we cancel or fundamentally change a paid course, you can choose a refund for the remaining lessons or a transfer to another group.',
      'Accounts closed for breaking the Terms are not eligible for a refund.' ] },
    { h: '4. How to request a refund', p: [
      `Write to ${mail()} or Telegram support (${LEGAL.supportUrl}) with the e-mail of your account and the payment date. We reply within 5 business days; approved refunds are returned to the original payment method, which may take up to 14 days to appear depending on your bank.` ] },
    { h: '5. Your statutory rights', p: ['Nothing here limits consumer rights that apply by law in your country.'] },
  ],
});

const UZ = () => ({
  terms: [
    { h: '1. Biz kimmiz va bu Shartlar nimani qamrab oladi', p: [
      `Ufuq («Ufuq», «biz») — ${who()}, ${addr()} tomonidan yuritiladigan onlayn arab tili o‘rgatish platformasi. Ushbu Foydalanish shartlari Ufuq veb-sayti, talaba kabineti, o‘qituvchi va admin panellari, jonli darslar, AI yordamchi va barcha bog‘liq xizmatlardan («Xizmat») foydalanishingizni tartibga soladi.`,
      'Hisob yaratish, tizimga kirish, tarifni sotib olish yoki Xizmatdan boshqacha foydalanish orqali siz ushbu Shartlar va Maxfiylik siyosatini o‘qiganingizni va ularga rozi ekaningizni tasdiqlaysiz. Rozi bo‘lmasangiz, Xizmatdan foydalanmang.' ] },
    { h: '2. Yosh chegarasi va hisoblar', p: [
      `Hisob yaratish uchun kamida ${LEGAL.minAge} yoshda bo‘lishingiz kerak. Yoshingiz kichik bo‘lsa, hisobni ota-ona yoki qonuniy vakil yaratishi yoki tasdiqlashi shart; ular sizning nomingizdan ushbu Shartlarni qabul qiladi.`,
      'To‘g‘ri ma’lumot kiritishingiz, parolni sir saqlashingiz va hisobingizdagi barcha harakatlar uchun javob berishingiz kerak. Ruxsatsiz kirish gumoni bo‘lsa, zudlik bilan xabar bering. Bitta hisob — bitta shaxs uchun; hisobni boshqalarga berish yoki kirishni qayta sotish mumkin emas.' ] },
    { h: '3. Tariflar, narxlar va to‘lov', p: [
      'Ba’zi imkoniyatlar bepul; boshqalari faol pullik tarifni talab qiladi. Tarif oldindan to‘lanadigan belgilangan muddatga (masalan, 1 yoki 12 oy) kirish beradi. Narxlar AQSh dollarida belgilanadi. To‘lovdan oldin sizga mahalliy valyutadagi taxminiy summa va yechiladigan aniq summa (odatda Misr funtida, EGP) ko‘rsatiladi; valyuta kursi va bank komissiyasi tufayli ko‘chirmadagi summa biroz farq qilishi mumkin.',
      'Tariflar o‘z-o‘zidan yangilanmaydi. Karta ma’lumotlaringizni saqlamaymiz va yangi xaridingizsiz qayta pul yechmaymiz; kirish tugashidan oldin eslatma yuboramiz. Soliqlar (masalan, QQS) qo‘llanilsa, hisob-fakturada ko‘rsatiladi. Kirish tugagach pullik bo‘limlar yopiladi, lekin hisobingiz va ma’lumotlaringiz qoladi.',
      'Karta to‘lovlarini litsenziyalangan to‘lov provayderi Paymob o‘zining xavfsiz sahifasida qabul qiladi. Bank o‘tkazmasi bilan ham to‘lash mumkin; bunda kirish pul bank ko‘chirmamizda ko‘ringandan keyin boshlanadi. To‘lov qilish bilan kirish darhol boshlanishini so‘raysiz. Pulni qaytarish Qaytarish siyosati va qonuniy huquqlaringizga bo‘ysunadi.' ] },
    { h: '4. Ruxsat etilgan foydalanish', p: ['Siz quyidagilarni qilmaslikka rozisiz:'], ul: [
      'qonunni buzish yoki boshqalarning huquqlarini poymol qilish;',
      'boshqa talaba yoki o‘qituvchilarni haqorat qilish, kamsitish, haqoratli, nafratga undovchi yoki odobsiz kontent joylash;',
      'zararli dastur yuklash, boshqalarning ma’lumotiga kirishga urinish, Xizmatni buzish yoki texnik cheklovlarni aylanib o‘tish;',
      'darslar, materiallar, imtihonlar va javoblarni yozuvli ruxsatsiz yozib olish, nusxalash, e’lon qilish yoki sotish;',
      'imtihonda aldash, jumladan Xizmatdan boshqa kishi nomidan foydalanish;',
      'Xizmatga qarshi avtomatik vositalar (botlar, skreperlar) ishlatish.' ] },
    { h: '5. AI yordamchi', p: [
      'Ufuqda arab tilini mashq qilishga yordam beruvchi AI yordamchi (matn va ixtiyoriy ovoz) bor. Xabarlaringiz javob yaratish uchun AI provayderiga yuboriladi.',
      'AI javoblari noto‘g‘ri, to‘liqsiz yoki eskirgan bo‘lishi mumkin. Bu o‘qishga yordamchi vosita, o‘qituvchi o‘rnini bosmaydi; diniy hukm, huquqiy, tibbiy yoki boshqa kasbiy maslahat sifatida tayanmang. Chatga parol, bank kartasi raqami yoki boshqa maxfiy ma’lumotlarni yozmang.' ] },
    { h: '6. Jonli darslar, yozuvlar va imtihonlar', p: [
      'Jonli darslar uchinchi tomon video vositalari (masalan, Zoom) orqali o‘tadi va tegishli guruh talabalari uchun yozib olinishi mumkin. Darsga qo‘shilish orqali ovozingiz, tasviringiz va ismingiz guruhga ko‘rinishi va e’lon qilingan holda yozuvga tushishi mumkinligini qabul qilasiz.',
      'Imtihon paytida butunlik choralari qo‘llanishi mumkin (to‘liq ekran rejimi, boshqa oynaga o‘tish, nusxa olish/qo‘yish va chop etishga urinishlarni sanash). Qoidabuzarliklar sizga ko‘rsatiladi va natija bilan birga o‘qituvchiga yuboriladi. Bu choralar kameranggiz, mikrofoningiz yoki fayllaringizga kirmaydi.' ] },
    { h: '7. Kontent va intellektual mulk', p: [
      'Xizmatdagi barcha darslar, matnlar, audio, video, dizayn, logotiplar va dasturiy ta’minot Ufuq yoki litsenziarlariga tegishli bo‘lib, sizga faqat shaxsiy, notijorat o‘qish uchun litsenziyalanadi.',
      'Siz yuborgan kontent (xabarlar, uy vazifasi, profil rasmi) o‘zingizniki bo‘lib qoladi. Siz uni faqat Xizmatni yuritish uchun (masalan, uy vazifangizni o‘qituvchiga ko‘rsatish) saqlash, ko‘rsatish va qayta ishlashimiz uchun cheklangan litsenziya berasiz. Uni yuborishga haqqingiz borligini tasdiqlaysiz.' ] },
    { h: '8. Uchinchi tomon xizmatlari', p: [
      'Xizmat quyidagi provayderlarga tayanadi: xosting/ma’lumotlar bazasi va autentifikatsiya (Supabase), video darslar (Zoom), Google orqali kirish, AI va nutq provayderlari hamda to‘lov tizimlari. Ularning xizmatlariga o‘z shartlari va maxfiylik qoidalari qo‘llanadi.' ] },
    { h: '9. Mavjudlik va o‘zgarishlar', p: [
      'Xizmat doim ishlashi va xatosiz bo‘lishini kafolatlamaymiz; texnik ishlar, uzilishlar yoki bizga bog‘liq bo‘lmagan holatlar bo‘lishi mumkin. Imkoniyatlarni o‘zgartirishimiz, qo‘shishimiz yoki olib tashlashimiz hamda Shartlarni yangilashimiz mumkin. Muhim o‘zgarishlar haqida xabar beramiz (masalan, e-pochta yoki ilova ichida); kuchga kirgandan so‘ng foydalanishni davom ettirsangiz, yangi Shartlarni qabul qilgan hisoblanasiz.' ] },
    { h: '10. To‘xtatish va bekor qilish', p: [
      'Xizmatdan istalgan payt voz kechib, hisobingizni o‘chirishingiz mumkin (Maxfiylik siyosatiga qarang). Shartlar yoki qonunni jiddiy yoki takror buzgan hisobni to‘xtatishimiz yoki yopishimiz mumkin; maqul bo‘lsa, avval ogohlantiramiz. Tabiatiga ko‘ra amal qiluvchi bandlar (intellektual mulk, javobgarlik, huquq) bekor qilingandan keyin ham kuchda qoladi.' ] },
    { h: '11. Kafolatdan voz kechish va javobgarlik chegarasi', p: [
      'Xizmat «mavjud holda» taqdim etiladi. Til o‘rganish natijasi o‘z mehnatingizga bog‘liq; muayyan daraja yoki natijani va’da qilolmaymiz.',
      'Qonun ruxsat bergan eng yuqori darajada Ufuq bilvosita yoki oqibatli zarar, yo‘qotilgan foyda yoki ma’lumot uchun javob bermaydi, har qanday da’vo bo‘yicha umumiy javobgarligimiz da’vodan oldingi 12 oyda siz bizga to‘lagan summa bilan cheklanadi. Ushbu Shartlardagi hech narsa qonun bo‘yicha cheklab bo‘lmaydigan javobgarlikni, jumladan iste’molchi sifatidagi majburiy huquqlaringizni cheklamaydi.' ] },
    { h: '12. Qo‘llaniladigan huquq va nizolar', p: [
      `Ushbu Shartlarga ${law()} qonunlari qo‘llanadi; bu yashash mamlakatingizdagi majburiy iste’molchi huquqlariga ta’sir qilmaydi. Avval biz bilan bog‘lanishingizni so‘raymiz — muammoni kelishuv yo‘li bilan hal qilishga harakat qilamiz; aks holda nizolar shu yurisdiksiyadagi vakolatli sudlarda ko‘riladi.` ] },
    { h: '13. Aloqa', p: [`Shartlar bo‘yicha savollar: ${mail()} yoki Telegram yordam (${LEGAL.supportUrl}).`] },
  ],
  privacy: [
    { h: '1. Kim javobgar', p: [
      `${who()}, ${addr()} («Ufuq») Xizmat orqali qayta ishlanadigan shaxsiy ma’lumotlar bo‘yicha operator hisoblanadi. Aloqa: ${mail()}.`,
      'Ushbu siyosat nimani yig‘ishimiz, nima uchun, kimga berilishi va sizda qanday tanlov borligini tushuntiradi.' ] },
    { h: '2. Nimalarni yig‘amiz', ul: [
      'Hisob ma’lumotlari: ism, e-pochta, parol (autentifikatsiya provayderimizda faqat xavfsiz xesh sifatida saqlanadi), profil rasmi, til va rol. Google orqali kirsangiz, Google’dan ism, e-pochta va avatarni olamiz.',
      'O‘quv ma’lumotlari: guruhlar, davomat, uy vazifa va topshiriqlar, baholar, imtihon javoblari va natijalari, imtihon butunligi hodisalari (masalan, boshqa oynaga o‘tishlar soni), o‘zlashtirish va maqsadlar.',
      'Xabarlar: guruh chati xabarlari va AI yordamchiga yuborgan xabarlaringiz. AI chat tarixi faqat sizning brauzeringizda saqlanadi.',
      'Ovoz: ovozli rejimdan foydalansangiz, nutq matnga aylantirish uchun qayta ishlanadi; e’lon qilingan jonli dars yozuvidan tashqari audio yozuvlarni funksiyani ko‘rsatish uchun zarur muddatdan ortiq saqlamaymiz.',
      'To‘lov ma’lumotlari: hisob-faktura ismi, e-pochta, mamlakat, tarif va tranzaksiya holati. Karta to‘lovlarini Paymob qayta ishlaydi; karta ma’lumotlari Ufuqqa umuman yetib bormaydi. Bank o‘tkazmasi cheklari yopiq xotirada saqlanadi va faqat o‘zingiz hamda Ufuq administratorlari ko‘ra oladi. Hisob-fakturalar va to‘lov yozuvlari soliq va buxgalteriya qonuni talab qilgan muddat saqlanadi, hisob o‘chirilgandan keyin ham (profilga bog‘lanish olib tashlanadi).',
      'Texnik ma’lumotlar: qurilma/brauzer turi, IP-manzil, til, xatolik jurnallari va xavfsizlik hamda barqarorlik uchun zarur foydalanish hodisalari.' ] },
    { h: '3. Nima uchun ishlatamiz', ul: [
      'hisobingizni yaratish va yuritish, dars, guruh, topshiriq, imtihon va AI yordamchini taqdim etish (shartnomani bajarish);',
      'to‘lovlarni qayta ishlash va firibgarlikning oldini olish;',
      'Xizmat xavfsizligini ta’minlash, xatolarni tuzatish va yaxshilash (qonuniy manfaat);',
      'parolni tiklash kabi xizmat xabarlarini yuborish;',
      'marketing yoki yangiliklarni faqat roziligingiz bilan yuborish — istalgan payt bekor qilishingiz mumkin;',
      'qonuniy talablarni bajarish.' ], p: ['Shaxsiy ma’lumotlaringizni sotmaymiz va uchinchi tomon reklamasi uchun ishlatmaymiz.'] },
    { h: '4. Kimlarga beramiz', p: [
      'Ma’lumotlar faqat Ufuqni yuritishga yordam beradigan xizmat ko‘rsatuvchilarga, shartnoma asosida va zarur doirada beriladi: ma’lumotlar bazasi, autentifikatsiya va fayl saqlash (Supabase); video darslar (Zoom); AI va nutqni matnga aylantirish provayderlari; to‘lov tizimlari; Google (Google orqali kirsangiz). O‘qituvchilaringiz va guruh adminlari a’zosi bo‘lgan guruhlaringiz bo‘yicha o‘quv ma’lumotlaringiz, ismingiz va avataringizni ko‘ra oladi. Qonun talab qilsa yoki huquq va xavfsizlikni himoya qilish uchun ma’lumot oshkor qilinishi mumkin.' ] },
    { h: '5. Xalqaro uzatish', p: ['Provayderlarimiz ma’lumotlarni sizning mamlakatingizdan tashqarida qayta ishlashi mumkin. Talab qilinsa, shartnoma bandlari kabi tegishli himoya choralariga tayanamiz.'] },
    { h: '6. Saqlash muddati', p: [
      'Ma’lumotlarni hisobingiz faol bo‘lganda va Xizmatni taqdim etish uchun zarur muddat saqlaymiz, so‘ng o‘chiramiz yoki anonimlashtiramiz; qonun uzoqroq saqlashni talab qilgan holatlar (masalan, soliq va buxgalteriya uchun to‘lov yozuvlari) yoki nizolarni hal qilish bundan mustasno. Imtihon va davomat yozuvlari kurs davomida saqlanishi mumkin.' ] },
    { h: '7. Sizning huquqlaringiz', p: [
      'Mamlakatingizga qarab ma’lumotlaringizga kirish, to‘g‘rilash, o‘chirish yoki ko‘chirib olish, ayrim qayta ishlashga e’tiroz bildirish yoki cheklash, rozilikni qaytarib olish va ma’lumotlarni himoya qilish organiga shikoyat qilish huquqingiz bo‘lishi mumkin. Ism va rasmni profilda o‘zgartirasiz; hisobni o‘chirish yoki boshqa huquqlar uchun yuqoridagi manzilga yozing. Maqul muddatda (odatda 30 kun ichida) javob beramiz.' ] },
    { h: '8. Bolalar', p: [
      `Xizmat ${LEGAL.minAge} yoshgacha bo‘lgan bolalarga mo‘ljallanmagan. Yoshroq o‘quvchilar faqat ota-ona yoki vasiy yaratgan yoki tasdiqlagan hisob orqali foydalanishi mumkin; ular istalgan payt bola ma’lumotlariga kirish yoki o‘chirishni so‘rashi mumkin. Bola ruxsatsiz ro‘yxatdan o‘tgan deb hisoblasangiz, bog‘laning — hisobni o‘chiramiz.` ] },
    { h: '9. Xavfsizlik', p: ['Uzatishda shifrlash, kirishni nazorat qilish va rollarga asoslangan ruxsatlardan foydalanamiz. Hech bir tizim mutlaq xavfsiz emas; kuchli noyob parol ishlating va gumon bo‘lsa xabar bering. Buzilish ma’lumotlaringizga ta’sir qilsa, qonun talab qilganidek sizga va vakolatli organlarga xabar beramiz.'] },
    { h: '10. Cookie va mahalliy xotira', p: ['Brauzeringizda nimalar saqlanishi — Cookie siyosatida.'] },
    { h: '11. O‘zgarishlar', p: ['Siyosatni yangilashimiz mumkin; yuqoridagi sana so‘nggi versiyani bildiradi. Muhim o‘zgarishlar haqida ilovada yoki e-pochta orqali xabar beramiz.'] },
  ],
  cookies: [
    { h: '1. Bu nimani qamrab oladi', p: ['Ufuq cookie va shunga o‘xshash brauzer xotirasidan (localStorage / sessionStorage) foydalanadi. Reklama yoki saytlararo kuzatuv cookie’larini ishlatmaymiz.'] },
    { h: '2. Nimalarni saqlaymiz', ul: [
      'Zarur: kirish seansi (tizimda qolish uchun) va xavfsizlik tokenlari.',
      'Sozlamalar: interfeys tili, yorug‘/qorong‘i mavzu, yig‘ilgan menyular, oxirgi tanlangan bo‘limlar.',
      'Funksiyalar: AI yordamchi chat tarixi, qoralamalar va rol ma’lumoti keshi — faqat brauzeringizda.',
      'Uchinchi tomon: Google orqali kirish, Zoom va o‘rnatilgan media foydalanganingizda o‘z cookie’larini o‘rnatishi mumkin.' ] },
    { h: '3. Sizning tanlovingiz', p: ['Zarur xotirani o‘chirib bo‘lmaydi — kirish ishlamay qoladi. Brauzer sozlamalarida cookie va sayt ma’lumotlarini tozalashingiz yoki bloklashingiz mumkin; sozlamalar va mahalliy chat tarixi tiklanadi.'] },
    { h: '4. Aloqa', p: [`Savollar: ${mail()}.`] },
  ],
  refund: [
    { h: '1. Umumiy', p: ['Ufuqdan mamnun bo‘lishingizni istaymiz. Ushbu siyosat pullik tarif yoki kurs uchun qachon pulni qaytarib olish mumkinligini tushuntiradi.'] },
    { h: '2. Qaytarish muddati', p: [`To‘lovdan keyin ${LEGAL.refundDays} kun ichida to‘liq qaytarishni so‘rashingiz mumkin, sharti: shu davrda 2 tadan ortiq jonli darsga qatnashmagan va kurs materiallarini ommaviy yuklab olmagan bo‘lishingiz kerak.`] },
    { h: '3. Undan keyin', ul: [
      'Bank o‘tkazmasi bo‘yicha qaytarish pul kelgan hisobga qaytariladi. Karta to‘lovi o‘sha kartaga qaytadi.',
      'Agar siz raqamli xizmatdan voz kechish qonuniy huquqiga ega iste’molchi bo‘lsangiz, to‘lovda kirish darhol boshlanishiga rozilik berasiz; qonun ruxsat bergan hollarda, ko‘rsatilib bo‘lingan qism uchun voz kechish huquqi tugaydi, ammo yuqoridagi qaytarish muddati sizga baribir amal qiladi.',
      'Boshlangan davr uchun to‘lov odatda qaytarilmaydi, ammo asosli hollarda (masalan, uzoq uzilish yoki kursni biz bekor qilsak) ishlatilmagan qismi qaytarilishi mumkin.',
      'Pullik kursni biz bekor qilsak yoki tubdan o‘zgartirsak, qolgan darslar uchun pulni qaytarish yoki boshqa guruhga o‘tishni tanlashingiz mumkin.',
      'Shartlarni buzgani uchun yopilgan hisoblarga pul qaytarilmaydi.' ] },
    { h: '4. Qanday so‘raladi', p: [`${mail()} yoki Telegram yordam (${LEGAL.supportUrl}) ga hisob e-pochtasi va to‘lov sanasini yozing. 5 ish kunida javob beramiz; tasdiqlangan summa dastlabki to‘lov usuliga qaytariladi, bankka qarab 14 kungacha vaqt olishi mumkin.`] },
    { h: '5. Qonuniy huquqlaringiz', p: ['Bu yerdagi hech narsa mamlakatingiz qonunlaridagi iste’molchi huquqlarini cheklamaydi.'] },
  ],
});

const RU = () => ({
  terms: [
    { h: '1. Кто мы и что охватывают настоящие Условия', p: [
      `Ufuq («Ufuq», «мы») — онлайн-платформа для изучения арабского языка, которой управляет ${who()}, ${addr()}. Настоящие Условия использования регулируют использование вами сайта Ufuq, кабинета студента, панелей преподавателя и администратора, живых уроков, ИИ-помощника и любых связанных сервисов («Сервис»).`,
      `Создавая аккаунт, входя в систему, приобретая тариф или иным образом используя Сервис, вы подтверждаете, что прочитали настоящие Условия и нашу Политику конфиденциальности и согласны с ними. Если вы не согласны, пожалуйста, не пользуйтесь Сервисом.` ] },
    { h: '2. Возраст и аккаунты', p: [
      `Для создания аккаунта вам должно быть не менее ${LEGAL.minAge} лет. Если вы младше, аккаунт должен создать или одобрить родитель или законный представитель, который принимает настоящие Условия от вашего имени.`,
      `Вы обязаны указывать достоверные сведения, хранить пароль в тайне и несёте ответственность за все действия под вашим аккаунтом. Незамедлительно сообщайте нам, если подозреваете несанкционированный доступ. Один аккаунт предназначен для одного человека; передача аккаунта другим лицам и перепродажа доступа запрещены.` ] },
    { h: '3. Тарифы, цены и оплата', p: [
      'Часть функций бесплатна, остальные требуют активного платного тарифа. Тариф даёт доступ на фиксированный срок (например, 1 или 12 месяцев), который оплачивается заранее. Цены установлены в долларах США. При оформлении мы показываем ориентировочную сумму в вашей валюте и точную сумму списания (обычно в египетских фунтах, EGP); из-за курса и комиссий банка сумма в выписке может немного отличаться.',
      'Тарифы не продлеваются автоматически. Мы не храним данные вашей карты и не списываем деньги повторно без вашей новой покупки; перед окончанием доступа мы присылаем напоминание. Налоги (например, НДС), если применяются, указаны в счёте. После окончания доступа платные разделы закрываются, но аккаунт и данные сохраняются.',
      'Оплату картой обрабатывает лицензированный платёжный провайдер Paymob на своей защищённой странице. Можно также оплатить банковским переводом; тогда доступ открывается после того, как мы увидим деньги в банковской выписке. Оплачивая, вы просите начать доступ немедленно. Возвраты регулируются Политикой возврата и вашими правами по закону.' ] },
    { h: '4. Допустимое использование', p: [`Вы обязуетесь не:`], ul: [
      `нарушать закон или права других лиц;`,
      `оскорблять, преследовать или дискриминировать других студентов или преподавателей, а также публиковать оскорбительный, разжигающий ненависть или непристойный контент;`,
      `загружать вредоносное ПО, пытаться получить доступ к данным других пользователей, исследовать уязвимости или нарушать работу Сервиса, а также обходить технические ограничения;`,
      `записывать, копировать, публиковать или перепродавать уроки, материалы, экзамены или ответы без нашего письменного разрешения;`,
      `списывать на экзаменах и тестах, в том числе использовать Сервис от имени другого лица;`,
      `использовать против Сервиса автоматизированные средства (ботов, скрейперов).` ] },
    { h: '5. ИИ-помощник', p: [
      `В Ufuq есть ИИ-помощник (текст и, по желанию, голос), который помогает практиковать арабский язык. Ваши сообщения передаются провайдеру ИИ для формирования ответов.`,
      `Ответы ИИ могут быть неверными, неполными или устаревшими. Это вспомогательное средство для обучения, а не замена преподавателя; на него нельзя полагаться при получении религиозных заключений, юридических, медицинских или иных профессиональных консультаций. Не вводите в чат пароли, номера платёжных карт и другие конфиденциальные персональные данные.` ] },
    { h: '6. Живые уроки, записи и экзамены', p: [
      `Живые уроки проходят через сторонние видеосервисы (например, Zoom) и могут записываться для студентов соответствующей группы. Присоединяясь к уроку, вы соглашаетесь с тем, что ваш голос, изображение и имя могут быть видны группе и, если о записи объявлено, попасть в запись.`,
      `Во время экзаменов мы можем применять меры контроля добросовестности (например, полноэкранный режим и подсчёт переключений вкладок, попыток копирования/вставки и печати). Нарушения показываются вам и сообщаются вашему преподавателю вместе с результатом. Эти меры не получают доступа к вашей камере, микрофону или файлам.` ] },
    { h: '7. Контент и интеллектуальная собственность', p: [
      `Все уроки, тексты, аудио, видео, дизайн, логотипы и программное обеспечение Сервиса принадлежат Ufuq или его лицензиарам и предоставляются вам по лицензии исключительно для личного некоммерческого обучения.`,
      `Контент, который вы отправляете (сообщения, домашние задания, фото профиля), остаётся вашим. Вы предоставляете нам ограниченную лицензию на хранение, отображение и обработку этого контента только для работы Сервиса (например, чтобы показать домашнее задание вашему преподавателю). Вы подтверждаете, что имеете право его отправлять.` ] },
    { h: '8. Сторонние сервисы', p: [
      `Сервис использует таких провайдеров, как хостинг/база данных и аутентификация (Supabase), видеоуроки (Zoom), вход через Google, провайдеры ИИ и распознавания речи и платёжные системы. К их сервисам применяются их собственные условия и уведомления о конфиденциальности.` ] },
    { h: '9. Доступность и изменения', p: [
      `Мы стремимся обеспечивать доступность Сервиса, но не гарантируем его бесперебойную и безошибочную работу; возможны технические работы, сбои или события, не зависящие от нас. Мы можем изменять, добавлять или удалять функции, а также обновлять настоящие Условия. О существенных изменениях мы уведомим вас (например, по электронной почте или уведомлением в приложении); продолжение использования после даты вступления в силу означает принятие обновлённых Условий.` ] },
    { h: '10. Приостановка и прекращение', p: [
      `Вы можете в любое время прекратить использование Сервиса и удалить свой аккаунт (см. Политику конфиденциальности). Мы можем приостановить или закрыть аккаунт, который серьёзно или неоднократно нарушает настоящие Условия или закон; когда это разумно, мы предварительно предупредим вас. Положения, которые по своей природе должны сохранять силу (интеллектуальная собственность, ответственность, применимое право), продолжают действовать после прекращения.` ] },
    { h: '11. Отказ от гарантий и ограничение ответственности', p: [
      `Сервис предоставляется «как есть» и «по мере доступности». Результаты изучения языка зависят от ваших собственных усилий, и мы не можем обещать достижение определённого уровня или результата.`,
      `В максимальной степени, допускаемой законом, Ufuq не несёт ответственности за косвенные или последующие убытки, упущенную выгоду или потерю данных, а наша общая ответственность по любому требованию ограничена суммой, которую вы заплатили нам за 12 месяцев до предъявления требования. Ничто в настоящих Условиях не ограничивает ответственность, которая не может быть ограничена законом, включая ваши обязательные права потребителя.` ] },
    { h: '12. Применимое право и споры', p: [
      `Настоящие Условия регулируются законодательством: ${law()}, без ущерба для обязательных норм о защите прав потребителей страны вашего проживания. Мы просим сначала обратиться к нам, чтобы мы могли попытаться урегулировать проблему в неформальном порядке; в противном случае споры рассматриваются компетентными судами этой юрисдикции.` ] },
    { h: '13. Контакты', p: [`Вопросы по настоящим Условиям: ${mail()} или через поддержку в Telegram (${LEGAL.supportUrl}).`] },
  ],
  privacy: [
    { h: '1. Кто несёт ответственность', p: [
      `${who()}, ${addr()} («Ufuq») является оператором (контролёром) персональных данных, обрабатываемых через Сервис. Контакты: ${mail()}.`,
      `Настоящая политика объясняет, какие данные мы собираем, зачем, кому они передаются и какие возможности выбора у вас есть.` ] },
    { h: '2. Что мы собираем', ul: [
      `Данные аккаунта: имя, адрес электронной почты, пароль (хранится нашим провайдером аутентификации только в виде защищённого хеша), фото профиля, выбранный язык и роль. Если вы входите через Google, мы получаем от Google ваше имя, адрес электронной почты и аватар.`,
      `Учебные данные: группы, посещаемость, домашние задания и выполненные задачи, оценки, ответы и результаты экзаменов, события контроля добросовестности на экзаменах (например, количество переключений вкладок), прогресс и цели.`,
      `Сообщения: сообщения в групповом чате и сообщения, которые вы отправляете ИИ-помощнику. История чата с ИИ-помощником хранится в вашем собственном браузере.`,
      `Голос: если вы используете голосовой режим, аудио обрабатывается для преобразования речи в текст; мы не храним аудиозаписи дольше, чем необходимо для работы функции, за исключением случаев, когда живой урок записывается и об этом объявлено.`,
      `Платёжные данные: имя плательщика, адрес электронной почты, страна, тариф и статус транзакции. Оплату картой обрабатывает Paymob; данные карты никогда не попадают в Ufuq. Квитанции банковских переводов хранятся в закрытом хранилище и видны только вам и администраторам Ufuq. Счета и платёжные записи хранятся срок, требуемый налоговым и бухгалтерским законодательством, даже после удаления аккаунта (связь с профилем удаляется).`,
      `Технические данные: тип устройства/браузера, IP-адрес, язык, журналы ошибок и события использования, необходимые для безопасности и надёжности.` ] },
    { h: '3. Зачем мы это используем', ul: [
      `чтобы создавать и вести ваш аккаунт и предоставлять уроки, группы, задания, экзамены и ИИ-помощника (исполнение договора);`,
      `чтобы обрабатывать платежи и предотвращать мошенничество (договор, юридическая обязанность, законный интерес);`,
      `чтобы обеспечивать безопасность Сервиса, исправлять ошибки и улучшать его (законный интерес);`,
      `чтобы отправлять служебные сообщения, такие как сброс пароля и важные уведомления;`,
      `чтобы отправлять рекламные материалы или новости только если вы дали на это согласие — вы можете отказаться в любое время;`,
      `чтобы выполнять юридические обязанности.` ], p: [`Мы не продаём ваши персональные данные и не используем их для рекламы третьих лиц.`] },
    { h: '4. Кому мы их передаём', p: [
      `Мы передаём данные только поставщикам услуг, которые помогают нам обеспечивать работу Ufuq, на основании договора и лишь в необходимом объёме: база данных, аутентификация и хранение файлов (Supabase); видеоуроки (Zoom); провайдеры ИИ и преобразования речи в текст; платёжные системы; Google (если вы используете вход через Google). Ваши преподаватели и администраторы групп видят ваши учебные данные, а также имя и аватар в группах, в которых вы состоите. Мы можем раскрыть данные, если этого требует закон или для защиты прав и безопасности.` ] },
    { h: '5. Международная передача данных', p: [
      `Наши провайдеры могут обрабатывать данные в других странах, не в вашей. Там, где это требуется, мы опираемся на надлежащие гарантии, такие как договорные положения.` ] },
    { h: '6. Сроки хранения', p: [
      `Мы храним данные, пока ваш аккаунт активен и пока это необходимо для предоставления Сервиса, после чего удаляем или обезличиваем их, за исключением случаев, когда мы обязаны хранить их дольше (например, платёжные записи для налоговых и бухгалтерских целей) или для разрешения споров. Записи об экзаменах и посещаемости могут храниться в течение всего курса.` ] },
    { h: '7. Ваши права', p: [
      `В зависимости от вашей страны вы можете иметь право на доступ к своим данным, их исправление, удаление или экспорт, право возражать против некоторой обработки или ограничивать её, отзывать согласие и подавать жалобу в орган по защите данных. Имя и фото можно изменить в профиле; чтобы удалить аккаунт или воспользоваться другими правами, свяжитесь с нами по указанному выше адресу. Мы ответим в разумный срок (как правило, в течение 30 дней).` ] },
    { h: '8. Дети', p: [
      `Сервис не предназначен для детей младше ${LEGAL.minAge} лет. Более юные учащиеся могут пользоваться им только через аккаунт, созданный или одобренный родителем или опекуном, который может в любое время запросить доступ к данным ребёнка или их удаление. Если вы считаете, что ребёнок зарегистрировался без разрешения, свяжитесь с нами, и мы удалим аккаунт.` ] },
    { h: '9. Безопасность', p: [
      `Мы используем шифрование при передаче данных, контроль доступа и ролевые разрешения. Ни одна система не является абсолютно защищённой; используйте надёжный уникальный пароль и сообщайте нам, если подозреваете проблему. Если утечка затронет ваши данные, мы уведомим вас и компетентные органы в порядке, предусмотренном законом.` ] },
    { h: '10. Cookie и локальное хранилище', p: [`О том, что хранится в вашем браузере, см. в нашей Политике cookie.`] },
    { h: '11. Изменения', p: [`Мы можем обновлять настоящую политику; дата вверху страницы показывает последнюю версию. О существенных изменениях мы уведомим вас в приложении или по электронной почте.`] },
  ],
  cookies: [
    { h: '1. Что охватывает эта политика', p: [`Ufuq использует файлы cookie и аналогичное хранилище браузера (localStorage / sessionStorage). Мы не используем рекламные или кросс-сайтовые отслеживающие cookie.`] },
    { h: '2. Что мы храним', ul: [
      `Строго необходимые: сессия входа (нужна, чтобы оставаться в системе) и токены безопасности.`,
      `Настройки: язык интерфейса, светлая/тёмная тема, свёрнутые меню, последние выбранные вкладки.`,
      `Функции: история чата с ИИ-помощником, черновики и кэшированные сведения о роли — хранятся только в вашем браузере.`,
      `Сторонние: Google (вход), Zoom и встроенные медиа могут устанавливать собственные cookie, когда вы ими пользуетесь.` ] },
    { h: '3. Ваш выбор', p: [
      `Строго необходимое хранилище нельзя отключить без нарушения входа в систему. Вы можете удалить или заблокировать cookie и данные сайтов в настройках браузера; настройки и локальная история чата при этом будут сброшены.` ] },
    { h: '4. Контакты', p: [`Вопросы: ${mail()}.`] },
  ],
  refund: [
    { h: '1. Обзор', p: [`Мы хотим, чтобы вы были довольны Ufuq. Эта политика объясняет, когда вы можете получить деньги обратно за платный тариф или курс.`] },
    { h: '2. Срок возврата', p: [`Вы можете запросить полный возврат в течение ${LEGAL.refundDays} дней после платежа при условии, что за этот период посетили не более 2 живых уроков и не скачивали материалы курса массово.`] },
    { h: '3. После этого срока', ul: [
      'Возвраты по банковскому переводу отправляются на счёт, откуда пришли деньги. Возврат по карте — на ту же карту.',
      'Если вы потребитель с законным правом отказаться от цифровой услуги, при оплате вы соглашаетесь, что доступ начинается сразу; там, где это допускает закон, право отказа прекращается в отношении уже предоставленной части, но срок возврата выше всё равно действует.',
      `Плата за уже начавшийся период, как правило, не возвращается, но в обоснованных случаях (например, при длительном сбое или если мы отменяем курс) мы можем вернуть неиспользованную часть.`,
      `Если мы отменяем платный курс или существенно его изменяем, вы можете выбрать возврат за оставшиеся уроки или перевод в другую группу.`,
      `Аккаунты, закрытые за нарушение Условий, не подлежат возврату.` ] },
    { h: '4. Как запросить возврат', p: [
      `Напишите на ${mail()} или в поддержку в Telegram (${LEGAL.supportUrl}), указав адрес электронной почты аккаунта и дату платежа. Мы отвечаем в течение 5 рабочих дней; одобренные возвраты зачисляются на первоначальный способ оплаты, и в зависимости от вашего банка это может занять до 14 дней.` ] },
    { h: '5. Ваши законные права', p: [`Ничто в настоящем документе не ограничивает права потребителей, действующие по закону в вашей стране.`] },
  ],
});

const AR = () => ({
  terms: [
    { h: '1. من نحن وما الذي تشمله هذه الشروط', p: [
      `أُفُق Ufuq («Ufuq» و«نحن») منصة إلكترونية لتعلّم اللغة العربية يشغّلها ${who()}، ${addr()}. تحكم شروط الخدمة هذه استخدامك لموقع Ufuq ولوحة الطالب ولوحتي المعلّم والمشرف والدروس المباشرة ومساعد الذكاء الاصطناعي وأي خدمات ذات صلة («الخدمة»).`,
      `بإنشاء حساب أو تسجيل الدخول أو شراء خطة أو استخدام الخدمة بأي شكل آخر، فإنك تقرّ بأنك قرأت هذه الشروط وسياسة الخصوصية الخاصة بنا وتوافق عليهما. وإن لم توافق، فيُرجى عدم استخدام الخدمة.` ] },
    { h: '2. الأهلية والحسابات', p: [
      `يجب ألا يقل عمرك عن ${LEGAL.minAge} عامًا لإنشاء حساب. وإذا كنت أصغر من ذلك، فيجب على أحد الوالدين أو الوصي القانوني إنشاء الحساب أو الموافقة عليه، ويقبل هذه الشروط نيابةً عنك.`,
      `يجب أن تقدّم معلومات صحيحة وأن تحافظ على سرّية كلمة المرور، وأنت مسؤول عن كل ما يحدث عبر حسابك. أبلغنا فورًا إذا اشتبهت في دخول غير مصرّح به. الحساب الواحد لشخص واحد؛ ولا يُسمح بمشاركة الحسابات أو إعادة بيع الوصول.` ] },
    { h: '3. الخطط والأسعار والدفع', p: [
      'بعض الميزات مجانية وبعضها يتطلب خطة مدفوعة فعّالة. تمنحك الخطة وصولًا لمدة محددة (مثل شهر أو 12 شهرًا) تُدفع مقدمًا. الأسعار محددة بالدولار الأمريكي. عند الدفع نعرض لك مبلغًا تقديريًا بعملتك والمبلغ الدقيق الذي سيُخصم (غالبًا بالجنيه المصري EGP)؛ وقد يختلف المبلغ في كشف حسابك قليلًا بسبب أسعار الصرف ورسوم مصرفك.',
      'لا تتجدد الخطط تلقائيًا. لا نخزّن بيانات بطاقتك ولا نخصم منك مجددًا دون عملية شراء جديدة منك؛ ونرسل تذكيرًا قبل انتهاء وصولك. تظهر الضرائب (مثل ضريبة القيمة المضافة) في فاتورتك عند انطباقها. عند انتهاء الوصول تُغلق الأقسام المدفوعة ويبقى حسابك وبياناتك.',
      'تُعالَج مدفوعات البطاقات عبر Paymob، وهو مزود دفع مرخّص، في صفحته الآمنة. يمكنك أيضًا الدفع بتحويل بنكي؛ وعندها يبدأ الوصول بعد أن نرى المبلغ في كشف حسابنا البنكي. بالدفع تطلب بدء الوصول فورًا. تخضع المبالغ المستردة لسياسة الاسترداد ولحقوقك النظامية.' ] },
    { h: '4. الاستخدام المقبول', p: [`توافق على عدم القيام بما يلي:`], ul: [
      `مخالفة القانون أو انتهاك حقوق الآخرين؛`,
      `مضايقة الطلاب أو المعلّمين الآخرين أو الإساءة إليهم أو التمييز ضدهم، أو نشر محتوى مسيء أو يحضّ على الكراهية أو محتوى جنسي؛`,
      `رفع برمجيات خبيثة، أو محاولة الوصول إلى بيانات مستخدمين آخرين، أو فحص الخدمة أو تعطيلها، أو تجاوز القيود التقنية؛`,
      `تسجيل الدروس أو المواد أو الامتحانات أو الإجابات أو نسخها أو نشرها أو إعادة بيعها دون إذن كتابي منا؛`,
      `الغش في الامتحانات أو الاختبارات، بما في ذلك استخدام الخدمة نيابةً عن شخص آخر؛`,
      `استخدام أدوات آلية (روبوتات أو أدوات استخراج البيانات) ضد الخدمة.` ] },
    { h: '5. مساعد الذكاء الاصطناعي', p: [
      `يتضمن Ufuq مساعدًا بالذكاء الاصطناعي (نصيًا مع صوت اختياري) يساعدك على التدرّب على اللغة العربية. تُرسل رسائلك إلى مزوّد خدمة الذكاء الاصطناعي لتوليد الإجابات.`,
      `قد تكون مخرجات الذكاء الاصطناعي خاطئة أو ناقصة أو قديمة. فهي أداة مساعدة للدراسة وليست بديلًا عن معلّمك، ولا يجوز الاعتماد عليها في الفتاوى الدينية أو الاستشارات القانونية أو الطبية أو غيرها من الاستشارات المهنية. لا تُدخل كلمات المرور أو أرقام بطاقات الدفع أو غيرها من البيانات الشخصية الحساسة في المحادثة.` ] },
    { h: '6. الدروس المباشرة والتسجيلات والامتحانات', p: [
      `تُعقد الدروس المباشرة عبر أدوات فيديو تابعة لجهات خارجية (مثل Zoom) وقد تُسجَّل لطلاب المجموعة المعنية. وبانضمامك إلى درس، فإنك تقبل أن يكون صوتك وصورتك واسمك مرئية للمجموعة، وأن تُلتقط في التسجيل عند الإعلان عنه.`,
      `أثناء الامتحانات قد نطبّق إجراءات لضمان النزاهة (مثل وضع ملء الشاشة واحتساب مرات التبديل بين علامات التبويب ومحاولات النسخ/اللصق والطباعة). تُعرض المخالفات عليك وتُبلَّغ إلى معلّمك مع نتيجتك. ولا تصل هذه الإجراءات إلى كاميرتك أو ميكروفونك أو ملفاتك.` ] },
    { h: '7. المحتوى والملكية الفكرية', p: [
      `جميع الدروس والنصوص والمواد الصوتية والمرئية والتصميم والشعارات وبرمجيات الخدمة مملوكة لـ Ufuq أو لمرخِّصيها، وتُرخَّص لك للتعلّم الشخصي غير التجاري فقط.`,
      `يبقى المحتوى الذي ترسله (الرسائل والواجبات وصورة الملف الشخصي) ملكًا لك. وتمنحنا ترخيصًا محدودًا لاستضافته وعرضه ومعالجته فقط لتشغيل الخدمة (مثل عرض واجبك على معلّمك). وتقرّ بأن لك الحق في إرساله.` ] },
    { h: '8. خدمات الجهات الخارجية', p: [
      `تعتمد الخدمة على مزوّدين مثل الاستضافة/قاعدة البيانات والمصادقة (Supabase) ودروس الفيديو (Zoom) وتسجيل الدخول عبر Google ومزوّدي الذكاء الاصطناعي والتعرّف على الكلام ومعالجي المدفوعات. وتسري شروط هذه الجهات وإشعارات الخصوصية الخاصة بها على خدماتها.` ] },
    { h: '9. التوافر والتغييرات', p: [
      `نعمل على إبقاء الخدمة متاحة ولكننا لا نضمن عملها دون انقطاع أو أخطاء؛ فقد تحدث أعمال صيانة أو أعطال أو أحداث خارجة عن سيطرتنا. ويجوز لنا تغيير الميزات أو إضافتها أو إزالتها، وتحديث هذه الشروط. وسنخطرك بالتغييرات الجوهرية (مثلًا بالبريد الإلكتروني أو بإشعار داخل التطبيق)؛ ويعني استمرارك في الاستخدام بعد تاريخ السريان قبولك للشروط المحدَّثة.` ] },
    { h: '10. التعليق والإنهاء', p: [
      `يمكنك التوقف عن استخدام الخدمة وحذف حسابك في أي وقت (انظر سياسة الخصوصية). ويجوز لنا تعليق أو إغلاق أي حساب ينتهك هذه الشروط أو القانون انتهاكًا جسيمًا أو متكررًا؛ وحيثما كان ذلك معقولًا سننبّهك مسبقًا. وتظل الأحكام التي يُفترض بطبيعتها أن تبقى سارية (الملكية الفكرية والمسؤولية والقانون الواجب التطبيق) نافذة بعد الإنهاء.` ] },
    { h: '11. إخلاء المسؤولية وحدود المسؤولية', p: [
      `تُقدَّم الخدمة «كما هي» و«حسب توافرها». تعتمد نتائج تعلّم اللغة على جهدك الشخصي، ولا يمكننا الوعد ببلوغ مستوى أو نتيجة معيّنة.`,
      `إلى أقصى حد يسمح به القانون، لا تتحمل Ufuq مسؤولية الخسائر غير المباشرة أو التبعية أو فوات الأرباح أو فقدان البيانات، وتقتصر مسؤوليتنا الإجمالية عن أي مطالبة على المبلغ الذي دفعته لنا خلال الأشهر الاثني عشر السابقة للمطالبة. ولا يقيّد أي شيء في هذه الشروط المسؤولية التي لا يجوز تقييدها قانونًا، بما في ذلك حقوقك الإلزامية بصفتك مستهلكًا.` ] },
    { h: '12. القانون الواجب التطبيق والنزاعات', p: [
      `تخضع هذه الشروط لقوانين ${law()}، دون المساس بقواعد حماية المستهلك الإلزامية في بلد إقامتك. نشجّعك على التواصل معنا أولًا لنحاول حل المشكلة ودّيًا؛ وإلا فتنظر في النزاعات المحاكم المختصة في تلك الولاية القضائية.` ] },
    { h: '13. التواصل', p: [`للاستفسار عن هذه الشروط: ${mail()} أو عبر دعم Telegram (${LEGAL.supportUrl}).`] },
  ],
  privacy: [
    { h: '1. الجهة المسؤولة', p: [
      `${who()}، ${addr()} («Ufuq») هو المتحكّم في البيانات الشخصية التي تُعالَج عبر الخدمة. للتواصل: ${mail()}.`,
      `توضّح هذه السياسة ما نجمعه ولماذا ومن يتلقاه وما الخيارات المتاحة لك.` ] },
    { h: '2. ما الذي نجمعه', ul: [
      `بيانات الحساب: الاسم والبريد الإلكتروني وكلمة المرور (تُحفظ لدى مزوّد المصادقة على هيئة تجزئة آمنة فقط) وصورة الملف الشخصي واللغة المختارة والدور. وإذا سجّلت الدخول عبر Google فإننا نتلقى منها اسمك وبريدك الإلكتروني وصورتك الرمزية.`,
      `بيانات التعلّم: المجموعات والحضور والواجبات والمهام المسلَّمة والدرجات وإجابات الامتحانات ونتائجها وأحداث نزاهة الامتحان (مثل عدد مرات التبديل بين علامات التبويب) والتقدّم والأهداف.`,
      `الرسائل: رسائل المحادثة الجماعية والرسائل التي ترسلها إلى مساعد الذكاء الاصطناعي. ويُخزَّن سجل محادثات مساعد الذكاء الاصطناعي في متصفحك أنت.`,
      `الصوت: إذا استخدمت الوضع الصوتي تُعالَج المادة الصوتية لتحويل الكلام إلى نص؛ ولا نحتفظ بالتسجيلات الصوتية لأكثر مما يلزم لتقديم الميزة، إلا إذا سُجِّل درس مباشر وأُعلن عن ذلك.`,
      `بيانات الدفع: اسم الفوترة والبريد الإلكتروني والبلد والخطة وحالة المعاملة. وتُعالَج مدفوعات البطاقات عبر Paymob ولا تصل بيانات البطاقة إلى Ufuq أبدًا. تُحفظ إيصالات التحويل البنكي في تخزين خاص لا يراها سوى أنت ومشرفو Ufuq. تُحفظ الفواتير وسجلات الدفع للمدة التي تفرضها قوانين الضرائب والمحاسبة حتى بعد حذف الحساب (مع إزالة الربط بملفك الشخصي).`,
      `البيانات التقنية: نوع الجهاز/المتصفح وعنوان IP واللغة وسجلات الأخطاء وأحداث الاستخدام اللازمة للأمان والموثوقية.` ] },
    { h: '3. لماذا نستخدمها', ul: [
      `لإنشاء حسابك وتشغيله وتقديم الدروس والمجموعات والمهام والامتحانات ومساعد الذكاء الاصطناعي (تنفيذ العقد)؛`,
      `لمعالجة المدفوعات ومنع الاحتيال (العقد، الالتزام القانوني، المصلحة المشروعة)؛`,
      `للحفاظ على أمان الخدمة وإصلاح الأخطاء وتحسينها (المصلحة المشروعة)؛`,
      `لإرسال رسائل الخدمة مثل إعادة تعيين كلمة المرور والإشعارات المهمة؛`,
      `لإرسال المواد التسويقية أو الأخبار فقط إذا وافقت على ذلك — ويمكنك إلغاء الاشتراك في أي وقت؛`,
      `للامتثال للالتزامات القانونية.` ], p: [`لا نبيع بياناتك الشخصية ولا نستخدمها في إعلانات الأطراف الثالثة.`] },
    { h: '4. مع من نشاركها', p: [
      `لا نشارك البيانات إلا مع مزوّدي الخدمات الذين يساعدوننا في تشغيل Ufuq، بموجب عقد وبقدر الحاجة فقط: قاعدة البيانات والمصادقة وتخزين الملفات (Supabase)؛ دروس الفيديو (Zoom)؛ مزوّدو الذكاء الاصطناعي وتحويل الكلام إلى نص؛ معالجو المدفوعات؛ Google (إذا استخدمت تسجيل الدخول عبر Google). ويمكن لمعلّميك ومشرفي المجموعات الاطلاع على بيانات تعلّمك واسمك وصورتك الرمزية في المجموعات التي تنتمي إليها. وقد نكشف عن البيانات إذا اقتضى القانون ذلك أو لحماية الحقوق والسلامة.` ] },
    { h: '5. النقل الدولي', p: [
      `قد يعالج مزوّدونا البيانات في بلدان غير بلدك. وحيثما يلزم، نعتمد على ضمانات مناسبة مثل البنود التعاقدية.` ] },
    { h: '6. مدة الاحتفاظ', p: [
      `نحتفظ بالبيانات ما دام حسابك نشطًا وما دامت الحاجة قائمة لتقديم الخدمة، ثم نحذفها أو نجعلها مجهولة الهوية، إلا حيث يلزمنا الاحتفاظ بها مدة أطول (مثل سجلات الدفع لأغراض الضرائب والمحاسبة) أو لمعالجة النزاعات. وقد تُحفظ سجلات الامتحانات والحضور طوال مدة الدورة.` ] },
    { h: '7. حقوقك', p: [
      `بحسب بلدك، قد يكون لك الحق في الوصول إلى بياناتك أو تصحيحها أو حذفها أو تصديرها، وفي الاعتراض على بعض أنواع المعالجة أو تقييدها، وسحب الموافقة، وتقديم شكوى إلى سلطة حماية البيانات. يمكنك تعديل اسمك وصورتك من ملفك الشخصي؛ ولحذف حسابك أو ممارسة حقوق أخرى، تواصل معنا على العنوان المذكور أعلاه. وسنرد في وقت معقول (عادةً خلال 30 يومًا).` ] },
    { h: '8. الأطفال', p: [
      `الخدمة غير موجّهة للأطفال دون سن ${LEGAL.minAge} عامًا. ويجوز للمتعلمين الأصغر سنًا استخدامها فقط عبر حساب ينشئه أحد الوالدين أو الوصي أو يوافق عليه، ويمكنه أن يطلب منا في أي وقت الاطلاع على بيانات الطفل أو حذفها. وإذا كنت تعتقد أن طفلًا سجّل دون إذن، فتواصل معنا وسنحذف الحساب.` ] },
    { h: '9. الأمان', p: [
      `نستخدم التشفير أثناء النقل وضوابط الوصول وصلاحيات قائمة على الأدوار. ولا يوجد نظام آمن تمامًا؛ لذا استخدم كلمة مرور قوية وفريدة وأبلغنا إذا اشتبهت في وجود مشكلة. وإذا أثّر اختراق على بياناتك فسنخطرك والسلطات المختصة وفق ما يقتضيه القانون.` ] },
    { h: '10. ملفات تعريف الارتباط والتخزين المحلي', p: [`راجع سياسة ملفات تعريف الارتباط لمعرفة ما يُخزَّن في متصفحك.`] },
    { h: '11. التغييرات', p: [`قد نحدّث هذه السياسة؛ ويبيّن التاريخ في الأعلى أحدث نسخة. وسنخطرك بالتغييرات الجوهرية داخل التطبيق أو بالبريد الإلكتروني.`] },
  ],
  cookies: [
    { h: '1. ما الذي تشمله هذه السياسة', p: [`يستخدم Ufuq ملفات تعريف الارتباط وما يماثلها من تخزين المتصفح (localStorage / sessionStorage). ولا نستخدم ملفات تعريف ارتباط إعلانية أو لتتبّع المستخدم عبر المواقع.`] },
    { h: '2. ما الذي نخزّنه', ul: [
      `الضرورية تمامًا: جلسة تسجيل الدخول (لازمة لبقائك مسجّلًا) ورموز الأمان.`,
      `التفضيلات: لغة الواجهة والمظهر الفاتح/الداكن والقوائم المطوية وآخر علامات التبويب المحددة.`,
      `الميزات: سجل محادثات مساعد الذكاء الاصطناعي والمسودات والمعلومات المخزّنة مؤقتًا عن الدور، وتُحفظ في متصفحك فقط.`,
      `الأطراف الخارجية: قد تضع خدمات Google (تسجيل الدخول) وZoom والوسائط المضمّنة ملفات تعريف ارتباط خاصة بها عند استخدامك لها.`] },
    { h: '3. خياراتك', p: [
      `لا يمكن إيقاف التخزين الضروري تمامًا دون تعطيل تسجيل الدخول. ويمكنك مسح ملفات تعريف الارتباط وبيانات المواقع أو حظرها من إعدادات المتصفح؛ وعندها ستُعاد تهيئة التفضيلات وسجل المحادثات المحلي.` ] },
    { h: '4. التواصل', p: [`للاستفسار: ${mail()}.`] },
  ],
  refund: [
    { h: '1. نظرة عامة', p: [`نريدك أن تكون راضيًا عن Ufuq. توضّح هذه السياسة متى يمكنك استرداد أموالك مقابل خطة أو دورة مدفوعة.`] },
    { h: '2. مدة الاسترداد', p: [`يمكنك طلب استرداد كامل خلال ${LEGAL.refundDays} يومًا من الدفع، بشرط ألا تكون قد حضرت أكثر من حصتين مباشرتين ولم تحمّل مواد الدورة بكثرة خلال هذه المدة.`] },
    { h: '3. بعد ذلك', ul: [
      'تُعاد مبالغ التحويل البنكي إلى الحساب الذي جاء منه المبلغ، وتُعاد مبالغ البطاقة إلى البطاقة نفسها.',
      'إذا كنت مستهلكًا لديك حق نظامي في الانسحاب من خدمة رقمية، فإنك توافق عند الدفع على بدء الوصول فورًا؛ وحيثما يسمح القانون ينتهي حق الانسحاب بالنسبة للجزء المقدَّم فعلًا، لكن مدة الاسترداد أعلاه تظل سارية لك.',
      `الرسوم عن فترة بدأت بالفعل غير قابلة للاسترداد عمومًا، لكن قد نردّ الجزء غير المستخدم في حالات مبررة (مثل انقطاع طويل أو إذا ألغينا الدورة).`,
      `إذا ألغينا دورة مدفوعة أو غيّرناها جوهريًا، يمكنك اختيار استرداد قيمة الدروس المتبقية أو الانتقال إلى مجموعة أخرى.`,
      `الحسابات المغلقة بسبب مخالفة الشروط لا تستحق استردادًا.` ] },
    { h: '4. كيفية طلب الاسترداد', p: [
      `راسلنا على ${mail()} أو عبر دعم Telegram (${LEGAL.supportUrl}) مع ذكر البريد الإلكتروني لحسابك وتاريخ الدفع. نرد خلال 5 أيام عمل؛ وتُعاد المبالغ المعتمدة إلى وسيلة الدفع الأصلية، وقد يستغرق ظهورها حتى 14 يومًا بحسب مصرفك.` ] },
    { h: '5. حقوقك القانونية', p: [`لا يقيّد أي شيء هنا حقوق المستهلك المقررة قانونًا في بلدك.`] },
  ],
});

export function getLegalDoc(lang, doc) {
  const set = lang === 'UZ' ? UZ() : lang === 'RU' ? RU() : lang === 'AR' ? AR() : EN();
  return set[doc];
}
export const LEGAL_DOCS = ['terms', 'privacy', 'cookies', 'refund'];
