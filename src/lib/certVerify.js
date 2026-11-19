/* Where a certificate is checked: the QR code on it and the printed link point here. Keep the host in ONE place. */
export const VERIFY_HOST = 'https://ufuqtaleem.com';
export const verifyUrl = (serial) => `${VERIFY_HOST}/verify/${encodeURIComponent(String(serial || '').trim())}`;
/** UFQ-XXXXX-XXXXX, upper case. Anything else is not a serial. */
export const normalizeSerial = (s) => String(s || '').trim().toUpperCase().replace(/\s+/g, '');
export const looksLikeSerial = (s) => /^UFQ-[0-9A-F]{5}-[0-9A-F]{5}$/.test(normalizeSerial(s));
