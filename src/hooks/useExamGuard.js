import { useCallback, useEffect, useRef, useState } from 'react';
import { createExamGuard, GUARD_DEFAULTS } from '../lib/examGuardCore';

/*
 * Exam integrity guard (hook). The rules live in lib/examGuardCore.js; this file only connects browser events
 * to that state machine. Summary: leaving the exam = warning 1 at once; still away after 20 s = warning 2;
 * still away after 40 s = warning 3 and the exam is submitted. The 3rd warning in total also submits the exam.
 * Technical interruptions (no internet) are logged as tech_* and are not counted.
 *
 * This is a deterrent, not a lock: every departure is recorded (`onViolation`) and shown to the teacher.
 */
export const RETURN_WINDOW_MS = GUARD_DEFAULTS.returnWindowMs;
export const MAX_WARNINGS = GUARD_DEFAULTS.maxWarnings;
export const TECH_MAX_MS = GUARD_DEFAULTS.techMaxMs;
export const MAX_FREE_INTERRUPTIONS = GUARD_DEFAULTS.maxFreeInterruptions;

const TICK_MS = 250;
const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
const UA = typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '';
const IS_IPAD = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1 && /Macintosh/.test(UA);
// Phones and tablets: departures are detected by page visibility, pagehide and Back only. Window focus is not used
// there, because mobile browsers fire focus/blur for things that are not leaving the exam.
const IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(UA) || IS_IPAD;
/** True on phones and tablets (the exam does not use full screen there). */
export const GUARD_IS_MOBILE = IS_MOBILE;
const HAS_FS = typeof document !== 'undefined' && !!document.documentElement
  && typeof document.documentElement.requestFullscreen === 'function';

