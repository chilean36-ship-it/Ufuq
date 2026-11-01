import { useEffect, useState } from 'react';
import { useI18n } from '../../context/I18nContext';
import { lockScroll, unlockScroll } from '../../lib/scrollLock';

/**
 * Programs / Discover / Student-stories lightbox (port of #progLightbox).
 * `item` = { img?: {src, alt, style, className, hideOnError}, initial?, gradientClass?, video?,
 *            labelKey?, label?, titleKey?, title? }
 */
export default function Lightbox({ item, onClose }) {
  const { t } = useI18n();
  const [videoFailed, setVideoFailed] = useState(false);
  useEffect(() => { setVideoFailed(false); }, [item]);

  useEffect(() => {
    if (!item) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [item, onClose]);

  useEffect(() => {
    if (!item) return undefined;
    lockScroll();
    return () => unlockScroll();
  }, [item]);

  const open = !!item;
  let mediaClass = 'prog-lightbox-media';
  let media = null;
  if (item) {
    if (item.gradientClass) mediaClass += ` ${item.gradientClass} face-fallback`;
    if (item.video && !videoFailed) {
      media = (
        <video
          src={item.video}
          poster={item.img ? item.img.src : undefined}
          controls
          autoPlay
          playsInline
          preload="metadata"
          onError={() => setVideoFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
        />
      );
    } else {
      media = (
        <>
          {item.img && (
            <img
              className={item.img.className}
              src={item.img.src}
              alt={item.img.alt}
              style={item.img.style}
              loading={item.img.lazy ? 'lazy' : undefined}
              onError={item.img.hideOnError ? (e) => { e.currentTarget.style.display = 'none'; } : undefined}
            />
          )}
          {item.initial && <span className="face-initial">{item.initial}</span>}
          {item.video && videoFailed && (
            <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '10px 14px', background: 'rgba(0,0,0,.65)', color: '#fff', fontSize: 13, textAlign: 'center' }}>
              {t('lightbox.videoUnavailable')}
            </span>
          )}
        </>
      );
    }
  }

  const label = item ? (item.labelKey ? t(item.labelKey) : item.label || '') : '';
  const title = item ? (item.titleKey ? t(item.titleKey) : item.title || '') : '';

  return (
    <div
      className={'prog-lightbox' + (open ? ' open' : '')}
      id="progLightbox"
      aria-hidden={!open}
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <button type="button" className="prog-lightbox-close" id="progLightboxClose" aria-label="Close" onClick={onClose}>
        &times;
      </button>
      <div className={'prog-lightbox-inner' + (item && item.video && !videoFailed ? ' is-video' : '')}>
        <div className={mediaClass} id="progLightboxMedia">{media}</div>
        <div className="prog-lightbox-copy">
          <div className="prog-lightbox-label" id="progLightboxLabel">{label}</div>
          <div className="prog-lightbox-title" id="progLightboxTitle">{title}</div>
        </div>
      </div>
    </div>
  );
}
