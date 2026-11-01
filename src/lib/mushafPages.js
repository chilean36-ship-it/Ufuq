// Madina mushafi (Hafs, 604 sahifa): har bir sahifa qaysi sura:oyatdan boshlanishi.
// Manba: AlQuran Cloud metama'lumoti (https://api.alquran.cloud/v1/meta → pages.references, juzs.references),
// sura boshlanish sahifalari va juz chegaralari bo'yicha mustaqil tekshirilgan (test/mushafPages.test.mjs).
// Qur'on matni Tanzil.net'dan (https://tanzil.net) — o'zgartirilmagan.
//
// Qator formati: 'sura:oyat,oyat,...' — ketma-ket sahifalarning boshlanish oyatlari (sura bo'yicha guruhlangan).

const ROWS = [
  '1:1',
  '2:1,6,17,25,30,38,49,58,62,70,77,84,89,94,102,106,113,120,127,135,142,146,154,164,170,177,182,187,191,197,203,211,216,220,225,231,234,238,246,249,253,257,260,265,270,275,282,283',
  '3:1,10,16,23,30,38,46,53,62,71,78,84,92,101,109,116,122,133,141,149,154,158,166,174,181,187,195',
  '4:1,7,12,15,20,24,27,34,38,45,52,60,66,75,80,87,92,95,102,106,114,122,128,135,141,148,155,163,171,176',
  '5:3,6,10,14,18,24,32,37,42,46,51,58,65,71,77,83,90,96,104,109,114',
  '6:1,9,19,28,36,45,53,60,69,74,82,91,95,102,111,119,125,132,138,143,147,152,158',
  '7:1,12,23,31,38,44,52,58,68,74,82,88,96,105,121,131,138,144,150,156,160,164,171,179,188,196',
  '8:1,9,17,26,34,41,46,53,62,70',
  '9:1,7,14,21,27,32,37,41,48,55,62,69,73,80,87,94,100,107,112,118,123',
  '10:1,7,15,21,26,34,43,54,62,71,79,89,98,107',
  '11:6,13,20,29,38,46,54,63,72,82,89,98,109,118',
  '12:5,15,23,31,38,44,53,64,70,79,87,96,104',
  '13:1,6,14,19,29,35,43',
  '14:6,11,19,25,34,43',
  '15:1,16,32,52,71,91',
  '16:7,15,27,35,43,55,65,73,80,88,94,103,111,119',
  '17:1,8,18,28,39,50,59,67,76,87,97,105',
  '18:5,16,21,28,35,46,54,62,75,84,98',
  '19:1,12,26,39,52,65,77,96',
  '20:13,38,52,65,77,88,99,114,126',
  '21:1,11,25,36,45,58,73,82,91,102',
  '22:1,6,16,24,31,39,47,56,65,73',
  '23:1,18,28,43,60,75,90,105',
  '24:1,11,21,28,32,37,44,54,59,62',
  '25:3,12,21,33,44,56,68',
  '26:1,20,40,61,84,112,137,160,184,207',
  '27:1,14,23,36,45,56,64,77,89',
  '28:6,14,22,29,36,44,51,60,71,78,85',
  '29:7,15,24,31,39,46,53,64',
  '30:6,16,25,33,42,51',
  '31:1,12,20,29',
  '32:1,12,21',
  '33:1,7,16,23,31,36,44,51,55,63',
  '34:1,8,15,23,32,40,49',
  '35:4,12,19,31,39,45',
  '36:13,28,41,55,71',
  '37:1,25,52,77,103,127,154',
  '38:1,17,27,43,62,84',
  '39:6,11,22,32,41,48,57,68,75',
  '40:8,17,26,34,41,50,59,67,78',
  '41:1,12,21,30,39,47',
  '42:1,11,16,23,32,45,52',
  '43:11,23,34,48,61,74',
  '44:1,19,40',
  '45:1,14,23,33',
  '46:6,15,21,29',
  '47:1,12,20,30',
  '48:1,10,16,24,29',
  '49:5,12',
  '50:1,16,36',
  '51:7,31,52',
  '52:15,32',
  '53:1,27,45',
  '54:7,28,50',
  '55:17,41,68',
  '56:17,51,77',
  '57:4,12,19,25',
  '58:1,7,12,22',
  '59:4,10,17',
  '60:1,6,12',
  '61:6',
  '62:1,9',
  '63:5',
  '64:1,10',
  '65:1,6',
  '66:1,8',
  '67:1,13,27',
  '68:16,43',
  '69:9,35',
  '70:11,40',
  '71:11',
  '72:1,14',
  '73:1,20',
  '74:18,48',
  '75:20',
  '76:6,26',
  '77:20',
  '78:1,31',
  '79:16',
  '80:1',
  '81:1',
  '82:1',
  '83:7,35',
  '85:1',
  '86:1',
  '87:16',
  '89:1,24',
  '91:1',
  '92:15',
  '95:1',
  '97:1',
  '98:8',
  '100:10',
  '103:1',
  '106:1',
  '109:1',
  '112:1',
];