export default function useExamGuard({ active, onViolation, onLimit, wantFullscreen = true }) {
  const [violations, setViolations] = useState(0);   // counted departures in this exam
  const [warnings, setWarnings] = useState(0);       // warnings issued in this exam
  const [warning, setWarning] = useState(null);      // overlay content while it is shown
  const cbRef = useRef({ onViolation, onLimit });
  cbRef.current = { onViolation, onLimit };
  // Full screen is required only after the student has actually entered it once. If the browser refuses it
  // (no user gesture, unsupported), leaving full screen cannot be a departure, so it is not enforced.
  const fsOkRef = useRef(false);
  const ctlRef = useRef(null);

  const dismiss = useCallback(() => {
    setWarning((w) => (w && w.final ? w : null));
    if (ctlRef.current) ctlRef.current.interact();
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    const fsWanted = wantFullscreen && HAS_FS && !IS_MOBILE;
    const flags = { focused: true, navLeft: false };

    const emit = (ev) => {
      if (ev.type === 'violation') {
        if (!ev.tech) setViolations(ev.count);
        if (cbRef.current.onViolation) cbRef.current.onViolation(ev.kind, ev.count);
      } else if (ev.type === 'warning') {
        setWarnings(ev.warned);
        setWarning(ev.warning);
      } else if (ev.type === 'notice' || ev.type === 'back') {
        setWarning(ev.warning);
      } else if (ev.type === 'submit') {
        setWarning(ev.warning);
        if (cbRef.current.onLimit) cbRef.current.onLimit(ev.warned);
      }
    };

    const guard = createExamGuard(emit);

    const reasonAway = () => {
      if (document.hidden || document.visibilityState === 'hidden') return 'tab';
      if (flags.navLeft) return 'leave';
      if (!IS_MOBILE && !flags.focused) return 'blur';
      if (fsWanted && fsOkRef.current && !document.fullscreenElement) return 'fullscreen';
      return '';
    };
    const sync = () => guard.update(reasonAway(), isOffline(), Date.now());

    // The student touched the page: they are here. Re-enter full screen if needed (a tap is a user gesture).
    const interact = () => {
      if (document.hidden) return;
      flags.focused = true;
      flags.navLeft = false;
      if (guard.isAway() && fsWanted && !document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
      sync();
    };
    ctlRef.current = { interact };

    const isField = (el) => !!el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type === 'text'));
    const stop = (e) => { if (e.type === 'selectstart' && isField(e.target)) return; e.preventDefault(); };
    const stopInput = (e) => {
      const it = e.inputType || '';
      if (it === 'insertFromPaste' || it === 'insertFromDrop' || it === 'insertFromYank' || it === 'deleteByCut' || it === 'insertFromPasteAsQuotation') e.preventDefault();
    };
    const onKey = (e) => {
      const k = (e.key || '').toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      const devtools = k === 'f12' || (mod && e.shiftKey && ['i', 'j', 'c'].includes(k));
      if (devtools || (mod && ['c', 'x', 'v', 'a', 'p', 's', 'u', 'f'].includes(k)) || k === 'printscreen') {
        e.preventDefault();
        if (k === 'printscreen' && navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText('').catch(() => {});
      }
    };
    const onBlur = () => { flags.focused = false; sync(); };
    const onFocus = () => { flags.focused = true; sync(); };
    const onFs = () => {
      if (document.fullscreenElement) fsOkRef.current = true;
      sync();
    };
    // Browser or phone Back would leave the exam: keep the student here and count it as a departure.
    const onPop = () => {
      try { window.history.pushState({ examGuard: 1 }, '', window.location.href); } catch (e) { /* ignore */ }
      flags.navLeft = true;
      sync();
    };
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    const onPointer = () => interact();

    ['copy', 'cut', 'paste', 'dragstart', 'drop', 'contextmenu', 'selectstart'].forEach((ev) => document.addEventListener(ev, stop, true));
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('beforeinput', stopInput, true);
    document.addEventListener('keydown', onPointer, true);
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('touchstart', onPointer, { capture: true, passive: true });
    try { window.history.pushState({ examGuard: 1 }, '', window.location.href); } catch (e) { /* ignore */ }
    window.addEventListener('popstate', onPop);
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('pagehide', sync);
    window.addEventListener('pageshow', sync);
    document.addEventListener('fullscreenchange', onFs);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    window.addEventListener('beforeunload', onBeforeUnload);
    document.body.classList.add('exam-guard-on');
    if (fsWanted && !document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    const timer = setInterval(sync, TICK_MS);

    return () => {
      clearInterval(timer);
      ctlRef.current = null;
      ['copy', 'cut', 'paste', 'dragstart', 'drop', 'contextmenu', 'selectstart'].forEach((ev) => document.removeEventListener(ev, stop, true));
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('beforeinput', stopInput, true);
      document.removeEventListener('keydown', onPointer, true);
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('touchstart', onPointer, true);
      window.removeEventListener('popstate', onPop);
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('pagehide', sync);
      window.removeEventListener('pageshow', sync);
      document.removeEventListener('fullscreenchange', onFs);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.body.classList.remove('exam-guard-on');
      setWarning(null);
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    };
  }, [active, wantFullscreen]);

  return { violations, warnings, warning, dismiss, maxWarnings: MAX_WARNINGS };
}

/** Warning overlay styles (rendered by the runners through ExamGuardOverlay). */
export const GUARD_CSS = `
body.exam-guard-on, body.exam-guard-on *{ -webkit-user-select:none; user-select:none; -webkit-touch-callout:none; }
body.exam-guard-on textarea, body.exam-guard-on input[type="text"]{ -webkit-user-select:text; user-select:text; }
.exam-guard-overlay{ max-width:none !important; position:fixed; inset:0; z-index:100000; background:rgba(8,10,10,.88); backdrop-filter:blur(6px); display:flex; align-items:center; justify-content:center; padding:20px; }
.exam-guard-box{ max-width:440px; width:100%; background:#1B2427; color:#EDEAE3; border:1px solid rgba(229,120,100,.5); border-radius:18px; padding:26px; text-align:center; box-shadow:0 30px 80px rgba(0,0,0,.6); }
.exam-guard-box h3{ margin:0 0 8px; font-size:20px; color:#F0A592; }
.exam-guard-box p{ margin:0 0 16px; color:#B9B3AA; font-size:14.5px; line-height:1.55; }
.exam-guard-box b{ color:#fff; }
.exam-guard-box button{ border:0; border-radius:11px; padding:11px 22px; background:#C9A24B; color:#1A1405; font-weight:700; font-size:14px; cursor:pointer; }
.exam-guard-badge{ display:inline-flex; align-items:center; gap:6px; padding:5px 10px; border-radius:99px; font-size:12px; font-weight:700; background:rgba(229,120,100,.16); color:#F0A592; }
`;
