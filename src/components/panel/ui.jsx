import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCabinetI18n } from '../../context/CabinetI18nContext';
import { lockScroll, unlockScroll } from '../../lib/scrollLock';

/* ------------------------------------------------------------------ icons -- */
const SVG = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
export const EditIcon = () => (<svg {...SVG}><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>);
export const TrashIcon = () => (<svg {...SVG}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" /></svg>);
export const CalendarIcon = () => (<svg {...SVG}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>);
export const MenuIcon = () => (<svg {...SVG}><path d="M3 6h18M3 12h18M3 18h18" /></svg>);
export const BackIcon = () => (<svg {...SVG}><path d="M19 12H5M12 19l-7-7 7-7" /></svg>);
export const SignOutIcon = () => (<svg {...SVG}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>);
export const TeacherRoleIcon = () => (<svg {...SVG}><path d="M12 7c-1.5-1.5-4-2-8-1.5v13c4-.5 6.5 0 8 1.5 1.5-1.5 4-2 8-1.5v-13c-4-.5-6.5 0-8 1.5Z" /><path d="M12 7v13" /></svg>);
export const AdminRoleIcon = () => (<svg {...SVG}><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></svg>);
export const ProfileNavIcon = () => (<svg {...SVG}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" /></svg>);

/* ------------------------------------------------------------------ modal -- */
/**
 * `<div class="overlay [open]">` + `.modal`. Always mounted (the CSS fades it in/out through the `open` class);
 * a click on the dark backdrop or on the × closes it, exactly like the original data-close / overlay handlers.
 */
/* Dialogs that are open right now, bottom = the one the user is looking at. Only the top one reacts to Escape / Tab. */
const modalStack = [];
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const visibleFocusables = (root) => [...root.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);

export function Modal({ open, onClose, wide, style, id, showClose = true, children, label }) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const token = useRef({});
  const pressedOnBackdrop = useRef(false);

  useEffect(() => {
    if (!open) return undefined;
    const me = token.current;
    const root = dialogRef.current;
    modalStack.push(me);
    lockScroll();
    const returnTo = document.activeElement;

    const onKey = (e) => {
      if (modalStack[modalStack.length - 1] !== me || !root) return; // only the top dialog responds
      if (e.key === 'Escape') { onCloseRef.current(); return; }
      if (e.key !== 'Tab') return;
      const els = visibleFocusables(root);
      if (!els.length) { e.preventDefault(); return; }
      const first = els[0];
      const last = els[els.length - 1];
      const active = document.activeElement;
      const outside = !root.contains(active);
      if (e.shiftKey && (active === first || outside)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (active === last || outside)) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);

    // Put the cursor where it is needed: the first real control, not the × button; the dialog itself if there is none.
    const raf = requestAnimationFrame(() => {
      if (!root) return;
      const target = visibleFocusables(root).find((el) => !el.classList.contains('modal-close')) || root;
      target.focus({ preventScroll: true });
    });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      const i = modalStack.lastIndexOf(me);
      if (i !== -1) modalStack.splice(i, 1);
      unlockScroll();
      if (returnTo && returnTo.focus && document.contains(returnTo)) returnTo.focus({ preventScroll: true });
    };
  }, [open]);

  // Rendered on <body>, not inside the page: pages animate their transform, and a transformed ancestor
  // would turn this fixed overlay into a box the size of the page (the dialog then opens half off-screen).
  const node = (
    <div className={'overlay' + (open ? ' open' : '')} id={id} onPointerDown={(e) => { pressedOnBackdrop.current = e.target === e.currentTarget; }}
         onClick={(e) => { if (e.target === e.currentTarget && pressedOnBackdrop.current) onClose(); }} {...(open ? {} : { inert: '' })}>
      <div ref={dialogRef} className={'modal' + (wide ? ' wide' : '')} style={style} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        {showClose && <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>&times;</button>}
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
  return typeof document !== 'undefined' ? createPortal(node, document.body) : node;
}

/** "Are you sure?" dialog driven by `state = { open, title, msg, cb }`. */
export function ConfirmModal({ state, onClose }) {
  const { t } = useCabinetI18n();
  return (
    <Modal open={state.open} onClose={onClose} showClose={false} id="confirmOverlay" style={{ maxWidth: 420 }} label={state.title || t('Are you sure?')}>
      <h3 id="confirmTitle">{state.title || t('Are you sure?')}</h3>
      <p className="hint" id="confirmMsg" style={{ fontSize: 14, color: 'var(--text)' }}>{state.msg}</p>
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>{t('Cancel')}</button>
        <button type="button" className="btn btn-danger" id="confirmYesBtn"
                onClick={async () => { const cb = state.cb; onClose(); if (cb) await cb(); }}>{t('Yes, delete')}</button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ toast -- */
export function Toasts({ items }) {
  return (
    <div className="toast-wrap" id="toastWrap">
      {items.map((x) => <div key={x.id} className={'toast' + (x.type === 'err' ? ' err' : x.type === 'ok' ? ' ok' : '')}>{x.msg}</div>)}
    </div>
  );
}

/** `const [items, toast] = useToasts()` — toast(msg, 'ok'|'err') shows a message for 4.2 s. */
export function useToasts() {
  const [items, setItems] = useState([]);
  const seq = useRef(0);
  const timers = useRef(new Set());
  const toast = useCallback((msg, type) => {
    const id = ++seq.current;
    setItems((cur) => [...cur, { id, msg, type }]);
    const tm = setTimeout(() => { timers.current.delete(tm); setItems((cur) => cur.filter((x) => x.id !== id)); }, 4200);
    timers.current.add(tm);
  }, []);
  useEffect(() => { const set = timers.current; return () => { set.forEach(clearTimeout); }; }, []);
  return [items, toast];
}

/** `const [confirm, askConfirm, closeConfirm] = useConfirm()` */
export function useConfirm() {
  const [state, setState] = useState({ open: false, title: '', msg: '', cb: null });
  const ask = useCallback((title, msg, cb) => setState({ open: true, title, msg, cb }), []);
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);
  return [state, ask, close];
}

/* -------------------------------------------------------------- small bits -- */
export function EmptyRow({ cols, children }) {
  return <tr className="empty-row"><td colSpan={cols}>{children}</td></tr>;
}

/** `.switch` toggle (the round on/off pill used for "active", "global audio", attendance …). */
export function Switch({ on, onClick, id }) {
  return <span className={'switch' + (on ? ' on' : '')} id={id} onClick={onClick}><span className="dot"></span></span>;
}

export function useIsMobile(maxWidth = 860) {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= maxWidth);
  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth <= maxWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [maxWidth]);
  return mobile;
}
