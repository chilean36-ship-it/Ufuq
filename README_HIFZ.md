# Hifz AI moduli — o'rnatish (taxminan 1–2 soat)

## 0. Nima bor
- `supabase/functions/_shared/hifz-align.js` — so'zma-so'z solishtirish (testdan o'tgan: `node test/align.test.mjs`)
- `supabase/functions/ufuq-hifz-check/index.ts` — server funksiyasi
- `supabase/migrations/20261011_hifz.sql` — jadvallar va ruxsatlar (RLS)
- `asr-space/` — Qur'on uchun sozlangan Whisper xizmati (Hugging Face Space, bepul CPU)
- `scripts/build-quran-json.mjs` — Tanzil matnidan `public/quran/{1..114}.json` yasaydi
- `src/lib/serverStt.js` — mavjud faylning yangilangani (yangi: `raw`, `maxMs`, `endSilenceMs` parametrlari; eskisi ishlashda davom etadi)
- `src/pages/Dashboard/Hifz/HifzPanel.jsx` + `hifz.css` — talaba ekrani

## 1. Qur'on matni (men xotiradan yozmadim — xatosiz bo'lishi shart)
1. https://tanzil.net/download/ dan ikki fayl yuklang (Text, "with aya numbers"): **Simple** va **Simple Clean**. Pause marks / sajda / hizb belgilarini o'chiring.
2. `node scripts/build-quran-json.mjs scripts/data/quran-simple.txt scripts/data/quran-simple-clean.txt public/quran`
3. Tanzil litsenziyasi shartlarini o'qing (matnni o'zgartirmasdan, manba ko'rsatib ishlatish).

## 2. Baza
Supabase SQL editor'da `supabase/migrations/20261011_hifz.sql` ni ishga tushiring.

## 3. ASR xizmati (bepul)
1. huggingface.co → New Space → SDK: **Docker** → `asr-space/` ichidagi 4 faylni yuklang.
2. Space Settings → Secrets: `ASR_TOKEN` = uzun tasodifiy qator. (Model nomi `MODEL_ID` o'zgaruvchisida; `tarteel-ai/whisper-base-ar-quran` mavjudligini Hugging Face'da tekshiring — kerak bo'lsa boshqa Qur'on Whisper modelini yozing.)
3. Space "Running" bo'lgach, manzili: `https://<user>-<space>.hf.space`

## 4. Edge function
```bash
supabase secrets set QURAN_BASE_URL=https://<sayt-domeni>/quran ASR_URL=https://<user>-<space>.hf.space ASR_TOKEN=<xuddi shu qator>
# ixtiyoriy zaxira dvigatel:
supabase secrets set GEMINI_API_KEY=<kalit>
supabase functions deploy ufuq-hifz-check
```

## 5. Sinov
1. SQL migratsiya oxiridagi namunaviy `insert` bilan bitta vazifa yarating (masalan 112-sura, 1–4 oyat).
2. Talaba sifatida `<HifzPanel assignment={vazifa} />` ni individual guruh sahifasiga qo'shing.
3. 15–20 ta haqiqiy yozuv bilan sinab, `hifz_attempts` jadvalida `transcript` va ballarni solishtiring.

## Holat (2026-10-10)
- Baza (jadvallar, RLS, ustoz tekshiruvi uchun ustun ruxsati) va `ufuq-hifz-check` funksiyasi `ldbthwpikixtykwmvudy` loyihasida o'rnatilgan.
- Talaba bloki (`HifzSection`) individual guruhning "My Group" sahifasida, ustoz sahifasi (`Teacher/HifzPage`) individual guruhda "Teaching → Hifz" bo'limida.
- **Qolgan yagona majburiy qadam:** `public/quran/{1..114}.json` (1-bo'lim). Ularsiz funksiya `quran-data-unavailable` qaytaradi.
- Ixtiyoriy: 3-bo'lim (Hugging Face ASR). Bo'lmasa funksiya Gemini'dan foydalanadi (`GEMINI_API_KEY` allaqachon mavjud).

## Hifz Mushaf — jonli sahifa (My Learning → Hifz Mushaf)
Tarteel'dagidek: talaba surani tanlaydi, mushaf ko'rinishidagi sahifa ochiladi (so'zlar yashirin), talaba yoddan o'qiydi va
**to'g'ri aytilgan so'zlar sahifada o'sha zahoti paydo bo'ladi**. Xato so'z qizil (to'g'ri shakli bilan), shubhali so'z sariq.
- Backend kerak EMAS: Qur'on matni `public/quran/{n}.json`, ovozni tanish — brauzerning o'z `SpeechRecognition` (Chrome / Edge / Safari; Firefox'da yo'q).
- Fayllar: `src/pages/Dashboard/Hifz/HifzLiveView.jsx` (ekran), `src/lib/hifzLive.js` (jonli solishtirish), `src/lib/liveStt.js` (mikrofon).
- Solishtirgich serverdagi bilan bir xil (`supabase/functions/_shared/hifz-align.js`); unga faqat ixtiyoriy `{ prefix: true }` rejimi qo'shildi.
  Standart rejim o'zgarmagan, shuning uchun `ufuq-hifz-check` funksiyasini qayta deploy qilish shart emas.
- Sinov: `npm test` (ikkala test fayli).
- Ma'lumot saqlanmaydi (ball ustozga ko'rinmaydi) — bu keyingi bosqich: `hifz_practice` jadvali.
- Sahifalar — **haqiqiy Madina mushafi** (Hafs, 604 sahifa): sahifa raqami, juz, sura sarlavhasi va basmala bosma mushafdagidek.
  Sahifa chegaralari `src/lib/mushafPages.js` da (AlQuran Cloud metama'lumoti; `test/mushafPages.test.mjs` sura boshlanish sahifalari,
  30 juz va 6236 oyat qoplanishini mustaqil tekshiradi). Sura/oyat tanlansa, shu oyat turgan sahifa ochiladi va undan oldingi so'zlar hisoblanmaydi.
  Bir sahifada bir nechta sura bo'lishi mumkin (masalan 604-bet: Ixlos, Falaq, Nos) — matn kerakli sura fayllaridan yig'iladi.
  Sahifada 29–162 so'z bor (o'rtacha ~130), telefonda sahifa ichida aylantiriladi.
