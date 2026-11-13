import { useState } from 'react';

const KEY = 'ufuq-from-app';
/** Remember that the panel was opened from the Ufuq app (call right before leaving /app). */
export function markFromApp() { try { sessionStorage.setItem(KEY, '1'); } catch (e) { /* storage blocked */ } }

const LABEL = { UZ: 'Ilovaga qaytish', RU: 'Назад в приложение', EN: 'Back to the app', AR: 'العودة إلى التطبيق' };
function lang() { try { const l = localStorage.getItem('ufuq-language'); return LABEL[l] ? l : 'UZ'; } catch (e) { return 'UZ'; } }

/** A small floating pill on the admin / teacher panels (opened from the app) that leads back to the app. */
export default function BackToApp() {
  const [on] = useState(() => { try { return sessionStorage.getItem(KEY) === '1'; } catch (e) { return false; } });
  if (!on) return null;
  const go = () => { window.location.assign('/app'); };
  return (
    <button type="button" onClick={go} aria-label={LABEL[lang()]}
      style={{ position: 'fixed', left: 12, bottom: 'calc(12px + env(safe-area-inset-bottom))', zIndex: 9000, display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '0 16px 0 12px', borderRadius: 99, border: '1px solid rgba(229,200,120,.5)', background: 'rgba(24,22,18,.92)', color: '#E5C878', font: '700 14px/1 Inter, system-ui, sans-serif', boxShadow: '0 8px 24px rgba(0,0,0,.45)', cursor: 'pointer', WebkitBackdropFilter: 'blur(10px)', backdropFilter: 'blur(10px)' }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
      {LABEL[lang()]}
    </button>
  );
}
