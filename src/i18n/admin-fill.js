// Admin strings that had no translation (found by the i18n audit of 2026-11-10). Key = English text.
const LANDING = {
  mov: 'MOV videos do not play on every phone. Please convert it to MP4 (H.264) and upload again.',
  codec: 'This video cannot be played in the browser. Please export it as MP4 (H.264 video, AAC audio) and upload again.',
  wide: 'This video is landscape, the cards are vertical (4:5). It will be shown whole on a blurred background. For the best look upload a vertical video, for example 1080×1350.',
  intro: 'Change the photos and videos on the public home page. Images up to {a} MB, videos up to {b} MB (or paste a direct link). Videos: MP4 (H.264), vertical 4:5 such as 1080×1350 fits the cards best.',
};

const uz = {
  [LANDING.mov]: 'MOV videolar hamma telefonda ochilmaydi. Uni MP4 (H.264) ga o\'girib, qayta yuklang.',
  [LANDING.codec]: 'Bu video brauzerda ochilmaydi. Uni MP4 (H.264 video, AAC audio) qilib eksport qiling va qayta yuklang.',
  [LANDING.wide]: 'Bu video gorizontal, kartalar esa vertikal (4:5). U xiralashtirilgan fon ustida to\'liq ko\'rsatiladi. Eng yaxshi ko\'rinish uchun vertikal video yuklang, masalan 1080×1350.',
  [LANDING.intro]: 'Bosh sahifadagi rasm va videolarni almashtiring. Rasmlar {a} MB gacha, videolar {b} MB gacha (yoki to\'g\'ridan-to\'g\'ri havolani qo\'ying). Videolar: MP4 (H.264); kartalarga vertikal 4:5, masalan 1080×1350 eng mos keladi.',
};

const ru = {
  [LANDING.mov]: 'Видео MOV открывается не на всех телефонах. Преобразуйте его в MP4 (H.264) и загрузите снова.',
  [LANDING.codec]: 'Это видео не воспроизводится в браузере. Экспортируйте его как MP4 (видео H.264, аудио AAC) и загрузите снова.',
  [LANDING.wide]: 'Это видео горизонтальное, а карточки вертикальные (4:5). Оно будет показано целиком на размытом фоне. Лучше всего загрузить вертикальное видео, например 1080×1350.',
  [LANDING.intro]: 'Меняйте фото и видео на главной странице сайта. Изображения до {a} МБ, видео до {b} МБ (или вставьте прямую ссылку). Видео: MP4 (H.264); для карточек лучше всего вертикальное 4:5, например 1080×1350.',
};

const ar = {
  [LANDING.mov]: 'مقاطع MOV لا تعمل على كل الهواتف. حوِّله إلى MP4 (H.264) ثم ارفعه من جديد.',
  [LANDING.codec]: 'لا يمكن تشغيل هذا الفيديو في المتصفح. صدِّره بصيغة MP4 (فيديو H.264 وصوت AAC) ثم ارفعه من جديد.',
  [LANDING.wide]: 'هذا الفيديو أفقي والبطاقات عمودية (4:5). سيُعرض كاملًا على خلفية ضبابية. للحصول على أفضل مظهر ارفع فيديو عموديًا، مثل 1080×1350.',
  [LANDING.intro]: 'غيِّر الصور والفيديوهات في الصفحة الرئيسية العامة. الصور حتى {a} ميغابايت والفيديوهات حتى {b} ميغابايت (أو ألصق رابطًا مباشرًا). الفيديو: MP4 (H.264)، والعمودي 4:5 مثل 1080×1350 هو الأنسب للبطاقات.',
  // Admin > Groups
  'Level groups': 'أفواج المستويات',
  'Each letter keeps all 14 levels. Open a letter to switch its levels on or off.': 'لكل حرف مستوياته الأربعة عشر. افتح الحرف لتفعيل مستوياته أو إيقافها.',
  'levels': 'مستويات',
  'No active level': 'لا يوجد مستوى نشط',
  'Open levels': 'فتح المستويات',
  // Admin > Payments > Deadlines
  'Check the numbers: grace 0–30 days, order window 1–720 hours.': 'تحقق من الأرقام: مهلة السماح من 0 إلى 30 يومًا، ومدة الطلب من 1 إلى 720 ساعة.',
  'Reminder sent.': 'تم إرسال التذكير.',
  'Pick a future date (up to 180 days).': 'اختر تاريخًا في المستقبل (حتى 180 يومًا).',
  'More time granted.': 'تم منح وقت إضافي.',
  'Remove extra time': 'إزالة الوقت الإضافي',
  'the extra time ends now. Continue?': 'ينتهي الوقت الإضافي الآن. هل تتابع؟',
  'Removed.': 'تمت الإزالة.',
  'Ends': 'ينتهي',
  'days': 'أيام',
  'Until': 'حتى',
  'Access closes': 'يُغلق الوصول',
  'Pay by': 'الدفع قبل',
  'Ended': 'انتهى',
  'Payment deadline and grace period': 'موعد الدفع ومهلة السماح',
  'Payment is required (switch in Settings).': 'الدفع مطلوب (يُغيَّر من الإعدادات).',
  'Payment is not required right now, so nothing below closes access.': 'الدفع غير مطلوب حاليًا، لذلك لا شيء مما يلي يُغلق الوصول.',
  'Pay by (students who never paid keep access until this date)': 'الدفع قبل (الطلاب الذين لم يدفعوا قط يحتفظون بالوصول حتى هذا التاريخ)',
  'Grace period after it (days)': 'مهلة السماح بعده (بالأيام)',
  'Unpaid order stays open for (hours)': 'يبقى الطلب غير المدفوع مفتوحًا (بالساعات)',
  'Bank-transfer orders get three times longer. Cancelled orders are deleted after 1 day.': 'طلبات التحويل المصرفي تحصل على ثلاثة أضعاف المدة. تُحذف الطلبات الملغاة بعد يوم واحد.',
  'Clear date': 'مسح التاريخ',
  'Students get an in-app reminder 7, 3 and 1 days before their plan or the pay-by date ends, every day during the grace period, and once when access closes.': 'يتلقى الطلاب تذكيرًا داخل التطبيق قبل 7 و3 أيام ويوم واحد من انتهاء خطتهم أو موعد الدفع، وكل يوم خلال مهلة السماح، ومرة واحدة عند إغلاق الوصول.',
  'Nobody here.': 'لا أحد هنا.',
  'Remind': 'تذكير',
  'Give more time': 'منح وقت إضافي',
  'Access stays open until': 'يبقى الوصول مفتوحًا حتى',
  'The student gets a notification with the new date.': 'يتلقى الطالب إشعارًا بالتاريخ الجديد.',
};

export default { UZ: uz, RU: ru, AR: ar, EN: {} };
