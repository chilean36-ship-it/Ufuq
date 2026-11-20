import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Small "⋯" menu for the secondary actions of a row (closes on outside click / Escape / scroll).
 * The list is drawn on <body> at a fixed position worked out from the button, so it never runs off the screen or gets clipped by a scrolling window.
 * items: [{ key, label, onClick, danger?, disabled?, title? }]
 */
export default function RowMenu({ items, label, disabled }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btn = useRef(null);
  const pop = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if ((btn.current && btn.current.contains(e.target)) || (pop.current && pop.current.contains(e.target))) return;
      setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const close = () => setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  // place the list: right edge under the button, flipped upwards when there is no room below, always inside the screen
  useLayoutEffect(() => {
    if (!open || !btn.current || !pop.current) return;
    const r = btn.current.getBoundingClientRect();
    const w = pop.current.offsetWidth; const h = pop.current.offsetHeight;
    const vw = window.innerWidth; const vh = window.innerHeight; const gap = 6; const edge = 8;
    const rtl = document.documentElement.dir === 'rtl';
    let left = rtl ? r.left : r.right - w;
    left = Math.max(edge, Math.min(left, vw - w - edge));
    let top = r.bottom + gap;
    if (top + h > vh - edge) top = r.top - gap - h >= edge ? r.top - gap - h : Math.max(edge, vh - h - edge);
    setPos({ left, top });
  }, [open]);

  const shown = (items || []).filter(Boolean);
  if (shown.length === 0) return null;
  return (
    <div className="er-menu">
      <button type="button" ref={btn} className="er-dots" aria-haspopup="menu" aria-expanded={open} aria-label={label} title={label} disabled={disabled} onClick={() => { setPos(null); setOpen((o) => !o); }}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
      </button>
      {open && createPortal(
        <div className="er-pop" role="menu" ref={pop} style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: 'hidden' }}>
          {shown.map((it) => (
            <button key={it.key} type="button" role="menuitem" className={'er-item' + (it.danger ? ' danger' : '')} disabled={it.disabled} title={it.title}
                    onClick={() => { setOpen(false); it.onClick(); }}>{it.label}</button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
