# Yordam boti (support-bot)

Talabalar botga yozadi → har bir talaba sizning Telegram guruhingizda **alohida mavzu (topic)** bo'lib chiqadi → siz shu mavzu ichida yozasiz → javob talabaga bot nomidan boradi.

Bu bot avvalgi admin bot (tg-webhook) tokenini ishlatadi (`TELEGRAM_BOT_TOKEN`). Webhook support-bot'ga o'tkazilgach admin bot buyruqlari (/risk, /today, /student) ishlamaydi — bu ataylab qilingan.

## Imkoniyatlar
- Har qanday xabar: matn, rasm, video, ovozli xabar, dumaloq video, fayl, stiker, albom, lokatsiya, kontakt.
- Tahrir ikki tomonga sinxron: talaba yoki siz xabarni tahrirlasangiz, nusxasi ham o'zgaradi.
- Reply saqlanadi: aniq bir xabarga reply qilsangiz, talabada ham reply bo'ladi.
- 👍 reaksiya — javob yetkazildi; ❌ xabar — yetkazilmadi (masalan, talaba botni bloklagan).
- `// matn` — ichki izoh (boshqa ustozlar uchun), talabaga bormaydi.
- Mavzu boshida talaba kartasi pin qilinadi (ism, username, ID, til).
- Buyruqlar: mavzuda `/info` `/ban` `/unban` `/close`; General'da `/stats` `/help`; guruhda `/setup` `/id`.
- Bir nechta ustoz bitta guruhda birga javob bera oladi — guruhga qo'shsangiz bas.
- Spamdan himoya: talaba daqiqasiga 30 tadan ortiq yozolmaydi; `/ban` qilingan talabaning xabarlari kelmaydi.

## Ishga tushirish
Yangi secret kerak emas: token — `TELEGRAM_BOT_TOKEN`, webhook siri tokendan hosil qilinadi, baza — o'rnatilgan `SUPABASE_DB_URL`.

1. **Baza:** `supabase/migrations/20261201_support_bot.sql` ni qo'llash.
2. **Deploy:** `support-bot` funksiyasi (`verify_jwt = false`).
3. **Webhook:** bir martalik kalit bilan funksiya o'zi webhook'ni o'rnatadi:
   ```sql
   insert into support.settings (key, value) values ('setup_nonce', '<32+ belgili tasodifiy satr>')
   on conflict (key) do update set value = excluded.value, updated_at = now();
   ```
   so'ng 15 daqiqa ichida brauzerda: `https://ldbthwpikixtykwmvudy.supabase.co/functions/v1/support-bot?setup=<o'sha satr>`
4. **Guruh (siz qilasiz):** Telegramda yangi guruh oching → Sozlamalar → **Topics (Mavzular)** ni yoqing → botni qo'shib **admin** qiling (*Manage topics*, *Delete messages*, *Pin messages*) → guruhda `/setup` yozing. Faqat `OWNER_CHAT_ID` / `ADMIN_CHAT_IDS` dagi odam qila oladi. Tayyor ✅

## Ixtiyoriy sozlamalar
- `SUPPORT_GROUP_ID` — guruh ID'sini `/setup` o'rniga secret orqali berish.
- `SUPPORT_DB_URL` — bazaga cheklangan `support_bot` roli bilan ulanish (avval `alter role support_bot with password '…'`).
- `SUPPORT_BOT_TOKEN`, `SUPPORT_WEBHOOK_SECRET` — boshqa token/sir ishlatish uchun.

## Matnlarni o'zgartirish
`index.ts` boshidagi `T` (talabaga ketadigan matnlar) va `GROUP_HELP` bloklarini tahrirlang.
