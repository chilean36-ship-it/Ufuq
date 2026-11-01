import { useCallback, useEffect, useRef, useState } from 'react';
import PageStyle from '../PageStyle';

const css = `
  .pm{position:relative; display:inline-block; flex-shrink:0;}
  .pm .top-profile{font:inherit; color:inherit; text-align:start; cursor:pointer; appearance:none; -webkit-appearance:none;}
  .pm .top-profile:focus-visible{outline:2px solid var(--gold-bright); outline-offset:2px;}
  .pm .pm-chev{width:13px; height:13px; flex-shrink:0; color:var(--text-muted); transition:transform .18s ease, color .15s ease;}
  .pm.open .pm-chev{transform:rotate(180deg); color:var(--gold-bright);}
  .pm.open .top-profile{border-color:color-mix(in srgb, var(--gold) 45%, var(--line));}

  .pm-menu{
    position:absolute; top:calc(100% + 8px); right:0; min-width:230px; padding:6px; z-index:60;
    background:var(--bg-2); border:1px solid var(--line); border-radius:12px;
    box-shadow:0 12px 32px rgba(0,0,0,0.35);
    opacity:0; transform:translateY(-4px); pointer-events:none; visibility:hidden;
    transition:opacity .15s ease, transform .15s ease, visibility .15s;
  }
  .pm.open .pm-menu{opacity:1; transform:none; pointer-events:auto; visibility:visible;}
  html[data-theme="light"] .pm-menu{box-shadow:0 12px 28px rgba(30,26,18,0.14);}
  html[dir="rtl"] .pm-menu{right:auto; left:0;}
  .pm-head{padding:8px 10px 9px; border-bottom:1px solid var(--line); margin-bottom:6px; min-width:0;}
  .pm-head b{display:block; font:600 13px 'Inter', sans-serif; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
  .pm-head span{display:block; margin-top:2px; font:500 11.5px 'Inter', sans-serif; color:var(--text-muted);}
  .pm-sep{height:1px; background:var(--line); margin:6px 4px;}
  .pm-item{
    display:flex; align-items:center; gap:10px; width:100%; padding:9px 10px; border:none; border-radius:8px;
    background:none; color:var(--text); font:500 13.5px 'Inter', sans-serif; text-align:start; cursor:pointer;
    transition:background .12s ease, color .12s ease;
  }
  .pm-item:hover, .pm-item:focus-visible{background:var(--gold-dim); outline:none;}
  .pm-item svg{width:16px; height:16px; flex-shrink:0; color:var(--gold-bright);}
  .pm-item span{flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
  .pm-item:disabled{opacity:.6; cursor:default;}
  @media (max-width:860px){ .pm .pm-chev{display:none;} }
  @media (max-width:520px){ .pm-menu{min-width:210px; max-width:calc(100vw - 24px);} }
`;

const SVG = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
export const SwitchPanelIcon = () => (
  <svg {...SVG}><path d="M7 4 3 8l4 4" /><path d="M3 8h14a4 4 0 0 1 4 4" /><path d="m17 20 4-4-4-4" /><path d="M21 16H7a4 4 0 0 1-4-4" /></svg>
);
const ProfileIcon = () => (<svg {...SVG}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" /></svg>);

/**
 * Top-bar profile chip that opens a dropdown (avatar + name + role badge).
 *   avatarUrl / initial / name / roleIcon / roleLabel — what the chip shows
 *   onOpenProfile                                      — "Profile" entry (opens the Profile section)
 *   switchItem                                         — { label, onSelect } or null. Rendered ONLY when given,
 *                                                        so a caller that is not allowed to switch simply passes null
 *                                                        and no button exists in the DOM.
 */
export default function ProfileMenu({ avatarUrl, initial, name, roleIcon, roleLabel, profileLabel, chipTitle, onOpenProfile, switchItem }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  const close = useCallback((refocus) => { setOpen(false); if (refocus && btnRef.current) btnRef.current.focus(); }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(true); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  const focusItem = (dir) => {
    const items = menuRef.current ? Array.from(menuRef.current.querySelectorAll('.pm-item:not(:disabled)')) : [];
    if (!items.length) return;
    const i = items.indexOf(document.activeElement);
    items[(i + dir + items.length) % items.length].focus();
  };
  const onTriggerKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setTimeout(() => focusItem(1), 0); }
  };
  const onMenuKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); focusItem(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusItem(-1); }
    else if (e.key === 'Tab') setOpen(false);
  };

  return (
    <div className={'pm' + (open ? ' open' : '')} ref={ref}>
      <PageStyle css={css} />
      <button type="button" ref={btnRef} className="top-profile" aria-haspopup="menu" aria-expanded={open}
              title={chipTitle} onClick={() => setOpen((o) => !o)} onKeyDown={onTriggerKey}>
        <span className="top-avatar">
          {avatarUrl
            ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
            : initial}
        </span>
        <span className="top-user-info">
          <span className="top-username">{name}</span>
          <span className="top-role">{roleIcon} {roleLabel}</span>
        </span>
        <svg className="pm-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
      </button>

      <div className="pm-menu" role="menu" ref={menuRef} onKeyDown={onMenuKey} aria-hidden={!open}>
        <div className="pm-head"><b>{name}</b><span>{roleLabel}</span></div>
        <button type="button" role="menuitem" className="pm-item" tabIndex={open ? 0 : -1}
                onClick={() => { close(false); if (onOpenProfile) onOpenProfile(); }}>
          <ProfileIcon /><span>{profileLabel}</span>
        </button>
        {switchItem && (
          <>
            <div className="pm-sep" role="separator" />
            <button type="button" role="menuitem" className="pm-item pm-switch" tabIndex={open ? 0 : -1}
                    onClick={() => { close(false); switchItem.onSelect(); }}>
              <SwitchPanelIcon /><span>{switchItem.label}</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
