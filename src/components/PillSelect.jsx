import { useEffect, useRef, useState } from 'react';
import PageStyle from './PageStyle';

const css = `
  .pill-sel{position:relative; display:inline-block;}
  .pill-sel-btn{
    display:flex; align-items:center; gap:8px; height:38px; padding:0 12px 0 11px; max-width:100%;
    background:var(--bg-3); border:1px solid var(--line); border-radius:999px;
    color:var(--text); font:600 12.5px/1 'Inter', sans-serif; letter-spacing:.04em; cursor:pointer;
    transition:border-color .15s ease, background .15s ease, color .15s ease;
  }
  .pill-sel-btn:hover, .pill-sel.open .pill-sel-btn{border-color:color-mix(in srgb, var(--gold) 45%, var(--line));}
  .pill-sel-btn:focus-visible{outline:2px solid var(--gold-bright); outline-offset:2px;}
  .pill-sel-btn:disabled{opacity:.6; cursor:default;}
  .pill-sel-btn .pill-ico{width:15px; height:15px; color:var(--gold-bright); flex-shrink:0;}
  .pill-sel-btn .pill-cur{overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:160px;}
  .pill-sel-btn .pill-chev{width:12px; height:12px; color:var(--text-muted); flex-shrink:0; transition:transform .18s ease;}
  .pill-sel.open .pill-sel-btn .pill-chev{transform:rotate(180deg);}

  .pill-sel-menu{
    position:absolute; top:calc(100% + 8px); right:0; min-width:188px; max-height:320px; overflow-y:auto; padding:6px; z-index:60;
    background:var(--bg-2); border:1px solid var(--line); border-radius:12px;
    box-shadow:0 12px 32px rgba(0,0,0,0.35);
    opacity:0; transform:translateY(-4px); pointer-events:none; visibility:hidden;
    transition:opacity .15s ease, transform .15s ease, visibility .15s;
  }
  .pill-sel.open .pill-sel-menu{opacity:1; transform:none; pointer-events:auto; visibility:visible;}
  .pill-sel.align-left .pill-sel-menu{right:auto; left:0;}
  html[data-theme="light"] .pill-sel-menu{box-shadow:0 12px 28px rgba(30,26,18,0.14);}
  .pill-sel-opt{
    display:flex; align-items:center; gap:10px; width:100%; padding:9px 10px; border:none; border-radius:8px;
    background:none; color:var(--text); font:500 13.5px 'Inter', sans-serif; text-align:start; cursor:pointer;
    transition:background .12s ease;
  }
  .pill-sel-opt:hover, .pill-sel-opt:focus-visible{background:var(--gold-dim); outline:none;}
  .pill-sel-opt .pill-code{
    width:30px; flex-shrink:0; text-align:center; padding:3px 0; border-radius:6px;
    background:var(--bg-3); border:1px solid var(--line); color:var(--text-muted);
    font-size:10.5px; font-weight:700; letter-spacing:.06em;
  }
  .pill-sel-opt .pill-name{flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
  .pill-sel-opt .pill-tick{width:15px; height:15px; color:var(--gold-bright); opacity:0; flex-shrink:0;}
  .pill-sel-opt.active{color:var(--gold-bright);}
  .pill-sel-opt.active .pill-code{background:var(--gold-dim); border-color:color-mix(in srgb, var(--gold) 35%, var(--line)); color:var(--gold-bright);}
  .pill-sel-opt.active .pill-tick{opacity:1;}
  .pill-sel-empty{padding:9px 10px; color:var(--text-muted); font:500 13px 'Inter', sans-serif;}
  html[dir="rtl"] .pill-sel-menu{right:auto; left:0;}
  html[dir="rtl"] .pill-sel.align-left .pill-sel-menu{left:auto; right:0;}
  @media (max-width:520px){
    .pill-sel.hide-cur-mobile .pill-sel-btn .pill-cur{display:none;}
    .pill-sel.hide-cur-mobile .pill-sel-btn{padding:0 10px;}
    .pill-sel-btn .pill-cur{max-width:96px;}
  }
`;

export const GLOBE_ICON = (
  <svg className="pill-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />
  </svg>
);
export const GROUP_ICON = (
  <svg className="pill-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="8" r="3.2" /><path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /><path d="M16 5.2a3 3 0 010 5.6M17.5 13.8c2 .6 3.5 2.3 3.5 5.2" />
  </svg>
);

/**
 * Shared pill dropdown (the one used for the language picker everywhere).
 * options: [{ value, label, code? }]  — `code` shows the small badge (EN / UZ …).
 * showCode: show the selected value's code in the button instead of its label.
 */
export default function PillSelect({
  options, value, onChange, icon = GLOBE_ICON, ariaLabel, placeholder = '',
  showCode = false, hideCurOnMobile = false, alignLeft = false, disabled = false, emptyText = '', id, className = '', style,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = options.find((o) => String(o.value) === String(value));
  const curText = current ? (showCode && current.code ? current.code : current.label) : placeholder;
  const hasCodes = options.some((o) => o.code);

  return (
    <div className={'pill-sel' + (open ? ' open' : '') + (alignLeft ? ' align-left' : '') + (hideCurOnMobile ? ' hide-cur-mobile' : '') + (className ? ' ' + className : '')}
         ref={ref} id={id} style={style}>
      <PageStyle css={css} />
      <button type="button" className="pill-sel-btn" aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel}
              disabled={disabled} onClick={() => setOpen((o) => !o)}>
        {icon}
        <span className="pill-cur">{curText}</span>
        <svg className="pill-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      <div className="pill-sel-menu" role="listbox">
        {options.length === 0 && <div className="pill-sel-empty">{emptyText}</div>}
        {options.map((o) => {
          const active = String(o.value) === String(value);
          return (
            <button type="button" key={o.value} role="option" aria-selected={active}
                    className={'pill-sel-opt' + (active ? ' active' : '')}
                    onClick={() => { setOpen(false); if (!active) onChange(o.value); }}>
              {hasCodes && <span className="pill-code">{o.code || ''}</span>}
              <span className="pill-name">{o.label}</span>
              <svg className="pill-tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
            </button>
          );
        })}
      </div>
    </div>
  );
}
