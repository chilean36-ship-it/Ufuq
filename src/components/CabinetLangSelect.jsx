import { LANGS } from '../i18n';
import { useCabinetI18n } from '../context/CabinetI18nContext';
import PillSelect from './PillSelect';

const OPTIONS = LANGS.map((l) => ({ value: l.code, label: l.label, code: l.code }));

/** Language picker for every cabinet topbar (student / teacher / admin / profile) and the settings page. */
export default function CabinetLangSelect({ id = 'ufuqLanguageSelect', alignLeft = false, hideCurOnMobile = true }) {
  const { t, lang, setLang } = useCabinetI18n();
  return (
    <PillSelect id={id} options={OPTIONS} value={lang} onChange={setLang} showCode
                ariaLabel={t('Language')} alignLeft={alignLeft} hideCurOnMobile={hideCurOnMobile} />
  );
}
