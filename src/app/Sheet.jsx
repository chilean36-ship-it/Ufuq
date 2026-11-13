import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { haptic } from './hooks';

/** Bottom sheet: slides up, closes by tapping outside, Escape, or dragging the handle down. */
export default function Sheet({ open, onClose, title, children }) {
  const [drag, setDrag] = useState(0);
  const [mounted, setMounted] = useState(open);
  const [show, setShow] = useState(false);
  const y0 = useRef(null);

  useEffect(() => {
    if (open) { setMounted(true); const id = requestAnimationFrame(() => setShow(true)); return () => cancelAnimationFrame(id); }
    setShow(false); const t = setTimeout(() => setMounted(false), 260); return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [open, onClose]);

  if (!mounted) return null;
  const down = (e) => { y0.current = e.clientY; e.currentTarget.setPointerCapture && e.currentTarget.setPointerCapture(e.pointerId); };
  const move = (e) => { if (y0.current != null) setDrag(Math.max(0, e.clientY - y0.current)); };
  const up = () => { const d = drag; y0.current = null; setDrag(0); if (d > 90) { haptic(6); onClose(); } };

  return createPortal(
    <div className={'ua-sheet-ov' + (show ? ' show' : '')} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ua-sheet2" role="dialog" aria-modal="true" aria-label={title} style={{ transform: show ? `translateY(${drag}px)` : undefined, transition: y0.current != null ? 'none' : undefined }}>
        <div className="ua-grab" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}><i /></div>
        {title && <h3 className="ua-sheet-t">{title}</h3>}
        <div className="ua-sheet-b">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
