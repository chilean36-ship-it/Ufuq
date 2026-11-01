/* ============================================================
   Ufuq — Service Worker (React/Vite SPA build)
   Offline rejim: 1) ilova qobig'i (bitta index.html + hash'langan
   JS/CSS bundle'lar), 2) foydalanuvchi ochib ko'rgan audio darslar
   va doska rasmlari — internetsiz ham ishlashi uchun.

   Eski (ko'p-sahifali) versiyadan farqi: Vite har bir build'da
   /assets/*.js va /assets/*.css fayllarini yangi hash bilan chiqaradi,
   shuning uchun ularni oldindan qattiq ro'yxat qilib bo'lmaydi — buning
   o'rniga birinchi so'ralganda keshga tushadi (runtime caching).
   Versiyani oshirsangiz (v1 -> v2), eski keshlar avtomatik tozalanadi.
   ============================================================ */
// v3: eski keshlarda (vercel rewrite tufayli) JS o'rniga index.html saqlanib qolgan bo'lishi mumkin edi -> oppoq ekran.
// v2: eski 'ufuq-media-v1' keshi (ichida Drive'dan kelgan buzuq/xato javoblar
// qolib ketgan edi) activate paytida butunlay o'chiriladi.
const SHELL_CACHE = 'ufuq-shell-v3';

// Faqat SPA qobig'ining o'zi oldindan keshga olinadi — client-side router
// istalgan marshrutni (/dashboard, /teacher, ...) shu bitta index.html'dan ishga tushiradi.
const SHELL_ASSETS = ['/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .catch((err) => console.warn('SW install: shell keshlashda xatolik', err))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Supabase'ning "jonli" bo'lishi shart bo'lgan so'rovlari (auth, rest API,
// imzolangan/vaqtinchalik storage havolalari) — bularni hech qachon
// keshlab qo'ymaymiz, aks holda eski/eskirgan ma'lumot ko'rsatilib qoladi.
function isLiveSupabaseRequest(url) {
  return url.hostname.endsWith('supabase.co') &&
    (url.pathname.includes('/auth/') ||
     url.pathname.includes('/rest/') ||
     url.pathname.includes('/storage/v1/object/sign'));
}

// Vite'ning hash'langan bundle fayllari (/assets/index-XXXX.js va .css) —
// hash o'zgarmas mazmunni bildiradi, shuning uchun cache-first xavfsiz va tez.
function isBuildAsset(url) {
  return url.pathname.startsWith('/assets/') &&
    (url.pathname.endsWith('.js') || url.pathname.endsWith('.css'));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }

  if (isLiveSupabaseRequest(url)) return; // brauzerning odatiy tarmoq so'roviga qo'yib beramiz

  // Zoom sahifasi (Client View) — servis-vorker aralashmaydi, qobiq keshini buzmasin.
  if (url.pathname === '/zoom-meeting.html') return;

  // Audio / video / rasmlarga HECH QACHON aralashmaymiz. Avval bu yerda media
  // so'rovlari ushlanib, "Range" olib tashlanib butun fayl (katta darslar
  // 60+ MB) yuklanar va xato/opaque javoblar ham doimiy keshga tushar edi —
  // shu sabab audio ochilmasdi va buzuq rasm keshda qolib ketardi.
  // Brauzer media'ni o'zi (Range bilan, oqim qilib) yuklaydi.
  const dest = req.destination;
  if (dest === 'audio' || dest === 'video' || dest === 'image' || req.headers.has('range')) return;

  // Vite bundle'lari: cache-first (hash o'zgarmas — yangi build yangi hash
  // beradi, eskisi hech qachon staleness muammosi keltirmaydi).
  if (isBuildAsset(url)) {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        // Faqat haqiqiy JS/CSS keshlanadi. Eski (o'chib ketgan) fayl so'ralsa Vercel rewrite index.html (200, text/html)
        // qaytaradi — uni JS sifatida keshlab qo'ysak, sayt abadiy oppoq qoladi.
        const ct = (res && res.headers && res.headers.get('content-type')) || '';
        const okType = url.pathname.endsWith('.css') ? /text\/css/i.test(ct) : /javascript|ecmascript/i.test(ct);
        if (res && res.ok && okType) cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  // Sahifa navigatsiyasi (SPA marshrutlari, masalan /dashboard): network-first
  // — internet bo'lsa doim eng yangi qobiqni ko'rsatadi, bo'lmasa keshdagi
  // index.html'ga tushadi va client-side router joriy URL'ni o'zi hal qiladi.
  if (req.mode === 'navigate' || url.pathname === '/') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Only a healthy page becomes the offline shell (a 404/500/redirect must never be cached as "the app").
          if (res && res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put('/', copy));
          }
          return res;
        })
        .catch(() => caches.match('/'))
    );
  }
});
