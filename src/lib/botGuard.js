/**
 * Yengil bot-himoya qatlami (CAPTCHA'ga qo'shimcha, hech narsa ko'rsatmaydi):
 *  - honeypot: odam ko'rmaydigan maydonni bot to'ldirib yuboradi
 *  - tezlik: forma ochilgandan keyin 0.8 soniyadan oldin yuborish — bot
 *  - cheklov: 60 soniyada 5 ta muvaffaqiyatsiz urinish -> 30 soniya kutish
 *
 * Holat localStorage'da saqlanadi, shuning uchun sahifani yangilash bilan
 * qulf yo'qolmaydi. Haqiqiy himoya serverda (Supabase Auth CAPTCHA + rate limit);
 * bu qatlam faqat oddiy skriptlarni va tasodifiy takroriy urinishlarni to'xtatadi.
 */
export const MIN_MS = 800;
export const MAX_FAILS = 5;
export const WINDOW_MS = 60000;
export const LOCK_MS = 30000;
const STORE_KEY = 'ufuq-bot-guard';

let memState = { fails: [], lockUntil: 0 };

function readState() {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && Array.isArray(s.fails) && typeof s.lockUntil === 'number') return s;
      }
    }
  } catch (e) { /* storage blocked yoki buzilgan qiymat */ }
  return memState;
}

function writeState(s) {
  memState = s;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch (e) { /* ignore */ }
}

export function checkBotGuard({ openedAt, honey, now = Date.now() }) {
  const { lockUntil } = readState();
  if (lockUntil > now) return { ok: false, reason: 'locked', wait: Math.ceil((lockUntil - now) / 1000) };
  if (honey && String(honey).trim()) return { ok: false, reason: 'honey' };
  if (openedAt && now - openedAt < MIN_MS) return { ok: false, reason: 'fast' };
  return { ok: true };
}

export function noteAuthFailure(now = Date.now()) {
  const s = readState();
  const fails = s.fails.filter((t) => now - t < WINDOW_MS);
  fails.push(now);
  if (fails.length >= MAX_FAILS) writeState({ fails: [], lockUntil: now + LOCK_MS });
  else writeState({ fails, lockUntil: s.lockUntil });
}

export function noteAuthSuccess() { writeState({ fails: [], lockUntil: 0 }); }

/** Test uchun: holatni tozalash. */
export function _resetBotGuard() { memState = { fails: [], lockUntil: 0 }; try { if (typeof localStorage !== 'undefined') localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ } }
