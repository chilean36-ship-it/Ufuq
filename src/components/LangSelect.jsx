import { LANGS } from '../i18n';
import { useI18n } from '../context/I18nContext';
import PillSelect from './PillSelect';

const OPTIONS = LANGS.map((l) => ({ value: l.code, label: l.label, code: l.code }));

/**
 * Language dropdown for the public pages (landing / about-author / checkout).
 * Same pill + menu as the cabinet pages, so the picker looks identical everywhere.
 */
export default function LangSelect({ variant = 'site' }) {
  const { lang, setLang } = useI18n();
  return (
    <PillSelect id="langSelect" options={OPTIONS} value={lang} onChange={setLang} showCode
                ariaLabel="Language" hideCurOnMobile={variant === 'checkout'} />
  );
}
