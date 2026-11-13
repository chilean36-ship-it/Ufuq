import { useEffect } from 'react';
import { useApp } from './AppContext';
import { Ico } from './ui';

const SUGGEST = {
  UZ: ['Menga arab harflarini o‘rgat', 'Salomlashish iboralarini ayt', 'Mening xatolarimni tuzat'],
  RU: ['Научи меня арабским буквам', 'Фразы для приветствия', 'Исправь мои ошибки'],
  EN: ['Teach me the Arabic letters', 'Greetings in Arabic', 'Correct my mistakes'],
  AR: ['علّمني الحروف العربية', 'عبارات التحية', 'صحّح أخطائي'],
};

/** Ufuq AI tab: opens the full chat (voice mode, history and all) the moment the tab is shown. */
export default function AiScreen() {
  const { t, lang } = useApp();
  const open = () => window.dispatchEvent(new Event('ufuq-ai-open'));
  useEffect(() => { const id = setTimeout(open, 250); return () => clearTimeout(id); }, []);
  return (
    <div className="ua-page ua-ai">
      <div className="ua-ai-orb"><Ico n="ai" size={40} sw={1.6} /></div>
      <h1>Ufuq AI</h1>
      <p className="ua-hint center">{t('plan4')}</p>
      <button type="button" className="ua-btn ua-btn-primary" onClick={open}>{t('continue')}</button>
      <ul className="ua-sugg">{(SUGGEST[lang] || SUGGEST.EN).map((s) => <li key={s}>{s}</li>)}</ul>
    </div>
  );
}
