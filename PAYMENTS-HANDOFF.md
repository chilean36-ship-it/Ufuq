# Ufuq — To‘lov tizimi: nima tayyor, nima qoldi

## 1. Tayyor bo‘lgan narsalar (kodda va bazada)
- **Narx serverda hisoblanadi** (`create_order`). Brauzer narxni o‘zgartira olmaydi.
- **Oldindan to‘lov, qo‘lda yangilash** (o‘zi yangilanmaydi, avtomatik yechish yo‘q). Tugashiga 3 kun qolganda eslatma yuboriladi.
- **Har kimga o‘z valyutasi** (vaqt zonasi / brauzer tili bo‘yicha aniqlanadi, qo‘lda o‘zgartirsa bo‘ladi). Yechiladigan aniq summa (EGP) to‘lovdan oldin ko‘rsatiladi.
- **Karta (Paymob)**: karta ma’lumotlari Ufuqqa umuman kelmaydi; Paymob sahifasiga yo‘naltiriladi. Webhook imzo (HMAC-SHA512) va summa/valyuta tekshiruvi bilan, takror yuborilsa ikki marta kirish bermaydi.
- **Bank o‘tkazmasi**: talaba chek yuklaydi, admin “To‘lovlar → Buyurtmalar”da tasdiqlaydi/rad etadi (pul ko‘chirmada ko‘ringandan keyin!).
- **Hisob-faktura**: ketma-ket raqam (UFQ-YYYY-NNNNNN, bo‘shliqsiz), sotuvchi/soliq ma’lumotlari bilan, PDF sifatida saqlash mumkin.
- **Talaba kabineti**: to‘lamagan talaba kabinetni ko‘radi, lekin Vazifalar, Hifz, Davomat, Progress, Kutubxona, Imtihon va AI chat yopiq. Bosh sahifa, Guruhim (ustoz kodi bilan qo‘shilish), Sozlamalar, Profil va **To‘lovlar** ochiq. Imtihon boshlash serverda ham tekshiriladi.
- **Admin → To‘lovlar**: buyurtmalar (filtr, qidiruv, CSV), bank o‘tkazmasini tekshirish, qo‘lda kirish berish/bekor qilish, qaytarishni qayd etish, sozlamalar (yoqish/o‘chirish, sotuvchi, soliq, rekvizitlar, tariflar, kurslar, eslatmalar).
- **Huquqiy matnlar** (Shartlar, Qaytarish, Maxfiylik; EN/UZ/RU/AR): oldindan to‘lov, avtomatik yangilanmaslik, 14 kunlik qaytarish, raqamli xizmatdan voz kechish huquqi, karta ma’lumotlari saqlanmasligi, moliyaviy yozuvlarni saqlash.
- **Xavfsizlik**: jadvallarda RLS, barcha yozuvlar SECURITY DEFINER funksiyalar orqali, cheklar yopiq bucketda, webhook faqat to‘g‘ri imzo bilan.
- **Hozirgi holat**: `payments_enforced = false` (hammasi hali ochiq), `paymob_enabled = false`. Ya’ni hozir hech kimga hech narsa bloklanmaydi.

## 2. Siz qilishingiz kerak bo‘lgan qadamlar (tashqi narsalar)
### A. Misrda biznes va soliq
1. Misrda yuridik shaxs/tijorat reyestri ro‘yxati va soliq kartasi (Tax Registration Number).
2. Buxgalter bilan aniqlang: **QQS (VAT) 14%** raqamli xizmatga qo‘llanadimi, narx soliqni o‘z ichiga oladimi (Admin → Sozlamalar → “Prices already include tax”), **e-invoice (ETA)** majburiyati, chet ellik xaridorlarga eksport rejimi.
3. Soliq to‘lash va hisobot — buxgalter orqali (tizim faqat hisob-fakturalar va CSV beradi).

### B. Bank hisobi
4. Misr bankida **tijorat hisobi** (EGP va imkon bo‘lsa valyuta hisobi), IBAN va SWIFT oling.
5. Rekvizitlarni Admin → To‘lovlar → Sozlamalar → “Bank transfer instructions”ga yozing.

### C. Paymob
6. Paymob Egypt’da merchant akkaunt oching (hujjatlar, bank hisobi kerak); avval **test** rejimida sinang.
7. Paymob kabinetida: Integration ID (karta), Secret key, Public key, HMAC secret.
8. Supabase → Edge Functions → Secrets ga qo‘ying: `PAYMOB_SECRET_KEY`, `PAYMOB_PUBLIC_KEY`, `PAYMOB_INTEGRATION_ID`, `PAYMOB_HMAC_SECRET`, `SITE_URL` (masalan `https://ufuq.example`).
9. Paymob’da “Transaction processed callback” manzili: `https://ldbthwpikixtykwmvudy.supabase.co/functions/v1/paymob-webhook`
10. Test rejimida: kartani sinab ko‘ring, webhook kelganini va kirish ochilganini tekshiring. Keyin live kalitlarga o‘ting.
11. Paymob’da telefon maydoni (`billing_data.phone_number`) talabi test rejimida tekshirilsin.

