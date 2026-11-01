import en from './en';
import uz from './uz';
import ru from './ru';
import ar from './ar';
import extra from './landing-extra';
import pay from './pay-site';
import payEntry from './pay-entry';
import captcha from './captcha';

export const DICTS = { EN: { ...en, ...extra.EN, ...pay.EN, ...payEntry.EN, ...captcha.EN }, UZ: { ...uz, ...extra.UZ, ...pay.UZ, ...payEntry.UZ, ...captcha.UZ }, RU: { ...ru, ...extra.RU, ...pay.RU, ...payEntry.RU, ...captcha.RU }, AR: { ...ar, ...extra.AR, ...pay.AR, ...payEntry.AR, ...captcha.AR } };
export const LANG_KEY = 'ufuq-language';
export const LANGS = [
  { code: 'EN', label: 'English' },
  { code: 'UZ', label: "O'zbekcha" },
  { code: 'RU', label: 'Русский' },
  { code: 'AR', label: 'العربية' },
];

/** Resolves nested keys, e.g. "checkout.summary.title" as well as "pricing.perMonth". */
export function resolve(dict, key) {
  return key.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), dict);
}
