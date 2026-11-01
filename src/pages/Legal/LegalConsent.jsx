import { useI18n } from '../../context/I18nContext';
import { legalUi } from './legalContent';

/** "By continuing, you agree to our Terms and Privacy Policy" — opens the documents in a new tab. */
export default function LegalConsent({ className = 'auth-terms', id }) {
  const { lang } = useI18n();
  const ui = legalUi(lang);
  return (
    <p className={className} id={id}>
      <span>{ui.consentPrefix}</span>{' '}
      <a href="/terms" target="_blank" rel="noopener noreferrer">{ui.terms}</a>{' '}
      <span>{ui.and}</span>{' '}
      <a href="/privacy" target="_blank" rel="noopener noreferrer">{ui.privacy}</a>.
    </p>
  );
}