// Juz boshlanishi (4-juz ro'yxatda 3:93, mushafda esa 3:92 bilan boshlanuvchi 62-sahifada ochiladi).
const JUZ_ROWS = '1:1 2:142 2:253 3:93 4:24 4:148 5:82 6:111 7:88 8:41 9:93 11:6 12:53 15:1 17:1 18:75 21:1 23:1 25:21 27:56 29:46 33:31 36:28 39:32 41:47 46:1 51:31 58:1 67:1 78:1';

export const PAGE_COUNT = 604;

/** SURAH_AYAHS[n] = n-surada nechta oyat (public/quran/{n}.json dan olingan; jami 6236). */
export const SURAH_AYAHS = [0, 7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135, 112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6];

/** PAGE_STARTS[p - 1] = [sura, oyat] — p-sahifaning birinchi oyati. */
export const PAGE_STARTS = (() => {
  const out = [];
  for (const row of ROWS) {
    const [s, list] = row.split(':');
    for (const a of list.split(',')) out.push([Number(s), Number(a)]);
  }
  return out;
})();

export const JUZ_STARTS = JUZ_ROWS.split(' ').map((x) => x.split(':').map(Number));

const cmp = (s1, a1, s2, a2) => (s1 - s2) || (a1 - a2);

/** (sura, oyat) qaysi sahifada? 1..604. */
export function pageOf(surah, ayah = 1) {
  let lo = 0, hi = PAGE_STARTS.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cmp(PAGE_STARTS[mid][0], PAGE_STARTS[mid][1], surah, ayah) <= 0) lo = mid; else hi = mid - 1;
  }
  return lo + 1;
}

/**
 * Sahifadagi oyatlar: [{ surah, from, to }] — `to` Infinity bo'lsa, sura oxirigacha.
 * Sahifa har doim oyat oxirida tugaydi.
 */
export function pageSegments(p) {
  const page = Math.max(1, Math.min(PAGE_COUNT, p));
  const [s1, a1] = PAGE_STARTS[page - 1];
  let lastS, lastA;
  if (page === PAGE_COUNT) { lastS = 114; lastA = Infinity; } else {
    const [s2, a2] = PAGE_STARTS[page];
    if (a2 === 1) { lastS = s2 - 1; lastA = Infinity; } else { lastS = s2; lastA = a2 - 1; }
  }
  const segs = [];
  for (let s = s1; s <= lastS; s++) segs.push({ surah: s, from: s === s1 ? a1 : 1, to: s === lastS ? lastA : Infinity });
  return segs;
}

/** Sahifaning juz raqami: juz o'sha sahifada yoki undan oldin boshlangan eng oxirgisi. */
export function juzOf(p) {
  const page = Math.max(1, Math.min(PAGE_COUNT, p));
  let j = 1;
  for (let k = 0; k < JUZ_STARTS.length; k++) if (pageOf(JUZ_STARTS[k][0], JUZ_STARTS[k][1]) <= page) j = k + 1;
  return j;
}
