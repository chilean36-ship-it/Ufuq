import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCabinetI18n } from '../../../context/CabinetI18nContext';
import { surahLabel, SURAH_NAMES } from '../../../lib/surahNames';
import { startLiveStt, liveSttSupported } from '../../../lib/liveStt';
import { serverListen } from '../../../lib/serverStt';
import { supabase } from '../../../lib/supabaseClient';
import { flattenPage, createLiveSession, splitWords } from '../../../lib/hifzLive';
import { PAGE_COUNT, PAGE_STARTS, SURAH_AYAHS, JUZ_STARTS, pageOf, pageSegments, juzOf } from '../../../lib/mushafPages';
import './hifz.css';

const PREF_KEY = 'ufuq-hifz-live';
const TURN_DELAY = 650; // ms the finished page stays on screen before the next one turns in
const surahCache = new Map();

const inflight = new Map();
function loadSurah(n) {
  if (surahCache.has(n)) return Promise.resolve(surahCache.get(n));
  if (inflight.has(n)) return inflight.get(n);
  const pr = fetch(`/quran/${n}.json`).then((r) => {
    if (!r.ok) throw new Error(`quran data ${n}: HTTP ${r.status}`);
    return r.json();
  }).then((d) => { surahCache.set(n, d); inflight.delete(n); return d; }, (e) => { inflight.delete(n); throw e; });
  inflight.set(n, pr);
  return pr;
}

// The cabinet scrolls inside `.main` on desktop and in the window on phones; scrollIntoView() would also move every ancestor, so scroll by hand.
function scrollTarget() {
  const main = document.querySelector('.main');
  return main && main.scrollHeight > main.clientHeight + 2 && getComputedStyle(main).overflowY !== 'visible' ? main : null;
}
function scrollElTo(el, topOffset, center, dockH) {
  const sc = scrollTarget();
  const r = el.getBoundingClientRect();
  const base = sc ? sc.getBoundingClientRect().top : 0;
  const viewH = sc ? sc.clientHeight : window.innerHeight;
  const cur = sc ? sc.scrollTop : window.scrollY;
  const y = r.top - base + cur;
  const top = center ? y - topOffset - (viewH - topOffset - dockH - r.height) / 2 : y - topOffset;
  (sc || window).scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

function readPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
    let page = +p.page;
    if (!(page >= 1 && page <= PAGE_COUNT)) page = +p.surah >= 1 && +p.surah <= 114 ? pageOf(+p.surah, 1) : PAGE_COUNT; // older saved choice: surah → its first page
    return { page: Math.floor(page), hide: p.hide !== false, auto: p.auto !== false, fs: Math.min(1.4, Math.max(0.8, +p.fs || 1)) };
  } catch (e) { return { page: PAGE_COUNT, hide: true, auto: true, fs: 1 }; }
}
const arDigits = (n) => { try { return Number(n).toLocaleString('ar-EG', { useGrouping: false }); } catch (e) { return String(n); } };

