# Zoom'ni sayt ichiga ulash — o'rnatish

O'quvchi **Join Class / Join Zoom** bosganda dars endi sayt ichida (to'liq ekran oynada) ochiladi.
O'qituvchi darsni avvalgidek Zoom'da boshlaydi. Telefondagi brauzerlarda eski usul (Zoom havolasi yangi tabda) qoladi.

## 1. Zoom'da Meeting SDK ilovasi
1. https://marketplace.zoom.us → Develop → Build App → **Meeting SDK**.
2. **Darslar o'tkaziladigan Zoom hisobi bilan bir xil hisobda** yarating. Boshqa hisobdagi uchrashuvlarga qo'shilish uchun Zoom ilovani tekshiruvdan o'tkazishni va ZAK/OBF token ishlatishni talab qiladi (2026-yil 2-martdan).
3. App Credentials sahifasidan **Client ID** va **Client Secret** ni oling.

## 2. Paket
```bash
npm install @zoom/meetingsdk
```

## 3. Supabase
```bash
supabase secrets set ZOOM_SDK_KEY=<Client ID>
supabase secrets set ZOOM_SDK_SECRET=<Client Secret>
supabase functions deploy zoom-signature
```
`--no-verify-jwt` **kerak emas**: funksiyani faqat tizimga kirgan foydalanuvchi chaqiradi.

## 4. Guruhlarning Zoom havolasi
Admin panelda har bir guruhning `Zoom link` maydoni quyidagi ko'rinishda bo'lishi kerak:
`https://us02web.zoom.us/j/81234567890?pwd=...`
Shaxsiy havola (`zoom.us/my/ism`) ishlamaydi, chunki undan meeting raqamini olib bo'lmaydi.

## 5. Deploy
`vercel.json` o'zgardi: kamera ruxsati yoqildi (`camera=(self)`, avval `camera=()` edi, shuning uchun o'quvchi videosi umuman ishlamas edi) va `/dashboard`, `/` sahifalariga HD video / gallery view uchun `COOP`/`COEP` sarlavhalari qo'shildi.

## Sinash
1. Bitta guruhga Zoom dars yarating, o'qituvchi Zoom ilovasida boshlasin.
2. O'quvchi akkauntidan dashboard → My Group → Join Class.
3. Xato chiqsa, oynada Zoom'ning xabari ko'rinadi, brauzer konsolida to'liq xato bor.

## Ma'lum cheklovlar
- Component View faqat kompyuter brauzerlari uchun. Telefonda eski usul.
- Safari `COEP: credentialless` ni qo'llamaydi: u yerda Zoom ishlaydi, lekin HD / gallery view cheklangan bo'lishi mumkin.
- Havoladagi `pwd` kodi SDK'ga parol sifatida beriladi. Agar "parol noto'g'ri" xatosi chiqsa, Zoom'da meeting parolini oddiy ko'rinishga o'zgartirib, havolani yangilang.
- Kod build qilib sinalmadi (yuklab olish tarmog'i yopiq edi). Birinchi `npm run dev` da `ZoomRoom.jsx` bo'yicha xato chiqsa, yuboring.
