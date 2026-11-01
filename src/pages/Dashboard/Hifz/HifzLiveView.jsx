import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCabinetI18n } from '../../../context/CabinetI18nContext';
import { surahLabel, SURAH_NAMES } from '../../../lib/surahNames';
import { startLiveStt, liveSttSupported } from '../../../lib/liveStt';
import { flattenPage, createLiveSession, splitWords } from '../../../lib/hifzLive';
import { PAGE_COUNT, PAGE_STARTS, SURAH_AYAHS, pageOf, pageSegments, juzOf } from '../../../lib/mushafPages';
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
    return { page: Math.floor(page), hide: p.hide !== false, auto: p.auto !== false };
  } catch (e) { return { page: PAGE_COUNT, hide: true, auto: true }; }
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
const IcCheck = () => <Ic size={18}><path d="M5 12.5l4.5 4.5L19 7.5" /></Ic>;

/**
 * My Learning → Hifz Mushaf (individual groups only).  A real page of the Madina mushaf (1–604, see src/lib/mushafPages.js)
 * where the student recites from memory (or reads) and the words appear live as the recogniser hears them correctly —
 * in the spirit of Tarteel: continuous text (no boxes), one big microphone button, and when the last word of a page is
 * recited the next page turns in by itself while the microphone keeps listening.
 * No backend: the Qur'an text is /quran/{n}.json and recognition is the browser's own (see src/lib/liveStt.js).
 */