### D. Admin panelda sozlash (Admin → To‘lovlar → Sozlamalar)
12. Sotuvchi nomi, manzil, soliq raqami, email, mamlakat; soliq nomi/stavkasi/izohi.
13. Kurslarni yangilang (“Update rates”) — hozirgi kurslar taxminiy boshlang‘ich qiymatlar.
14. Tariflarni tekshiring (oylik $30, yillik $298.80).
15. Tartib: avval **Bank transfer**ni yoqib, 1–2 USD bilan haqiqiy sinov; Paymob tayyor bo‘lgach **Card**ni yoqing; hammasi sinalgach **Require payment**ni yoqing.

### E. Huquqiy
16. `src/pages/Legal/legalConfig.js`: operator nomi, manzil, email, qonun (governingLaw) — to‘ldiring. `refundDays` admin sozlamasi bilan bir xil bo‘lsin.
17. Matnlarni Misr va (kerak bo‘lsa) EI huquqshunosi ko‘rib chiqsin. Matnlar shablon, huquqiy maslahat emas.
18. Shartlar o‘zgarsa, “Terms version”ni yangilang.

### F. Texnik
19. Kunlik eslatma uchun pg_cron (migratsiya faylining oxiridagi izoh) yoki admin panelda “Send reminders now”.
20. `npm run build` ni o‘zingizda ishga tushirib tekshiring (bu muhitda ishga tushirib bo‘lmadi).
21. Ixtiyoriy: jadvallarda to‘g‘ridan-to‘g‘ri yozishni yanada cheklash uchun migratsiyadagi `revoke` qatorlari (bazaga hali qo‘llanmagan; RLS baribir himoya qiladi).

22. `supabase/migrations/20261020_refund_window_enforced.sql` ni SQL editorda qo‘llang (qaytarish oynasi serverda tekshiriladi).

## 3. Ma’lum cheklovlar
- Server tomonda majburlash: **yangi imtihon boshlash** va **guruhga qo‘shilish** (`join_group`). Qolgan bo‘limlar interfeysda yopiladi.
- Valyuta kurslari taxminiy; yangilab turing.
- RU/AR tarjimalarni ona tilida so‘zlashuvchi ko‘rib chiqsin.
- Qaytarish: pulni Paymob paneli yoki bank orqali qo‘lda qaytarasiz; tizim faqat qayd etadi va kirishni qisqartiradi.

## 4. Talaba paneli: to‘lov UI (yangi komponentlar)
- `src/pages/Dashboard/SubscriptionCard.jsx`: bosh sahifadagi tarif kartasi (obuna yo‘q: oylik/yillik tanlov; muddat 7 kundan kam: yangilash eslatmasi).
- `src/components/LockedCard.jsx`: barcha "obuna kerak" bo‘limlari uchun umumiy karta (bosh sahifa va Billing).
- `src/pages/Dashboard/BillingView.jsx`: holat kartasi, tarif kartalari, buyurtmalar kartalari (bosqichlar, chek yuklash, holatni tekshirish, qayta to‘lash).
- `src/pages/Dashboard/OrderSteps.jsx`: buyurtma bosqichlari (buyurtma → to‘lov → tasdiqlash).
- `src/lib/usePlanPrices.js`: tarif va narxlar (server ma’lumoti, brauzer narx belgilamaydi).

Yangi matnlar `src/i18n/billing-cabinet.js` da (uz, ru, ar). Yetishmaydigan kalit yo‘q.

### Qo‘lda tekshirish ro‘yxati
1. Yangi talaba (tarifsiz): bosh sahifada tarif kartasi, oylik/yillik almashishi, narx yangilanishi, "To‘lash" → `/checkout?plan=…`.
2. Yopiq bo‘limlar (Vazifalar, Davomat, Progress, Reyting): qulf kartasi va "Tarif tanlang" tugmasi.
3. Billing: holat kartasi (faol / tugayapti / faol emas), tarif kartalari, buyurtmalar.
4. Bank o‘tkazmasi: "Pending" → chek yuklash; "Awaiting review"; rad etilgan → sabab va "Yangi buyurtma".
5. Karta (Paymob sozlanganda): "Hozir to‘lash", "Holatni tekshirish".
6. Ekran: telefon (bir ustun), planshet, desktop; yorug‘ va qorong‘i rejim; arab tili (RTL).
7. Klaviatura: tarif tanlash tugmalari va amallar Tab bilan yetib boriladi.
8. `npm run build` xatosiz tugaydi.

### Bazada qo‘llash kerak bo‘lgan migratsiya
- `supabase/migrations/20261020_refund_window_enforced.sql` (qaytarish oynasi serverda).
