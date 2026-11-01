import { safeHttpUrl } from '../../../lib/safeUrl';
import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { useCabinetI18n } from '../../../context/CabinetI18nContext';

/** Edge Function xatosidagi haqiqiy xabarni olish (invoke non-2xx da `data` ni null qiladi). */
async function fetchSignature() {
  const { data, error } = await supabase.functions.invoke('zoom-signature', { body: {} });
  if (error) {
    let msg = error.message;
    try {
      const body = await error.context.json();
      if (body && body.error) msg = body.error;
    } catch (e) { /* javob JSON emas */ }
    throw new Error(msg);
  }
  if (data && data.error) throw new Error(data.error);
  return data;
}

const S = {
  overlay: { position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg, #121212)', color: 'var(--text, #EDEAE3)' },
  center: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: 24, textAlign: 'center' },
  btn: { border: '1px solid var(--gold, #C9A24B)', background: 'var(--gold-dim, rgba(201,162,75,.14))', color: 'var(--gold-bright, #E5C878)', borderRadius: 3, padding: '9px 16px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', textDecoration: 'none' },
};

/**
 * Zoom dars: Zoom'ning to'liq (Client View) interfeysi — alohida /zoom-meeting.html sahifasida,
 * Zoom'ning rasmiy CDN skriptlari bilan (Vite bundle'idan tashqarida).
 * Bu yerda faqat imzo olinadi va o'sha sahifaga o'tiladi. Chiqilganda shu sahifaga qaytiladi.
 */
export default function ZoomRoom({ groupName, fallbackUrl, onClose }) {
  const { t, lang } = useCabinetI18n();
  const [errorMsg, setErrorMsg] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setErrorMsg('');
    (async () => {
      try {
        const sig = await fetchSignature();
        if (cancelled) return;
        sessionStorage.setItem('ufuq_zoom', JSON.stringify({
          signature: sig.signature,
          meetingNumber: sig.meetingNumber,
          password: sig.password,
          userName: sig.userName,
          lang,
          fallbackUrl: fallbackUrl || '',
          back: window.location.pathname + window.location.search,
        }));
        window.location.assign('/zoom-meeting.html');
      } catch (err) {
        if (cancelled) return;
        console.error('Zoom xatosi:', err);
        setErrorMsg((err && (err.reason || err.errorMessage || err.message)) || t('Could not join the lesson.'));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  return (
    <div style={S.overlay} role="dialog" aria-modal="true" aria-label={groupName || 'Zoom'}>
      <div style={S.center}>
        {!errorMsg && <div>{t('Connecting to the lesson…')}</div>}
        {errorMsg && (
          <>
            <div style={{ maxWidth: 460, lineHeight: 1.5 }}>{errorMsg}</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
              <button type="button" style={S.btn} onClick={() => setAttempt((n) => n + 1)}>{t('Try again')}</button>
              {safeHttpUrl(fallbackUrl) && <a style={S.btn} href={safeHttpUrl(fallbackUrl)} target="_blank" rel="noopener noreferrer">{t('Open in Zoom app')}</a>}
              <button type="button" style={S.btn} onClick={onClose}>{t('Close')}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