export default function HifzLiveView() {
  const { t } = useCabinetI18n();
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

  useEffect(() => { try { localStorage.setItem(PREF_KEY, JSON.stringify({ page: pageNo, hide, auto })); } catch (e) { /* storage blocked */ } }, [pageNo, hide, auto]);

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
    const measure = () => { const tb = document.querySelector('.topbar'); setBarH(tb ? Math.round(tb.getBoundingClientRect().height) : 0); };
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
    if (snap.states[i] === 'pending') setSnap(ses.hint(i)); // peek
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
    <div className="hl-wrap" ref={rootRef} style={{ '--hl-top': `${barH}px` }}>
      {/* ---- compact toolbar ---- */}
      <div className="hl-top">
        <div className="hl-where">
          <select aria-label={t('Surah')} value={selSurah} onChange={(e) => changeSurah(+e.target.value)}>
            {Array.from({ length: 114 }, (_, i) => <option key={i + 1} value={i + 1}>{surahLabel(i + 1)}</option>)}
          </select>
          <select aria-label={t('From ayah')} className="hl-ayah" value={selAyah} onChange={(e) => changeAyah(+e.target.value)}>
            {Array.from({ length: SURAH_AYAHS[selSurah] }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
          </select>
        </div>
        <div className="hl-pager">
          <button type="button" className="hl-ic" onClick={() => goPage(pageNo - 1)} disabled={pageNo <= 1} aria-label={t('Previous page')} title={t('Previous page')}><IcPrev /></button>
          <label className="hl-pg" title={`${t('Page')} (1–${PAGE_COUNT})`}>
            <input
              key={pageNo} type="number" inputMode="numeric" min={1} max={PAGE_COUNT} defaultValue={pageNo} aria-label={t('Page')}
              onKeyDown={(e) => { if (e.key === 'Enter') { goPage(e.currentTarget.value); e.currentTarget.blur(); } }}
              onBlur={(e) => { if (+e.target.value !== pageNo) goPage(e.target.value); }}
            />
            <span>/ {PAGE_COUNT}</span>
          </label>
          <button type="button" className="hl-ic" onClick={() => goPage(pageNo + 1)} disabled={pageNo >= PAGE_COUNT} aria-label={t('Next page')} title={t('Next page')}><IcNext /></button>
        </div>
        <div className="hl-tools">
          <div className="hl-seg" role="group" aria-label={t('Mode')}>
            <button type="button" className={hide ? 'on' : ''} onClick={() => setHide(true)} title={t('Hide text (memorisation)')}>{t('Memorise')}</button>
            <button type="button" className={!hide ? 'on' : ''} onClick={() => setHide(false)} title={t('Show text (reading)')}>{t('Read')}</button>
          </div>
          <button type="button" className={'hl-chip' + (auto ? ' on' : '')} onClick={() => setAuto((a) => !a)} aria-pressed={auto} title={t('Turn to the next page by itself when the last word is recited')}>
            {t('Auto-turn')}
          </button>
        </div>
      </div>
      <div className="hl-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><i style={{ width: `${progress}%` }} /></div>

      {loadErr && <p className="hifz-err">{t('The Qur’an text is not available yet. Tell your teacher.')}</p>}
      {!flat && !loadErr && <p className="hifz-sub">{t('Loading…')}</p>}

      {flat && (
        <article onClick={onPageClick} className={'hl-mushaf' + (turnDir > 0 ? ' turn-fwd' : turnDir < 0 ? ' turn-back' : '')} key={pageNo}>
          <div className="hl-mushaf-head">
            <span>{t('Juz')} {juz}</span>
            <span>{[...new Set(segments.map((sg) => sg.surah))].map((n) => SURAH_NAMES[n - 1]).join(' · ')}</span>
            <span>{t('Page')} {pageNo}</span>
          </div>
          {blocks}
          <div className="hl-folio">{arDigits(pageNo)}</div>
        </article>
      )}

      {flat && showSummary && snap && (
        <div className="hl-summary">
          <div className="hl-sum-head">
            <div className="hifz-score">{snap.score}<small>%</small></div>
            <div>
              <strong>{snap.done ? t('Page complete') : t('Stopped')}</strong>
              <p className="hifz-sub" style={{ margin: '2px 0 0' }}>
                {t('Correct')}: {counts.correct} · {t('Doubtful')}: {counts.near} · {t('Wrong')}: {counts.wrong} · {t('Missed')}: {counts.missing} · {t('Hints')}: {counts.hint}
              </p>
            </div>
            {snap.done && pageNo < PAGE_COUNT && (
              <button type="button" className="hifz-btn hl-sum-next" onClick={() => goPage(pageNo + 1)}>{t('Next page')}{' ›'}</button>
            )}
          </div>
          <div className="hifz-legend">
            <span className="hl-key hl-key-correct">{STATUS_LABEL.correct}</span><span className="hl-key hl-key-near">{STATUS_LABEL.near}</span>
            <span className="hl-key hl-key-wrong">{STATUS_LABEL.wrong}</span><span className="hl-key hl-key-missing">{STATUS_LABEL.missing}</span>
            <span className="hl-key hl-key-hint">{STATUS_LABEL.hint}</span>
          </div>
          <p className="hifz-note">{t('The live check uses your browser’s speech recognition and can mishear. A doubtful word may be recognition noise — your teacher gives the final grade.')}</p>
        </div>
      )}
      {flat && !listening && !started && (
        <p className="hl-tip">{t('Tap a word to start from it — the words before it are not counted. Tap a hidden word later to peek at it (counts as a hint).')}</p>
      )}

      {/* ---- floating dock: one big microphone button ---- */}
      {flat && (
        <div className={'hl-dock' + (listening ? ' live' : '')}>
          {toast && <div className="hl-toast" role="status"><IcCheck /> {t('Page complete')} · {toast.page} · {toast.score}%</div>}
          {listening && (
            <div className="hl-live" role="status">
              <span className="hl-dot" />
              <span className="hl-heard" dir="rtl" lang="ar" title={t('What the microphone hears')}>{heard || t('Listening… recite now')}</span>
            </div>
          )}
          {err && <p className="hl-err">{err}</p>}
          <div className="hl-dock-row">
            <button type="button" className="hl-ic round" onClick={hint} disabled={!snap || !hide || (snap && snap.done)} aria-label={t('Hint')} title={t('Hint')}><IcBulb /></button>
            <button type="button" className={'hl-mic' + (listening ? ' on' : '')} onClick={toggleMic} disabled={!listening && !!(snap && snap.done)} aria-label={listening ? t("I'm done") : started ? t('Continue') : t('Start reciting')} title={listening ? t("I'm done") : started ? t('Continue') : t('Start reciting')}>
              {listening ? <IcStop /> : <IcMic />}
            </button>
            <button type="button" className="hl-ic round" onClick={restart} disabled={!started && !listening} aria-label={t('Start over')} title={t('Start over')}><IcRestart /></button>
          </div>
        </div>
      )}
    </div>
  );

}
