import { useEffect, useMemo, useRef, useState } from 'react';

/** Ctrl/⌘+K page switcher shared by the teacher and admin panels. `items` = [{ page, label, icon }]. */
export default function CommandPalette({ open, onClose, items, onPick, placeholder, emptyText }) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef(null);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? items.filter((i) => i.label.toLowerCase().includes(s)) : items;
  }, [items, q]);

  useEffect(() => { if (open) { setQ(''); setIdx(0); setTimeout(() => inputRef.current && inputRef.current.focus(), 30); } }, [open]);
  useEffect(() => { setIdx(0); }, [q]);
  if (!open) return null;

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(filtered.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter' && filtered[idx]) { e.preventDefault(); onPick(filtered[idx].page); onClose(); }
  }

  return (
    <div className="cmd-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cmd" role="dialog" aria-modal="true">
        <input ref={inputRef} type="text" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder={placeholder} aria-label={placeholder} />
        <div className="cmd-list">
          {filtered.length === 0 ? <div className="cmd-empty">{emptyText}</div> : filtered.map((i, n) => (
            <button type="button" key={i.page} className={'cmd-item' + (n === idx ? ' on' : '')} onMouseEnter={() => setIdx(n)}
                    onClick={() => { onPick(i.page); onClose(); }}>
              {i.icon}<span>{i.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
