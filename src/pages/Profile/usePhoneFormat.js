import { useCallback, useMemo } from 'react';
import { PHONE_LEN, PHONE_LEN_DEFAULT, PHONE_EXAMPLES } from './phoneData';

function groupPattern(len) {
  if (len === 8) return [2, 3, 3];
  if (len === 9) return [2, 3, 2, 2];
  if (len === 10) return [3, 3, 2, 2];
  if (len === 11) return [3, 4, 4];
  return [3, 3, 3];
}

export function formatPhoneDigits(digits, len) {
  const groups = groupPattern(len);
  const clean = digits.slice(0, len);
  const parts = [];
  let pos = 0;
  for (const size of groups) {
    if (pos >= clean.length) break;
    parts.push(clean.slice(pos, pos + size));
    pos += size;
  }
  return parts.join(' ');
}

/** Country-aware phone length/dial-code/placeholder + digit formatting (port of profile.html's phone logic). */
export function usePhoneFormat(country) {
  const len = PHONE_LEN[country] || PHONE_LEN_DEFAULT;
  const placeholder = useMemo(
    () => PHONE_EXAMPLES[country] || formatPhoneDigits('12345678901', len),
    [country, len]
  );
  const maxLength = len + Math.max(2, Math.ceil(len / 3));
  const format = useCallback((raw) => formatPhoneDigits(raw.replace(/\D/g, '').slice(0, len), len), [len]);
  return { len, placeholder, maxLength, format };
}
