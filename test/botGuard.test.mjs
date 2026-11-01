import assert from 'node:assert/strict';
import { checkBotGuard, noteAuthFailure, noteAuthSuccess, _resetBotGuard, MAX_FAILS, LOCK_MS, MIN_MS } from '../src/lib/botGuard.js';

_resetBotGuard();
const t0 = 1_000_000;

// 1) Odatiy odam: ochiq
assert.equal(checkBotGuard({ openedAt: t0 - 5000, honey: '', now: t0 }).ok, true);
// 2) Honeypot to'ldirilgan -> rad
assert.equal(checkBotGuard({ openedAt: t0 - 5000, honey: 'x', now: t0 }).reason, 'honey');
// 3) Juda tez yuborish -> rad
assert.equal(checkBotGuard({ openedAt: t0 - (MIN_MS - 100), honey: '', now: t0 }).reason, 'fast');

// 4) MAX_FAILS marta xato -> qulf
for (let i = 0; i < MAX_FAILS; i++) noteAuthFailure(t0 + i * 100);
const locked = checkBotGuard({ openedAt: t0 - 5000, honey: '', now: t0 + 1000 });
assert.equal(locked.reason, 'locked');
assert.equal(locked.wait, Math.ceil((LOCK_MS - 900) / 1000));

// 5) Qulf muddati tugagach qayta ochiladi
assert.equal(checkBotGuard({ openedAt: t0 - 5000, honey: '', now: t0 + LOCK_MS + 1000 }).ok, true);

// 6) Muvaffaqiyatli kirish hisoblagichni tozalaydi
_resetBotGuard();
for (let i = 0; i < MAX_FAILS - 1; i++) noteAuthFailure(t0 + i);
noteAuthSuccess();
noteAuthFailure(t0 + 10);
assert.equal(checkBotGuard({ openedAt: t0 - 5000, honey: '', now: t0 + 11 }).ok, true);

console.log('botGuard tests: ok');
