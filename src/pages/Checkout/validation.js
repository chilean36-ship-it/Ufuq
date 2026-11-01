import { detectBrand } from './CardFields';

/* Phase 3 — pure validation helpers for the checkout form (no side effects, nothing is stored or sent). */

/** Visual order of the fields on the page — the first invalid one in this order receives focus. */
export const FIELD_ORDER = ['cardNum', 'exp', 'cvc', 'cardName', 'name', 'email', 'phone', 'terms', 'start'];
export const FIELD_ID = {
  cardNum: 'coCardNum', cardName: 'coCardName', exp: 'coCardExp', cvc: 'coCardCvc',
  name: 'coName', email: 'coEmail', phone: 'coPhone', terms: 'coTerms', start: 'coStart',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function luhn(num) {
  const d = String(num || '').replace(/\D/g, '');
  if (d.length < 12) return false;
  let sum = 0;
  let alt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = +d[i];
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/** 'incomplete' | 'bad' | 'expired' | 'ok' */
export function expiryState(exp, now = new Date()) {
  const d = String(exp || '').replace(/\D/g, '');
  if (d.length < 4) return 'incomplete';
  const mm = +d.slice(0, 2);
  const year = 2000 + +d.slice(2, 4);
  if (mm < 1 || mm > 12) return 'bad';
  if (new Date(year, mm, 1) <= now) return 'expired'; // valid through the last day of the printed month
  if (year > now.getFullYear() + 20) return 'bad';
  return 'ok';
}

/** Returns { field: { k: 'i18n key under pay.val.*', n?: number } } — empty object means the form is valid. */
export function validateAll({ form, card, method, savedSel }) {
  const e = {};
  if ((form.name || '').trim().length < 2) e.name = { k: 'name' };
  if (!EMAIL_RE.test((form.email || '').trim())) e.email = { k: 'email' };

  if (method === 'paymob') {
    const ph = (form.phone || '').trim();
    if (ph && (!/^[+\d\s().-]+$/.test(ph) || ph.replace(/\D/g, '').length < 7 || ph.replace(/\D/g, '').length > 15)) e.phone = { k: 'phone' };

    if (!savedSel) {
      const digits = (card.number || '').replace(/\D/g, '');
      const brand = detectBrand(card.number);
      const need = brand === 'amex' ? 15 : 16;
      if (!digits) e.cardNum = { k: 'cardNum' };
      else if (digits.length < need) e.cardNum = { k: 'cardNumShort' };
      else if (!luhn(digits)) e.cardNum = { k: 'cardNum' };

      if ((card.name || '').trim().length < 2) e.cardName = { k: 'cardName' };

      const ex = expiryState(card.exp);
      if (ex === 'expired') e.exp = { k: 'expired' };
      else if (ex !== 'ok') e.exp = { k: 'exp' };

      const cvcLen = brand === 'amex' ? 4 : 3;
      if ((card.cvc || '').length !== cvcLen) e.cvc = { k: 'cvc', n: cvcLen };
    }
  }

  if (!form.terms) e.terms = { k: 'terms' };
  if (!form.start) e.start = { k: 'start' };
  return e;
}
