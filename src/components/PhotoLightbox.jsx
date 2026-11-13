import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ZoomPan from './ZoomPan';

/**
 * Full-size photo viewer that opens ON the page (no new tab): dark backdrop, big photo, ‹ › between the photos of one student,
 * click the photo to zoom, Esc / backdrop / × to close, optional Download button.
 * photos: [{ url, name }]   index: which one is open   onIndex(i), onClose(), onDownload(photo) optional
 */
const CSS = `
.plb{ position:fixed; inset:0; z-index:100000; display:flex; flex-direction:column; background:rgba(8,8,8,.93); color:#EDEAE3; }
.plb-bar{ display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 16px; }
.plb-name{ min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:14px; opacity:.85; }
.plb-name b{ margin-inline-end:10px; font-weight:700; }
.plb-act{ display:flex; align-items:center; gap:8px; }
.plb-btn{ display:inline-flex; align-items:center; justify-content:center; gap:7px; min-width:40px; height:40px; padding:0 12px; border:1px solid rgba(255,255,255,.22); border-radius:11px; background:rgba(255,255,255,.08); color:#fff; font:600 13.5px/1 inherit; cursor:pointer; }
.plb-btn:hover{ background:rgba(255,255,255,.18); }
.plb-btn:focus-visible{ outline:2px solid #E5C878; outline-offset:2px; }
.plb-btn svg{ width:18px; height:18px; }
.plb-stage{ position:relative; flex:1; min-height:0; display:flex; align-items:center; justify-content:center; padding:0 64px 18px; overflow:hidden; }
.plb-zp{ cursor:zoom-in; } .plb-stage.zoom .plb-zp{ cursor:grab; }
.plb-nav{ position:absolute; top:50%; transform:translateY(-50%); width:46px; height:46px; display:grid; place-items:center; border:1px solid rgba(255,255,255,.22); border-radius:50%; background:rgba(0,0,0,.55); color:#fff; cursor:pointer; z-index:2; }
.plb-nav:hover{ background:rgba(255,255,255,.2); }
.plb-nav.prev{ inset-inline-start:10px; } .plb-nav.next{ inset-inline-end:10px; }
.plb-nav svg{ width:22px; height:22px; }
.plb-dots{ display:flex; justify-content:center; gap:7px; padding:0 0 14px; }
.plb-dots i{ width:8px; height:8px; border-radius:50%; background:rgba(255,255,255,.3); }
.plb-dots i.on{ background:#E5C878; }
@media (max-width:640px){ .plb-stage{ padding:0 8px 14px; } .plb-nav{ width:40px; height:40px; } }
`;

const ico = (d) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;

export default function PhotoLightbox({ photos, index, onIndex, onClose, onDownload, labels }) {
  const [zoom, setZoom] = useState(false);
  const zp = useRef(null);
  const n = photos ? photos.length : 0;
  const open = n > 0 && index != null && index >= 0 && index < n;
  const L = { close: 'Close', prev: 'Previous', next: 'Next', download: 'Download', ...(labels || {}) };

  useEffect(() => { setZoom(false); }, [index]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      else if (e.key === 'ArrowRight' && index < n - 1) onIndex(index + 1);
      else if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
    };
    document.addEventListener('keydown', onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey, true); document.body.style.overflow = prevOverflow; };
  }, [open, index, n, onClose, onIndex]);

  if (!open) return null;
  const p = photos[index];
  return createPortal(
    <div className="plb" role="dialog" aria-modal="true" aria-label={p.name || 'Photo'}>
      <style>{CSS}</style>
      <div className="plb-bar">
        <div className="plb-name" dir="auto">{n > 1 && <b>{index + 1} / {n}</b>}{p.name}</div>
        <div className="plb-act">
          {onDownload && <button type="button" className="plb-btn" onClick={() => onDownload(p)}>{ico(<><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><path d="M7 10l5 5 5-5M12 15V3" /></>)}{L.download}</button>}
          <button type="button" className="plb-btn" onClick={() => zp.current && zp.current.zoomBy(1.5)} aria-label="Zoom in">{ico(<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3M11 8v6M8 11h6" /></>)}</button>
          <button type="button" className="plb-btn" onClick={() => zp.current && zp.current.zoomBy(1 / 1.5)} aria-label="Zoom out">{ico(<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3M8 11h6" /></>)}</button>
          <button type="button" className="plb-btn" onClick={onClose} aria-label={L.close} autoFocus>{ico(<path d="M18 6L6 18M6 6l12 12" />)}</button>
        </div>
      </div>
      <div className={'plb-stage' + (zoom ? ' zoom' : '')}>
        {index > 0 && <button type="button" className="plb-nav prev" onClick={() => onIndex(index - 1)} aria-label={L.prev}>{ico(<path d="M15 6l-6 6 6 6" />)}</button>}
        <ZoomPan ref={zp} src={p.url} className="plb-zp" onZoomChange={setZoom}
                 onSwipe={(d) => { const to = index + d; if (to >= 0 && to < n) onIndex(to); }} />
        {index < n - 1 && <button type="button" className="plb-nav next" onClick={() => onIndex(index + 1)} aria-label={L.next}>{ico(<path d="M9 6l6 6-6 6" />)}</button>}
      </div>
      {n > 1 && <div className="plb-dots">{photos.map((_, i) => <i key={i} className={i === index ? 'on' : ''} />)}</div>}
    </div>,
    document.body,
  );
}
