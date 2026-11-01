import assert from 'node:assert/strict';
import { turnstileLang, isCaptchaError, captchaEnabled } from '../src/lib/captcha.js';

// Til moslashtirish: noma'lum til -> brauzer tili (auto)
assert.equal(turnstileLang('uz'), 'auto');
assert.equal(turnstileLang('RU'), 'ru');
assert.equal(turnstileLang('ar'), 'ar');
assert.equal(turnstileLang('EN'), 'en');

// Captcha xatolarini aniqlash
assert.equal(isCaptchaError({ message: 'captcha verification process failed' }), true);
assert.equal(isCaptchaError({ message: 'Invalid login credentials' }), false);
assert.equal(isCaptchaError(null), false);

// Kalit .env da bo'lmasa CAPTCHA o'chiq (test muhitida)
assert.equal(typeof captchaEnabled, 'boolean');

console.log('captcha tests: ok');
