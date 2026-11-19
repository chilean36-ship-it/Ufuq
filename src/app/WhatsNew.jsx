import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import PopupCard from '../components/PopupCard';
import { fetchPendingPopup, markPopupSeen } from '../lib/appPopups';
import { useApp } from './AppContext';
import { haptic } from './hooks';

/**
 * Shown once when the app opens and the admin has published something new (Messages > App pop-up).
 * A sheet rises from the bottom over a blurred screen: picture, title, text and one button.
 */
export default function WhatsNew({ userId, onNavigate }) {
  const { t } = useApp();
  const [popup, setPopup] = useState(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    const id = setTimeout(async () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      const p = await fetchPendingPopup(userId);
      if (!cancelled && p) setPopup(p);
    }, 1200);   // let the Home screen settle first
    return () => { cancelled = true; clearTimeout(id); };
  }, [userId]);

  const close = useCallback((after) => {
    if (!popup) return;
    markPopupSeen(popup.id, userId);
    setClosing(true);
    setTimeout(() => { setPopup(null); setClosing(false); if (after) after(); }, 320);
  }, [popup, userId]);

  useEffect(() => {
    if (!popup) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [popup, close]);

  if (!popup) return null;
  const link = (popup.cta_link || '').trim();
  const isUrl = /^https?:\/\//i.test(link);
  const label = popup.cta_label || (link ? t('popView') : t('popGotIt'));
  const go = () => {
    haptic(10);
    close(() => {
      if (isUrl) window.open(link, '_blank', 'noopener');
      else if (link) onNavigate(link);
    });
  };
  return createPortal(
    <div className={'wn-ov' + (closing ? ' out' : '')} role="dialog" aria-modal="true" aria-label={popup.title}
         onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="wn-sheet">
        <PopupCard imageUrl={popup.image_url} title={popup.title} body={popup.body} ctaLabel={label} onCta={go} onClose={() => close()} />
      </div>
      <style>{`
        .wn-ov{position:fixed;inset:0;z-index:2000;display:flex;align-items:flex-end;justify-content:center;padding:12px 12px calc(12px + env(safe-area-inset-bottom));background:rgba(0,0,0,.45);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);animation:wnFade .3s ease both}
        .wn-sheet{width:100%;max-width:440px;animation:wnUp .55s cubic-bezier(.2,.9,.25,1.05) both}
        .wn-ov.out{animation:wnFadeOut .3s ease forwards}.wn-ov.out .wn-sheet{animation:wnDown .3s ease-in forwards}
        @keyframes wnFade{from{opacity:0}} @keyframes wnFadeOut{to{opacity:0}}
        @keyframes wnUp{from{transform:translateY(110%)}} @keyframes wnDown{to{transform:translateY(110%)}}
        @media (prefers-reduced-motion:reduce){.wn-ov,.wn-sheet{animation:none!important}}
      `}</style>
    </div>,
    document.body,
  );
}