const Ic = ({ children, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const IcMic = () => <Ic size={26}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" /></Ic>;
const IcStop = () => <Ic size={24}><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" /></Ic>;
const IcBulb = () => <Ic><path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z" /></Ic>;
const IcRestart = () => <Ic><path d="M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8" /><path d="M3 3v5h5" /></Ic>;
const IcPrev = () => <Ic><path d="M15 18l-6-6 6-6" /></Ic>;
const IcNext = () => <Ic><path d="M9 18l6-6-6-6" /></Ic>;
// Words are memoised: an update repaints only the words whose state changed, not the whole page. Clicks are handled by the page (data-k / data-m).
const Word = memo(function Word({ k, text, cls, title, hidden }) {
  return <span data-k={k} className={cls} title={title} aria-hidden={hidden || undefined}>{text}</span>;
});
const Marker = memo(function Marker({ surah, ayah, label }) {
  return <span data-m={`${surah}:${ayah}`} className="hl-marker" role="img" aria-label={label}>{'\uFD3F'}{arDigits(ayah)}{'\uFD3E'}</span>;
});
const IcEye = () => <Ic><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Ic>;
const IcEyeOff = () => <Ic><path d="M3 3l18 18M10.6 5.1A9.7 9.7 0 0112 5c6.4 0 10 7 10 7a17 17 0 01-3.2 4M6.5 6.6A17 17 0 002 12s3.6 7 10 7a9.6 9.6 0 004.2-1" /><path d="M9.9 9.9a3 3 0 004.2 4.2" /></Ic>;
const IcGear = () => <Ic><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></Ic>;
const IcChev = () => <Ic size={16}><path d="M6 9l6 6 6-6" /></Ic>;
const IcSearch = () => <Ic size={18}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></Ic>;
const IcX = () => <Ic size={18}><path d="M6 6l12 12M18 6L6 18" /></Ic>;
const IcSpark = () => <Ic><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" /></Ic>;
const IcCheck = () => <Ic size={18}><path d="M5 12.5l4.5 4.5L19 7.5" /></Ic>;

/**
 * My Learning → Hifz Mushaf (individual groups only).  A real page of the Madina mushaf (1–604, see src/lib/mushafPages.js)
 * where the student recites from memory (or reads) and the words appear live as the recogniser hears them correctly —
 * in the spirit of Tarteel: continuous text (no boxes), one big microphone button, and when the last word of a page is
 * recited the next page turns in by itself while the microphone keeps listening.
 * No backend: the Qur'an text is /quran/{n}.json and recognition is the browser's own (see src/lib/liveStt.js).
 */
export default function HifzLiveView() {
  const { t, lang } = useCabinetI18n();
  const prefs0 = useRef(readPrefs()).current;
  const rootRef = useRef(null);
  const [pageNo, setPageNo] = useState(prefs0.page); // 1..604, the printed mushaf page
  const [target, setTarget] = useState(null); // { surah, ayah } chosen with the Surah / Ayah pickers: start counting there
  const [hide, setHide] = useState(prefs0.hide);
  const [auto, setAuto] = useState(prefs0.auto); // turn to the next page by itself
  const [loadTick, setLoadTick] = useState(0);
  const [loadErr, setLoadErr] = useState(false);
  const [phase, setPhase] = useState('idle'); // idle | listening
  const [snap, setSnap] = useState(null);
  const [heard, setHeard] = useState('');
  const [err, setErr] = useState('');
  const [toast, setToast] = useState(null); // { page, score } — shown briefly when a page is finished
  const [turnDir, setTurnDir] = useState(0); // 1 = forward, -1 = back: direction of the page-turn animation
  const [sheet, setSheet] = useState(null); // 'where' | 'settings' | 'ai' | null
  const [fs, setFs] = useState(prefs0.fs); // text size factor
  const [sumOpen, setSumOpen] = useState(true); // the result card above the dock
  const touchRef = useRef(null);
  const [peek, setPeek] = useState(null); // { said, expected } — tapped mistake
  const peekTimer = useRef(null);

  const sessionRef = useRef(null);
  const recRef = useRef(null);
  const latest = useRef('');      // everything the recogniser has produced since the mic was switched on
  const offsetRef = useRef(0);    // words of `latest` that belong to earlier pages (auto-turn)
  const carryRef = useRef(false); // the mic stays on across a page turn
  const timer = useRef(null);
  const pendingRef = useRef(false);
  const turnTimer = useRef(null);
  const toastTimer = useRef(null);
  const pageRef = useRef(pageNo);
  const autoRef = useRef(auto);
  pageRef.current = pageNo;
  autoRef.current = auto;

  const ERRORS = useMemo(() => ({
    'not-allowed': t('Microphone access is blocked. Allow it in the browser settings.'),
    'service-not-allowed': t('Microphone access is blocked. Allow it in the browser settings.'),
    'audio-capture': t('Microphone not found.'),
    network: t('The speech service could not be reached. Check your internet connection and try again.'),
    idle: t('The microphone turned off after a long silence. Press it to continue.'),
    unsupported: t('This browser cannot do live speech recognition. Open this page in Chrome, Edge or Safari.'),
  }), [t]);

  // ---- Qur'an data: a page may need up to three surah files (e.g. page 604). Cached pages render in the same frame. ----
  const segments = useMemo(() => pageSegments(pageNo), [pageNo]);
  const cachedBy = useMemo(() => {
    if (!segments.every((sg) => surahCache.has(sg.surah))) return null;
    const by = {}; segments.forEach((sg) => { by[sg.surah] = surahCache.get(sg.surah); });
    return by;
  }, [segments, loadTick]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let alive = true;
    setLoadErr(false);
    const warm = () => { if (pageNo < PAGE_COUNT) pageSegments(pageNo + 1).forEach((sg) => { loadSurah(sg.surah).catch(() => {}); }); };
    if (cachedBy) { warm(); return undefined; }
    Promise.all(segments.map((sg) => loadSurah(sg.surah)))
      .then(() => { if (alive) { setLoadTick((x) => x + 1); warm(); } })
      .catch(() => { if (alive) setLoadErr(true); });
    return () => { alive = false; };
  }, [pageNo, segments, cachedBy]);

  const flat = useMemo(() => (cachedBy ? flattenPage(segments, cachedBy) : null), [cachedBy, segments]);
  const pageWords = useMemo(() => (flat ? flat.words : []), [flat]);
  const headAt = useMemo(() => { const m = new Map(); if (flat) flat.heads.forEach((h) => m.set(h.at, h)); return m; }, [flat]);
  const pageNorm = useMemo(() => pageWords.map((w) => w.norm), [pageWords]);

  // what the pickers show: the page's own first ayah, or the ayah the student jumped to
  const [pageSurah, pageAyah] = PAGE_STARTS[pageNo - 1];
  const selSurah = target ? target.surah : pageSurah;
  const selAyah = target ? target.ayah : pageAyah;
  const juz = juzOf(pageNo);

  useEffect(() => { try { localStorage.setItem(PREF_KEY, JSON.stringify({ page: pageNo, hide, auto, fs })); } catch (e) { /* storage blocked */ } }, [pageNo, hide, auto, fs]);

  // ---- session control ----
  const stopRec = useCallback((hard) => {
    clearTimeout(timer.current); timer.current = null;
    clearTimeout(turnTimer.current); turnTimer.current = null;
    const r = recRef.current; recRef.current = null;
    if (r) { if (hard) r.abort(); else r.stop(); }
    if (hard) setPhase('idle');
  }, []);

  const goPage = useCallback((p, carry = false) => {
    const n = Math.max(1, Math.min(PAGE_COUNT, Math.floor(+p) || 1));
    if (carry) carryRef.current = true; else stopRec(true);
    setTurnDir(n >= pageRef.current ? 1 : -1);
    setTarget(null); setPageNo(n);
  }, [stopRec]);

  // Feed the recogniser's text (minus the words that belonged to earlier pages) to the page's session.
  const apply = useCallback((final) => {
    const ses = sessionRef.current;
    if (!ses) return;
    const all = latest.current;
    const text = offsetRef.current ? splitWords(all).slice(offsetRef.current).join(' ') : all;
    const s = ses.update(text, { final });
    setSnap(s);
    if (!s.done || !recRef.current) return;
    const here = pageRef.current;
    if (autoRef.current && here < PAGE_COUNT) {
      if (turnTimer.current) return;
      const consumed = splitWords(all).length; // everything said so far belongs to this page; what follows is the next page
      clearTimeout(toastTimer.current);
      setToast({ page: here, score: s.score });
      toastTimer.current = setTimeout(() => setToast(null), 3200);
      turnTimer.current = setTimeout(() => {
        turnTimer.current = null;
        if (!recRef.current || pageRef.current !== here) return;
        offsetRef.current = consumed;
        goPage(here + 1, true);
      }, TURN_DELAY);
    } else {
      recRef.current.stop(); // last page, or auto-turn is off: the page is finished — stop listening
    }
  }, [goPage]);

  const resetSession = useCallback(() => {
    const keep = carryRef.current; // page turned by itself: the mic and the transcript carry on
    if (!keep) { stopRec(true); latest.current = ''; offsetRef.current = 0; setHeard(''); }
    const ses = createLiveSession(pageNorm);
    sessionRef.current = ses;
    let snap0 = ses.snapshot();
    if (target && !keep) { // the student picked "surah / from ayah": the words before it are not counted
      const k = pageWords.findIndex((w) => w.surah === target.surah && w.ayah === target.ayah);
      if (k > 0) snap0 = ses.setStart(k);
    }
    setSnap(snap0); setErr('');
    if (keep && pageNorm.length) { carryRef.current = false; setTimeout(() => apply(false), 0); } // words already said during the turn
  }, [pageNorm, pageWords, target, stopRec, apply]);

  useEffect(() => { resetSession(); }, [resetSession]); // new page / jump => a fresh page
  useEffect(() => () => { stopRec(true); clearTimeout(toastTimer.current); }, [stopRec]);

  // toolbar sits under the cabinet's sticky top bar: measure it so the two never overlap
  const [barH, setBarH] = useState(64);
  useEffect(() => {
    const measure = () => { const tb = document.querySelector('.topbar, .ua-bar'); const pos = tb ? getComputedStyle(tb).position : ''; setBarH(tb && (pos === 'sticky' || pos === 'fixed') ? Math.round(tb.getBoundingClientRect().height) : 0); };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  const topOff = barH + 66; // top bar + hifz toolbar

  // bring the top of a newly opened page into view
  const firstPage = useRef(true);
  useEffect(() => {
    if (firstPage.current) { firstPage.current = false; return; }
    const el = rootRef.current && rootRef.current.querySelector('.hl-mushaf');
    if (el) scrollElTo(el, topOff - 8, false, 0);
  }, [pageNo]); // eslint-disable-line react-hooks/exhaustive-deps

  // keep the word being recited in view on long pages
  const nextIdx = snap ? snap.nextIdx : -1;
  useEffect(() => {
    if (phase !== 'listening' || !rootRef.current) return;
    const el = rootRef.current.querySelector('.hl-next');
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top < topOff + 20 || r.bottom > window.innerHeight - 170) scrollElTo(el, topOff, true, 150);
  }, [nextIdx, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // phone: keep the screen awake while listening (a dimmed screen stops the recogniser)
  useEffect(() => {
    if (phase !== 'listening' || !navigator.wakeLock) return undefined;
    let lock = null, gone = false;
    navigator.wakeLock.request('screen').then((l) => { if (gone) l.release().catch(() => {}); else lock = l; }).catch(() => {});
    return () => { gone = true; if (lock) lock.release().catch(() => {}); };
  }, [phase]);

  // reading mode of the app: the tab bar steps aside so the dock and the page own the screen
  useEffect(() => { document.body.classList.add('ua-hifz-open'); return () => document.body.classList.remove('ua-hifz-open'); }, []);
  useEffect(() => { setSumOpen(true); }, [pageNo, phase]);

  function onTouchStart(e) { const t0 = e.touches && e.touches[0]; touchRef.current = t0 ? { x: t0.clientX, y: t0.clientY } : null; }
  function onTouchEnd(e) {   // swipe to turn the page (left to right = next, like turning a mushaf page); not while reciting
    const a = touchRef.current; const t1 = e.changedTouches && e.changedTouches[0];
    touchRef.current = null;
    if (!a || !t1 || phase === 'listening') return;
    const dx = t1.clientX - a.x; const dy = t1.clientY - a.y;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) goPage(dx > 0 ? pageNo + 1 : pageNo - 1);
  }

  function start() {
    const ses = sessionRef.current;
    if (!ses || (snap && snap.done)) return;
    setErr('');
    latest.current = '';
    offsetRef.current = 0;
    setSnap(ses.resume()); // continue from the first word that has not been recited yet
    setHeard('');
    setPhase('listening');
    recRef.current = startLiveStt({
      lang: 'ar-SA',
      onText: ({ text }) => {
        latest.current = text;
        setHeard(splitWords(text).slice(-6).join(' '));
        if (!timer.current) { // leading edge: show the word now, then at most one more pass every 50 ms
          apply(false);
          timer.current = setTimeout(() => { timer.current = null; if (pendingRef.current) { pendingRef.current = false; apply(false); } }, 50);
        } else pendingRef.current = true;
      },
      onState: (s) => {
        if (s !== 'idle') return;
        clearTimeout(timer.current); timer.current = null;
        recRef.current = null;
        apply(true); // the engine has finished: settle the last words
        setPhase('idle');
      },
      onError: (code) => { setErr(ERRORS[code] || ERRORS.network); },
    });
  }
  function stop() { if (recRef.current) recRef.current.stop(); }
  // Space = microphone on/off (when no field or button has the focus)
  const toggleRef = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== 'Space' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const tg = e.target && e.target.tagName;
      if (tg === 'INPUT' || tg === 'SELECT' || tg === 'TEXTAREA' || tg === 'BUTTON' || (e.target && e.target.isContentEditable)) return;
      e.preventDefault();
      if (toggleRef.current) toggleRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  function toggleMic() { if (phase === 'listening') stop(); else start(); }

  function restart() { stopRec(true); latest.current = ''; offsetRef.current = 0; setHeard(''); resetSession(); }
  toggleRef.current = () => { const dis = phase !== 'listening' && !!(snap && snap.done); if (!dis) toggleMic(); };
  function hint() { const ses = sessionRef.current; if (ses) setSnap(ses.hint()); }
  function onWord(i) {
    const ses = sessionRef.current;
    if (!ses || !snap) return;
    if (phase === 'idle' && snap.counted === 0) { setSnap(ses.setStart(i)); return; } // choose where to start
    const st = snap.states[i];
    if ((st === 'wrong' || st === 'near') && pageWords[i]) {   // show what was heard against the right word
      clearTimeout(peekTimer.current);
      setPeek({ said: snap.heardMap && snap.heardMap[i], expected: pageWords[i].text, st });
      peekTimer.current = setTimeout(() => setPeek(null), 5000);
      return;
    }
    if (st === 'pending') setSnap(ses.hint(i)); // peek
  }
  function onMarker(surah, ayah) {
    const ses = sessionRef.current;
    if (!ses || !snap || phase !== 'idle' || snap.counted !== 0) return;
    const k = pageWords.findIndex((w) => w.surah === surah && w.ayah === ayah);
    if (k >= 0) setSnap(ses.setStart(k));
  }

  function onPageClick(e) {
    const w = e.target.closest && e.target.closest('[data-k]');
    if (w) { onWord(+w.dataset.k); return; }
    const m = e.target.closest && e.target.closest('[data-m]');
    if (m) { const [su, ay] = m.dataset.m.split(':'); onMarker(+su, +ay); }
  }

  function jumpTo(surah, ayah) { stopRec(true); setTurnDir(1); setTarget({ surah, ayah }); setPageNo(pageOf(surah, ayah)); }
  function changeSurah(n) { jumpTo(n, 1); }
  function changeAyah(n) { jumpTo(selSurah, n); }

  if (!liveSttSupported()) {
    return (
      <div className="hl-wrap">
        <div className="hifz-card"><h3>{t('Hifz Mushaf')}</h3><p className="hifz-sub">{ERRORS.unsupported}</p></div>
      </div>
    );
  }

  const states = snap ? snap.states : [];
  const counts = snap ? snap.counts : { correct: 0, near: 0, wrong: 0, missing: 0, hint: 0 };
  const started = !!snap && snap.counted > 0;
  const listening = phase === 'listening';
  const showSummary = !!snap && !listening && (snap.done || started);
  const progress = snap && pageWords.length ? Math.round((snap.counted / pageWords.length) * 100) : 0;
  const STATUS_LABEL = { correct: t('Correct'), near: t('Doubtful'), wrong: t('Wrong'), missing: t('Missed'), hint: t('Hint') };

  // the page: surah headers (with basmala) and runs of words, like the printed mushaf
  const blocks = [];
  let run = [];
  const flush = () => { if (run.length) { blocks.push(<div key={`t${blocks.length}`} className="hl-text" dir="rtl" lang="ar">{run}</div>); run = []; } };
  pageWords.forEach((w, k) => {
    const head = headAt.get(k);
    if (head) {
      flush();
      blocks.push(
        <div key={`h${head.surah}`} className="hl-surah">
          <div className="hl-surah-name"><span>{surahLabel(head.surah)}</span></div>
          {head.basmala && <div className="hl-basmala" dir="rtl" lang="ar">{head.basmala.join(' ')}</div>}
        </div>,
      );
    }
    const st = states[k] || 'pending';
    const shown = !hide || st !== 'pending';
    const cls = ['hl-w', `hl-${st}`];
    if (!shown) cls.push('hl-hidden');
    if (snap && snap.nextIdx === k && listening) cls.push('hl-next');
    if (snap && snap.startIdx === k && k > 0 && !started && !listening) cls.push('hl-start');
    run.push(
      <Word key={`w${w.i}`} k={k} text={w.text} cls={cls.join(' ')} title={shown && st !== 'pending' ? STATUS_LABEL[st] : undefined} hidden={!shown} />,
      ' ',
    );
    if (w.lastInAyah) {
      run.push(<Marker key={`m${w.surah}-${w.ayah}`} surah={w.surah} ayah={w.ayah} label={`${t('Ayah')} ${w.ayah}`} />, ' ');
    }
  });
  flush();

  return (
    <div className="hl-wrap" ref={rootRef} style={{ '--hl-top': `${barH}px`, '--hl-fs': fs }}>
      {/* ---- header: where am I (tap to change), memorise / read, settings ---- */}
      <header className="hl-bar">
        <button type="button" className="hl-title" onClick={() => setSheet('where')} aria-haspopup="dialog">
          <b dir="auto">{[...new Set(segments.map((sg) => sg.surah))].map((n) => SURAH_NAMES[n - 1]).join(' · ')}</b>
          <small>{t('Juz')} {juz} · {t('Page')} {pageNo} · {hide ? t('Memorise') : t('Read')}</small>
          <IcChev />
        </button>
        <button type="button" className="hl-ic hl-ai" onClick={() => { stopRec(true); setSheet('ai'); }} aria-label={t('AI check')} title={t('AI check')}><IcSpark /></button>
        <button type="button" className={'hl-ic' + (hide ? ' on' : '')} onClick={() => setHide((h) => !h)} aria-pressed={hide}
                aria-label={hide ? t('Show text (reading)') : t('Hide text (memorisation)')} title={hide ? t('Show text (reading)') : t('Hide text (memorisation)')}>
          {hide ? <IcEyeOff /> : <IcEye />}
        </button>
        <button type="button" className="hl-ic" onClick={() => setSheet('settings')} aria-label={t('Settings')} title={t('Settings')}><IcGear /></button>
      </header>
      <div className="hl-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><i style={{ width: `${progress}%` }} /></div>

      {loadErr && <p className="hifz-err">{t('The Qur’an text is not available yet. Tell your teacher.')}</p>}
      {!flat && !loadErr && <div className="hl-skel" aria-busy="true"><i /><i /><i /><i /><i /></div>}

      {flat && (
        <article onClick={onPageClick} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
                 className={'hl-mushaf' + (turnDir > 0 ? ' turn-fwd' : turnDir < 0 ? ' turn-back' : '')} key={pageNo}>
          <span className="hl-corner tl" aria-hidden="true" /><span className="hl-corner tr" aria-hidden="true" />
          <span className="hl-corner bl" aria-hidden="true" /><span className="hl-corner br" aria-hidden="true" />
          <div className="hl-mushaf-head">
            <span>{t('Juz')} {juz}</span>
            <span>{[...new Set(segments.map((sg) => sg.surah))].map((n) => SURAH_NAMES[n - 1]).join(' · ')}</span>
          </div>
          {blocks}
          <div className="hl-folio"><span>{arDigits(pageNo)}</span></div>
        </article>
      )}

      {flat && !listening && !started && (
        <p className="hl-tip">{t('Tap a word to start from it — the words before it are not counted. Tap a hidden word later to peek at it (counts as a hint).')}</p>
      )}

      {/* ---- bottom dock: the big microphone, hint, restart, page arrows ---- */}
      {flat && (
        <div className={'hl-dock' + (listening ? ' live' : '')}>
          {toast && <div className="hl-toast" role="status"><IcCheck /> {t('Page complete')} · {toast.page} · {toast.score}%</div>}
          {err && <p className="hl-err">{err}</p>}
          {peek && (
            <div className={'hl-peek ' + peek.st} role="status" onClick={() => setPeek(null)}>
              <span><small>{t('Correct')}</small><b dir="rtl" lang="ar">{peek.expected}</b></span>
              <span><small>{t('You said')}</small><b dir="rtl" lang="ar">{peek.said || '—'}</b></span>
            </div>
          )}
          {listening && (
            <div className="hl-live" role="status">
              <span className="hl-wave" aria-hidden="true"><i /><i /><i /><i /><i /></span>
              <span className="hl-heard" dir="rtl" lang="ar" title={t('What the microphone hears')}>{heard || t('Listening… recite now')}</span>
            </div>
          )}
          {showSummary && snap && sumOpen && (
            <div className={'hl-result' + (snap.done ? ' done' : '')} role="status">
              <button type="button" className="hl-result-x" onClick={() => setSumOpen(false)} aria-label={t('Close')}><IcX /></button>
              <div className="hl-ring" style={{ '--p': snap.score }}>
                <svg viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="34" className="bg" /><circle cx="40" cy="40" r="34" className="fg" pathLength="100" /></svg>
                <b>{snap.score}<small>%</small></b>
              </div>
              <div className="hl-result-t">
                <strong>{snap.done ? t('Page complete') : t('Stopped')}</strong>
                <div className="hl-chips">
                  <span className="hl-key hl-key-correct" title={STATUS_LABEL.correct}>{counts.correct}</span>
                  <span className="hl-key hl-key-near" title={STATUS_LABEL.near}>{counts.near}</span>
                  <span className="hl-key hl-key-wrong" title={STATUS_LABEL.wrong}>{counts.wrong}</span>
                  <span className="hl-key hl-key-missing" title={STATUS_LABEL.missing}>{counts.missing}</span>
                  <span className="hl-key hl-key-hint" title={STATUS_LABEL.hint}>{counts.hint}</span>
                </div>
                <small>{STATUS_LABEL.correct} · {STATUS_LABEL.near} · {STATUS_LABEL.wrong} · {STATUS_LABEL.missing} · {STATUS_LABEL.hint}</small>
              </div>
              <div className="hl-result-act">
                <button type="button" className="hl-btn ghost" onClick={() => { setSumOpen(false); restart(); }}>{t('Start over')}</button>
                {snap.done && pageNo < PAGE_COUNT && <button type="button" className="hl-btn" onClick={() => goPage(pageNo + 1)}>{t('Next page')}{' ›'}</button>}
              </div>
              <p className="hl-note">{t('The live check uses your browser’s speech recognition and can mishear. A doubtful word may be recognition noise — your teacher gives the final grade.')}</p>
            </div>
          )}
          <div className="hl-dock-row">
            <button type="button" className="hl-ic round" onClick={() => goPage(pageNo - 1)} disabled={pageNo <= 1} aria-label={t('Previous page')} title={t('Previous page')}><IcPrev /></button>
            <button type="button" className="hl-ic round" onClick={hint} disabled={!snap || !hide || (snap && snap.done)} aria-label={t('Hint')} title={t('Hint')}><IcBulb /></button>
            <button type="button" className={'hl-mic' + (listening ? ' on' : '')} onClick={toggleMic} disabled={!listening && !!(snap && snap.done)} aria-label={listening ? t("I'm done") : started ? t('Continue') : t('Start reciting')} title={listening ? t("I'm done") : started ? t('Continue') : t('Start reciting')}>
              <span className="hl-ring-a" aria-hidden="true" /><span className="hl-ring-b" aria-hidden="true" />
              {listening ? <IcStop /> : <IcMic />}
            </button>
            <button type="button" className="hl-ic round" onClick={restart} disabled={!started && !listening} aria-label={t('Start over')} title={t('Start over')}><IcRestart /></button>
            <button type="button" className="hl-ic round" onClick={() => goPage(pageNo + 1)} disabled={pageNo >= PAGE_COUNT} aria-label={t('Next page')} title={t('Next page')}><IcNext /></button>
          </div>
        </div>
      )}

      <WhereSheet open={sheet === 'where'} onClose={() => setSheet(null)} t={t} selSurah={selSurah} selAyah={selAyah} pageNo={pageNo}
                  onJump={(su, ay) => { setSheet(null); jumpTo(su, ay); }} onPage={(p) => { setSheet(null); goPage(p); }} />
      <DeepSheet open={sheet === 'ai'} onClose={() => setSheet(null)} t={t} lang={lang} segments={segments} selSurah={selSurah} selAyah={selAyah} />
      <SettingsSheet open={sheet === 'settings'} onClose={() => setSheet(null)} t={t} auto={auto} setAuto={setAuto} fs={fs} setFs={setFs} hide={hide} setHide={setHide} />
    </div>
  );
}

/* ------------------------------------------------------------------ sheets ---- */
function SheetShell({ open, onClose, title, children }) {
  const [shown, setShown] = useState(false);
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) { setMounted(true); const id = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(id); }
    setShown(false); const tm = setTimeout(() => setMounted(false), 240); return () => clearTimeout(tm);
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!mounted) return null;
  return createPortal(
    <div className={'hl-sheet-ov' + (shown ? ' show' : '')} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="hl-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <span className="hl-grab" aria-hidden="true" />
        <div className="hl-sheet-h"><h3>{title}</h3><button type="button" className="hl-ic" onClick={onClose} aria-label="Close"><IcX /></button></div>
        <div className="hl-sheet-b">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** Surah / ayah, juz or page: one bottom sheet instead of three drop-downs. */
function WhereSheet({ open, onClose, t, selSurah, selAyah, pageNo, onJump, onPage }) {
  const [tab, setTab] = useState('surah');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState(null);   // surah chosen, now choosing the ayah
  const [pg, setPg] = useState(String(pageNo));
  useEffect(() => { if (open) { setTab('surah'); setQ(''); setPicked(null); setPg(String(pageNo)); } }, [open, pageNo]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return Array.from({ length: 114 }, (_, i) => i + 1).filter((n) => !s || String(n) === s || SURAH_NAMES[n - 1].toLowerCase().includes(s));
  }, [q]);
  return (
    <SheetShell open={open} onClose={onClose} title={picked ? SURAH_NAMES[picked - 1] : t('Go to')}>
      {!picked && (
        <div className="hl-tabs" role="tablist">
          {[['surah', t('Surah')], ['juz', t('Juz')], ['page', t('Page')]].map(([k, l]) => (
            <button type="button" role="tab" aria-selected={tab === k} key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
      )}
      {!picked && tab === 'surah' && (
        <>
          <label className="hl-search"><IcSearch /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search surah…')} aria-label={t('Search surah…')} /></label>
          <div className="hl-list">
            {list.map((n) => (
              <button type="button" key={n} className={'hl-row' + (n === selSurah ? ' on' : '')} onClick={() => setPicked(n)}>
                <span className="hl-num">{n}</span><span className="hl-row-t">{SURAH_NAMES[n - 1]}</span><small>{SURAH_AYAHS[n]} {t('Ayah')}</small>
              </button>
            ))}
            {list.length === 0 && <p className="hifz-sub">{t('No results')}</p>}
          </div>
        </>
      )}
      {picked && (
        <>
          <button type="button" className="hl-btn wide" onClick={() => onJump(picked, 1)}>{t('From the beginning')}</button>
          <p className="hifz-sub" style={{ margin: '12px 2px 6px' }}>{t('From ayah')}</p>
          <div className="hl-ayahs">
            {Array.from({ length: SURAH_AYAHS[picked] }, (_, i) => i + 1).map((a) => (
              <button type="button" key={a} className={picked === selSurah && a === selAyah ? 'on' : ''} onClick={() => onJump(picked, a)}>{a}</button>
            ))}
          </div>
          <button type="button" className="hl-btn ghost wide" onClick={() => setPicked(null)}>{'‹ '}{t('Surah')}</button>
        </>
      )}
      {!picked && tab === 'juz' && (
        <div className="hl-juz">
          {JUZ_STARTS.map(([su, ay], i) => (
            <button type="button" key={i} onClick={() => onJump(su, ay)}><b>{i + 1}</b><small>{SURAH_NAMES[su - 1]}</small></button>
          ))}
        </div>
      )}
      {!picked && tab === 'page' && (
        <form className="hl-pageform" onSubmit={(e) => { e.preventDefault(); onPage(pg); }}>
          <input type="number" inputMode="numeric" min={1} max={PAGE_COUNT} value={pg} onChange={(e) => setPg(e.target.value)} aria-label={t('Page')} />
          <span>/ {PAGE_COUNT}</span>
          <button type="submit" className="hl-btn">{t('Go')}</button>
        </form>
      )}
    </SheetShell>
  );
}

function SettingsSheet({ open, onClose, t, auto, setAuto, fs, setFs, hide, setHide }) {
  return (
    <SheetShell open={open} onClose={onClose} title={t('Settings')}>
      <div className="hl-set">
        <div className="hl-set-row">
          <div><b>{t('Mode')}</b><small>{hide ? t('Hide text (memorisation)') : t('Show text (reading)')}</small></div>
          <div className="hl-seg" role="group" aria-label={t('Mode')}>
            <button type="button" className={hide ? 'on' : ''} onClick={() => setHide(true)}>{t('Memorise')}</button>
            <button type="button" className={!hide ? 'on' : ''} onClick={() => setHide(false)}>{t('Read')}</button>
          </div>
        </div>
        <div className="hl-set-row">
          <div><b>{t('Auto-turn')}</b><small>{t('Turn to the next page by itself when the last word is recited')}</small></div>
          <button type="button" role="switch" aria-checked={auto} className={'hl-switch' + (auto ? ' on' : '')} onClick={() => setAuto((a) => !a)}><i /></button>
        </div>
        <div className="hl-set-row col">
          <div><b>{t('Text size')}</b></div>
          <div className="hl-size"><span style={{ fontSize: 14 }}>أ</span>
            <input type="range" min="0.8" max="1.4" step="0.05" value={fs} onChange={(e) => setFs(+e.target.value)} aria-label={t('Text size')} />
            <span style={{ fontSize: 24 }}>أ</span></div>
        </div>
      </div>
    </SheetShell>
  );
}

/* ------------------------------------------------------------------ AI check (server): word-by-word + tajweed review ---- */
const DEEP_MAX_AYAHS = 15;

/**
 * Record a whole passage, send it to the server (Quran-tuned speech model if connected, otherwise Gemini), and show the word-by-word
 * result plus an advisory tajweed / pronunciation review. Nothing is stored; the live page above stays the daily practice tool.
 */
function DeepSheet({ open, onClose, t, lang, segments, selSurah, selAyah }) {
  const [step, setStep] = useState('setup');   // setup | rec | busy | result | error
  const [surah, setSurah] = useState(selSurah);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(1);
  const [tajweed, setTajweed] = useState(true);
  const [secs, setSecs] = useState(0);
  const [res, setRes] = useState(null);
  const [errKey, setErrKey] = useState('');
  const recRef = useRef(null);
  const tick = useRef(null);
  const lvlRef = useRef(null);

  const segOf = useCallback((su) => segments.find((sg) => sg.surah === su) || segments[0], [segments]);
  useEffect(() => {
    if (!open) return;
    const seg = segments.find((sg) => sg.surah === selSurah) || segments[0];
    const f = selSurah === seg.surah && selAyah >= seg.from && selAyah <= seg.to ? selAyah : seg.from;
    setSurah(seg.surah); setFrom(f); setTo(Math.min(seg.to, f + 9));
    setStep('setup'); setRes(null); setErrKey(''); setSecs(0);
  }, [open, segments, selSurah, selAyah]);
  useEffect(() => () => { clearInterval(tick.current); if (recRef.current) recRef.current.abort(); }, []);
  useEffect(() => { if (!open && recRef.current) { recRef.current.abort(); recRef.current = null; clearInterval(tick.current); } }, [open]);

  const maxAyah = SURAH_AYAHS[surah] || 1;
  const toMax = Math.min(maxAyah, from + DEEP_MAX_AYAHS - 1);

  function begin() {
    setErrKey(''); setSecs(0); setStep('rec');
    tick.current = setInterval(() => setSecs((x) => x + 1), 1000);
    recRef.current = serverListen({
      lang: 'ar', raw: true, maxMs: 95000, noSpeechMs: 12000, endSilenceMs: 3500,
      onLevel: (lv) => { if (lvlRef.current) lvlRef.current.style.setProperty('--lvl', Math.min(1, lv * 1.4).toFixed(2)); },
      onError: (code) => { if (code === 'not-allowed' || code === 'audio-capture') setErrKey('mic'); else if (code === 'no-speech') setErrKey('silent'); },
      onDone: (audio) => {
        clearInterval(tick.current); recRef.current = null;
        if (!audio) { setStep('error'); setErrKey((k) => k || 'silent'); return; }
        send(audio);
      },
    });
  }
  async function send(audio) {
    setStep('busy');
    try {
      const { data, error } = await supabase.functions.invoke('ufuq-hifz-check', { body: { mode: 'practice', surah, from_ayah: from, to_ayah: to, audio, tajweed, lang: String(lang || 'EN').toLowerCase() } });
      if (error) {
        let code = '';
        try { const j = await error.context.json(); code = (j && j.error) || ''; } catch (e) { /* not json */ }
        setErrKey(code === 'no-speech' ? 'silent' : code === 'slow-down' ? 'slow' : code === 'PAYMENT_REQUIRED' ? 'pay' : 'server');
        setStep('error'); return;
      }
      if (!data || !data.ok) { setErrKey('server'); setStep('error'); return; }
      setRes(data); setStep('result');
    } catch (e) { setErrKey('server'); setStep('error'); }
  }
  const stopRec = () => { if (recRef.current) recRef.current.stop(); };
  const mmss = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  const ERR = {
    mic: t('Microphone access is blocked. Allow it in the browser settings.'),
    silent: t('Nothing was heard. Move closer to the microphone and try again.'),
    slow: t('Too many checks in a minute. Wait a moment and try again.'),
    pay: t('Your access has ended. Open Plans to continue.'),
    server: t('The AI check is busy right now. Please try again in a moment.'),
  };

  return (
    <SheetShell open={open} onClose={() => { if (step !== 'rec') onClose(); }} title={t('AI check')}>
      {step === 'setup' && (
        <div className="hd-setup">
          <p className="hifz-sub" style={{ margin: '0 2px 12px' }}>{t('Recite the passage below from memory. The AI listens to the whole recitation, checks every word and reviews your tajweed.')}</p>
          <div className="hd-range">
            {segments.length > 1 && (
              <label><small>{t('Surah')}</small>
                <select value={surah} onChange={(e) => { const sg = segOf(+e.target.value); setSurah(sg.surah); setFrom(sg.from); setTo(Math.min(sg.to, sg.from + 9)); }}>
                  {segments.map((sg) => <option key={sg.surah} value={sg.surah}>{SURAH_NAMES[sg.surah - 1]}</option>)}
                </select></label>
            )}
            <label><small>{t('From ayah')}</small>
              <select value={from} onChange={(e) => { const f = +e.target.value; setFrom(f); setTo((x) => Math.min(Math.max(x, f), Math.min(maxAyah, f + DEEP_MAX_AYAHS - 1))); }}>
                {Array.from({ length: maxAyah }, (_, i) => i + 1).map((a) => <option key={a} value={a}>{a}</option>)}
              </select></label>
            <label><small>{t('To ayah')}</small>
              <select value={to} onChange={(e) => setTo(+e.target.value)}>
                {Array.from({ length: toMax - from + 1 }, (_, i) => from + i).map((a) => <option key={a} value={a}>{a}</option>)}
              </select></label>
          </div>
          <div className="hl-set-row" style={{ borderBottom: 0 }}>
            <div><b>{t('Tajweed review')}</b><small>{t('The AI also points out madd, ghunna, qalqala and letter pronunciation. It is advice, not a grade.')}</small></div>
            <button type="button" role="switch" aria-checked={tajweed} className={'hl-switch' + (tajweed ? ' on' : '')} onClick={() => setTajweed((x) => !x)}><i /></button>
          </div>
          <button type="button" className="hl-btn wide" onClick={begin}>{t('Start recording')}</button>
        </div>
      )}
      {step === 'rec' && (
        <div className="hd-rec">
          <div className="hd-orb" ref={lvlRef}><span /><span /><IcMic /></div>
          <b className="hd-time">{mmss}</b>
          <p className="hifz-sub">{t('Listening… recite now')}</p>
          <button type="button" className="hl-btn wide" onClick={stopRec}>{t('Stop and check')}</button>
        </div>
      )}
      {step === 'busy' && (
        <div className="hd-busy" aria-busy="true">
          <div className="hl-wave big" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div>
          <b>{t('The AI is checking your recitation…')}</b>
          <p className="hifz-sub">{t('This can take up to half a minute.')}</p>
        </div>
      )}
      {step === 'error' && (
        <div className="hd-busy">
          <p className="hl-err">{ERR[errKey] || ERR.server}</p>
          <button type="button" className="hl-btn wide" onClick={() => setStep('setup')}>{t('Try again')}</button>
        </div>
      )}
      {step === 'result' && res && <DeepResult res={res} t={t} onClose={onClose} onAgain={() => { setRes(null); setStep('setup'); }} />}
    </SheetShell>
  );
}

export function DeepResult({ res, t, onClose, onAgain }) {
  const [peek, setPeek] = useState(null);
  const byAyah = useMemo(() => {
    if (!res) return [];
    const m = new Map();
    res.words.forEach((w, k) => { if (!m.has(w.ayah)) m.set(w.ayah, []); m.get(w.ayah).push({ ...w, k }); });
    return [...m.entries()];
  }, [res]);
  const bad = res ? res.words.filter((w) => w.status === 'wrong' || w.status === 'near') : [];
  const missing = res ? res.words.filter((w) => w.status === 'missing') : [];
  const STATUS = { correct: t('Correct'), near: t('Doubtful'), wrong: t('Wrong'), missing: t('Missed') };

  return (
        <div className="hd-res">
          <div className="hd-top">
            <div className="hl-ring" style={{ '--p': res.score }}>
              <svg viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="34" className="bg" /><circle cx="40" cy="40" r="34" className="fg" pathLength="100" /></svg>
              <b>{Math.round(res.score)}<small>%</small></b>
            </div>
            <div className="hd-top-t">
              <strong>{t('Words')}</strong>
              <div className="hl-chips">
                <span className="hl-key hl-key-correct" title={STATUS.correct}>{res.counts.correct}</span>
                <span className="hl-key hl-key-near" title={STATUS.near}>{res.counts.near}</span>
                <span className="hl-key hl-key-wrong" title={STATUS.wrong}>{res.counts.wrong}</span>
                <span className="hl-key hl-key-missing" title={STATUS.missing}>{res.counts.missing}</span>
              </div>
              <small>{STATUS.correct} · {STATUS.near} · {STATUS.wrong} · {STATUS.missing}</small>
            </div>
            {res.tajweed && (
              <div className="hd-taj-score" title={t('Tajweed')}><b>{res.tajweed.overall}</b><small>{t('Tajweed')}</small></div>
            )}
          </div>
          <div className="hd-text" dir="rtl" lang="ar">
            {byAyah.map(([ay, ws]) => (
              <span key={ay} className="hd-ayah">
                {ws.map((w) => (
                  <span key={w.k} className={'hl-w hl-' + w.status} onClick={() => setPeek(w.status === 'correct' ? null : { expected: w.text, said: w.heard, st: w.status })}>{w.text}{' '}</span>
                ))}
                <span className="hl-marker">{'﴿'}{arDigits(ay)}{'﴾'}</span>{' '}
              </span>
            ))}
          </div>
          {peek && (
            <div className={'hl-peek ' + peek.st} style={{ width: '100%', boxShadow: 'none' }} onClick={() => setPeek(null)}>
              <span><small>{t('Correct')}</small><b dir="rtl" lang="ar">{peek.expected}</b></span>
              <span><small>{t('You said')}</small><b dir="rtl" lang="ar">{peek.said || '—'}</b></span>
            </div>
          )}
          {(bad.length > 0 || missing.length > 0) && !peek && <p className="hl-tip" style={{ margin: '2px 0 0' }}>{t('Tap a coloured word to see what was heard.')}</p>}
          <h4 className="hd-h">{t('Tajweed')}</h4>
          {!res.tajweed && <p className="hifz-sub">{t('Tajweed review is not available now.')}</p>}
          {res.tajweed && res.tajweed.notes.length === 0 && <p className="hd-clean">{t('No clear tajweed mistakes were heard. Mashallah!')}</p>}
          {res.tajweed && res.tajweed.notes.map((n, i) => (
            <div key={i} className={'hd-note ' + n.level} style={{ animationDelay: (i * 60) + 'ms' }}>
              <div className="hd-note-h"><span className="hd-rule">{n.rule}</span>{n.word && <b dir="rtl" lang="ar">{n.word}</b>}{n.ayah ? <small>{t('Ayah')} {n.ayah}</small> : null}</div>
              <p>{n.tip}</p>
            </div>
          ))}
          <p className="hl-note">{t('The AI can be wrong, especially with tajweed. Your teacher gives the final grade.')}</p>
          <div className="hl-result-act" style={{ marginTop: 8 }}>
            <button type="button" className="hl-btn ghost" onClick={onClose}>{t('Close')}</button>
            <button type="button" className="hl-btn" onClick={onAgain}>{t('Try again')}</button>
          </div>
        </div>
  );
}
