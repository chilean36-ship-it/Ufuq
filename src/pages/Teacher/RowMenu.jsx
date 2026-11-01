import { useEffect, useRef, useState } from 'react';

/** Small "⋯" menu for the secondary actions of a row (closes on outside click / Escape). items: [{ key, label, onClick, danger?, disabled?, title? }] */
export default function RowMenu({ items, label, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  const shown = (items || []).filter(Boolean);
  if (shown.length === 0) return null;
  return (
    <div className="er-menu" ref={ref}>
      <button type="button" className="er-dots" aria-haspopup="menu" aria-expanded={open} aria-label={label} title={label} disabled={disabled} onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
      </button>
      {open && (
        <div className="er-pop" role="menu">
          {shown.map((it) => (
            <button key={it.key} type="button" role="menuitem" className={'er-item' + (it.danger ? ' danger' : '')} disabled={it.disabled} title={it.title}
                    onClick={() => { setOpen(false); it.onClick(); }}>{it.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
