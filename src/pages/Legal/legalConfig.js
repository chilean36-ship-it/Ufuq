/**
 * Legal details shown in Terms / Privacy / Cookies / Refund pages.
 * >>> FILL THESE IN before launch (operator name, address, e-mail, governing law). <<<
 * Anything left empty is shown as a visible [placeholder] so it is never forgotten.
 * The texts are a solid starting template, NOT legal advice — have a local lawyer review them.
 */
export const LEGAL = {
  operator: '',            // e.g. "Ufuq Education LLC"
  address: '',             // registered address
  email: '',               // e.g. "legal@ufuq.example"
  supportUrl: 'https://t.me/ufuq_support',
  governingLaw: '',        // e.g. "the Republic of Uzbekistan"
  minAge: 16,              // below this age a parent/guardian must create/approve the account
  refundDays: 14,          // keep equal to "Refund window (days)" in Admin → Payments → Settings
  updated: '2026-10-18',
};

export const ph = (value, label) => (value && String(value).trim() ? String(value) : `[${label}]`);
