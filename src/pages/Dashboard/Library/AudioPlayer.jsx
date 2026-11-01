import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCabinetI18n } from '../../../context/CabinetI18nContext';
import { audioSourceCandidates, fmtClock } from './libraryData';
import AudioVisualizer from './AudioVisualizer';
import './audio-player.css';
import './audio-player-v4.css';

const SOURCE_TIMEOUT_MS = 9000; // some Drive endpoints stall instead of failing — move on to the next one ourselves
// Direct files (Cloudflare R2 etc.) are big (60+ MB) and may be slow on mobile networks: give them far longer,
// and keep extending the wait for as long as bytes are still arriving (see onProgress below).
const DIRECT_TIMEOUT_MS = 60000;
const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2];
const BAR_COUNT = 76;
const MINI_BAR_COUNT = 44;
const POS_KEY = 'ufuq.audioPos.';
const VOL_KEY = 'ufuq.audioVol';
const VIZ_KEY = 'ufuq.audioViz';
const MARK_KEY = 'ufuq.audioMarks.';
const readMarks = (id) => { try { const a = JSON.parse(safeGet(MARK_KEY + id) || '[]'); return Array.isArray(a) ? a.filter((n) => isFinite(n)).sort((x, y) => x - y) : []; } catch (e) { return []; } };

const safeGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const safeSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked — not essential */ } };
const safeDel = (k) => { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } };

/** Stable pseudo-random waveform per lesson (decorative — it doubles as the progress/seek bar). */
function waveformFor(seedText) {
  let h = 2166136261;
  const str = String(seedText || 'ufuq');
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  const bars = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    const r = ((h >>> 0) % 1000) / 1000;
    const env = 0.5 + 0.5 * Math.sin((i / BAR_COUNT) * Math.PI);
    bars.push(Math.round(Math.max(14, (0.2 + r * 0.8) * env * 100)));
  }
  return bars;
}

const I = {
  play: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.2v13.6a1 1 0 001.5.86l11-6.8a1 1 0 000-1.72l-11-6.8A1 1 0 008 5.2z" /></svg>,
  pause: <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4.5" width="4.2" height="15" rx="1.3" /><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.3" /></svg>,
  back: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8" /><path d="M3 3v5h5" /></svg>,
  fwd: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 11-9-9 9 9 0 016.4 2.6L21 8" /><path d="M21 3v5h-5" /></svg>,
  loop: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 2l4 4-4 4" /><path d="M3 11V9a3 3 0 013-3h15" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a3 3 0 01-3 3H3" /></svg>,
  vol: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5L6 9H3v6h3l5 4V5z" /><path d="M15.5 8.5a5 5 0 010 7" /><path d="M18.5 5.5a9 9 0 010 13" /></svg>,
  low: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5L6 9H3v6h3l5 4V5z" /><path d="M15.5 8.5a5 5 0 010 7" /></svg>,
  mute: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5L6 9H3v6h3l5 4V5z" /><path d="M22 9l-6 6M16 9l6 6" /></svg>,
  prev: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2v14H6zM20 5.5v13a1 1 0 01-1.6.8l-8.4-6.5a1 1 0 010-1.6l8.4-6.5a1 1 0 011.6.8z" /></svg>,
  next: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 5h2v14h-2zM4 5.5v13a1 1 0 001.6.8L14 12.8a1 1 0 000-1.6L5.6 4.7A1 1 0 004 5.5z" /></svg>,
  mark: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3.5h12a1 1 0 011 1V21l-7-4.5L5 21V4.5a1 1 0 011-1z" /><path d="M12 7.5v5M9.5 10h5" /></svg>,
  viz: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4" /></svg>,
  note: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>,
};

/**
 * Custom audio player. Tries every direct-media source in order; if all fail it shows a clean
 * "unavailable" state (deliberately NOT Drive's own embedded player).
 * Mount it only while the lightbox is open: unmounting pauses and detaches the media element.
 *
 * Features: smooth waveform seek with hover-time preview, buffered range, ±10s skip, speed menu,
 * volume + mute, loop, "resume where you stopped" per lesson, keyboard shortcuts, lock-screen controls.
 */
export default function AudioPlayer({ lesson, autoPlay = false, compact = false, queueApi = null }) {
  const { t } = useCabinetI18n();
  const sources = useMemo(() => audioSourceCandidates(lesson), [lesson]);
  const audioRef = useRef(null);
  const rootRef = useRef(null);
  const barsRef = useRef(null);
  const draggingRef = useRef(false);
  const lastSaveRef = useRef(0);
  const posKey = POS_KEY + lesson.id;
  const queueRef = useRef(queueApi);
  queueRef.current = queueApi;

  const [phase, setPhase] = useState('loading'); // loading | ready | unavailable
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [pct, setPct] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [total, setTotal] = useState(lesson.durationSeconds > 0 ? lesson.durationSeconds : null);
  const [rate, setRate] = useState(1);
  const [rateOpen, setRateOpen] = useState(false);
  const [volume, setVolume] = useState(() => { const v = parseFloat(safeGet(VOL_KEY)); return isFinite(v) ? Math.min(1, Math.max(0, v)) : 1; });
  const [muted, setMuted] = useState(false);
  const [loop, setLoop] = useState(false);
  const [playErr, setPlayErr] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [hover, setHover] = useState(null);       // 0..1 while the pointer is over the waveform
  const [resume, setResume] = useState(0);        // seconds saved from a previous listen (offered, never forced)
  const [skipFlash, setSkipFlash] = useState(''); // 'back' | 'fwd' — brief visual feedback on skip
  const [marks, setMarks] = useState(() => readMarks(lesson.id));
  const [viz, setViz] = useState(() => (safeGet(VIZ_KEY) === 'wide' ? 'wide' : 'ring'));
  const bars = useMemo(() => waveformFor(lesson.id), [lesson.id]);

  useEffect(() => {
    if (!sources.length) return undefined;
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.crossOrigin = null;
    audioRef.current = audio;
    audio.volume = volume;

    let disposed = false;
    let srcIndex = 0;
    let timer = null;
    const isDrive = sources.some((s) => /google/i.test(s));
    const limitMs = isDrive ? SOURCE_TIMEOUT_MS : DIRECT_TIMEOUT_MS;
    const clearTimer = () => { if (timer) { clearTimeout(timer); timer = null; } };
    // Data is still coming in → the source is alive, so restart its countdown instead of giving up.
    const onProgress = () => {
      if (disposed) return;
      if (timer) { clearTimeout(timer); timer = setTimeout(tryNext, limitMs); }
      try {
        const b = audio.buffered;
        if (b && b.length && audio.duration) setBuffered((b.end(b.length - 1) / audio.duration) * 100);
      } catch (e) { /* ignore */ }
    };

    const paint = () => {
      if (draggingRef.current) return;
      setPct(audio.duration ? (audio.currentTime / audio.duration) * 100 : 0);
      setCur(audio.currentTime);
      // remember the position (throttled) so the student can continue where they stopped
      const now = Date.now();
      if (audio.duration && now - lastSaveRef.current > 3000) {
        lastSaveRef.current = now;
        if (audio.currentTime > 5 && audio.currentTime < audio.duration - 8) safeSet(posKey, String(Math.floor(audio.currentTime)));
        else safeDel(posKey);
      }
    };
    const tryNext = () => {
      if (disposed) return;
      clearTimer();
      if (srcIndex >= sources.length) { setPhase('unavailable'); return; }
      audio.src = sources[srcIndex++];
      audio.load();
      timer = setTimeout(tryNext, limitMs);
    };
    let metaDone = false;
    const onMeta = () => {
      if (disposed) return;
      clearTimer();
      setPhase('ready');
      if (isFinite(audio.duration)) setTotal(audio.duration);
      if (metaDone) return;
      metaDone = true;
      const saved = parseInt(safeGet(posKey), 10);
      const hasResume = saved > 5 && audio.duration && saved < audio.duration - 8;
      if (hasResume) setResume(saved);
      if (autoPlay && !hasResume) audio.play().catch(() => { /* browser blocked autoplay — the play button still works */ });
    };
    const onPlay = () => { if (!disposed) { setPlaying(true); setResume(0); } };
    const onPause = () => { if (!disposed) setPlaying(false); };
    const onEnded = () => {
      if (disposed) return;
      safeDel(posKey);
      if (audio.loop) return;
      setPlaying(false);
      audio.currentTime = 0;
      paint();
      const q = queueRef.current;
      if (q && q.autoNext && q.hasNext) setTimeout(() => { if (!disposed && queueRef.current) queueRef.current.onNext(); }, 450);
    };
    const onWaiting = () => { if (!disposed) setBuffering(true); };
    const onPlaying = () => { if (!disposed) setBuffering(false); };

    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('error', tryNext);
    audio.addEventListener('progress', onProgress);
    audio.addEventListener('loadeddata', onMeta);
    audio.addEventListener('timeupdate', paint);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('canplay', onPlaying);
    tryNext();

    // Lock-screen / headset controls
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new window.MediaMetadata({ title: lesson.title || 'Audio lesson', artist: 'Ufuq' });
        navigator.mediaSession.setActionHandler('play', () => audio.play().catch(() => {}));
        navigator.mediaSession.setActionHandler('pause', () => audio.pause());
        navigator.mediaSession.setActionHandler('seekbackward', () => { audio.currentTime = Math.max(0, audio.currentTime - 10); });
        navigator.mediaSession.setActionHandler('seekforward', () => { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 10); });
        navigator.mediaSession.setActionHandler('previoustrack', queueRef.current && queueRef.current.hasPrev ? () => queueRef.current && queueRef.current.onPrev() : null);
        navigator.mediaSession.setActionHandler('nexttrack', queueRef.current && queueRef.current.hasNext ? () => queueRef.current && queueRef.current.onNext() : null);
      } catch (e) { /* unsupported */ }
    }

    return () => {
      // Detach the media element, otherwise audio keeps playing in the background after the dialog closes.
      disposed = true;
      clearTimer();
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audioRef.current = null;
      if ('mediaSession' in navigator) {
        try { ['play', 'pause', 'seekbackward', 'seekforward', 'previoustrack', 'nexttrack'].forEach((a) => navigator.mediaSession.setActionHandler(a, null)); } catch (e) { /* ignore */ }
      }
    };
  }, [sources]); // eslint-disable-line react-hooks/exhaustive-deps

  // Volume / mute / loop / speed are applied to the live element whenever they change.
  useEffect(() => { const a = audioRef.current; if (a) { a.volume = volume; a.muted = muted; } }, [volume, muted, phase]);
  useEffect(() => { const a = audioRef.current; if (a) a.loop = loop; }, [loop, phase]);
  useEffect(() => { const a = audioRef.current; if (a) a.playbackRate = rate; }, [rate, phase]);
  useEffect(() => { safeSet(VOL_KEY, String(volume)); }, [volume]);

  // Close the speed menu on outside click / Escape
  useEffect(() => {
    if (!rateOpen) return undefined;
    const off = (e) => { if (rootRef.current && !rootRef.current.querySelector('.apx-rate-wrap')?.contains(e.target)) setRateOpen(false); };
    document.addEventListener('pointerdown', off);
    return () => document.removeEventListener('pointerdown', off);
  }, [rateOpen]);

  const ready = phase === 'ready';
  const unavailable = phase === 'unavailable';

  // Full player: take focus so Space / arrow keys work straight away.
  useEffect(() => { if (!compact && rootRef.current) { try { rootRef.current.focus({ preventScroll: true }); } catch (e) { /* ignore */ } } }, [compact]);

  const onToggle = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || phase !== 'ready') return;
    try {
      if (audio.paused) await audio.play(); else audio.pause();
      setPlayErr(false);
    } catch (err) {
      setPlayErr(true);
    }
  }, [phase]);

  const seekToRatio = useCallback((ratio) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const r = Math.min(1, Math.max(0, ratio));
    audio.currentTime = r * audio.duration;
    setPct(r * 100);
    setCur(audio.currentTime);
  }, []);
  const skip = useCallback((delta) => {
    const audio = audioRef.current;
    if (!audio || phase !== 'ready' || !audio.duration) return;
    seekToRatio((audio.currentTime + delta) / audio.duration);
    setSkipFlash(delta < 0 ? 'back' : 'fwd');
    setTimeout(() => setSkipFlash(''), 380);
  }, [phase, seekToRatio]);

  const saveMarks = (list) => { setMarks(list); if (list.length) safeSet(MARK_KEY + lesson.id, JSON.stringify(list)); else safeDel(MARK_KEY + lesson.id); };
  const addMark = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || phase !== 'ready') return;
    const at = Math.floor(audio.currentTime);
    setMarks((prev) => {
      if (prev.some((m) => Math.abs(m - at) < 2)) return prev;
      const next = [...prev, at].sort((a, b) => a - b).slice(0, 24);
      safeSet(MARK_KEY + lesson.id, JSON.stringify(next));
      return next;
    });
  }, [phase, lesson.id]);
  const jumpTo = (sec) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    seekToRatio(sec / audio.duration);
    setResume(0);
    audio.play().catch(() => {});
  };
  const toggleViz = useCallback(() => setViz((v) => { const n = v === 'ring' ? 'wide' : 'ring'; safeSet(VIZ_KEY, n); return n; }), []);

  const ratioFromEvent = (e) => {
    const box = barsRef.current && barsRef.current.getBoundingClientRect();
    if (!box || !box.width) return 0;
    return Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
  };
  const onBarsDown = (e) => {
    if (!ready) return;
    draggingRef.current = true;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    seekToRatio(ratioFromEvent(e));
  };
  const onBarsMove = (e) => {
    const r = ratioFromEvent(e);
    setHover(r);
    if (draggingRef.current) seekToRatio(r);
  };
  const onBarsUp = () => { draggingRef.current = false; };

  // Keyboard: works whenever focus is inside the player (Space/K play, ←/→ ±5s, J/L ±10s, ↑/↓ volume, M mute)
  const onKeyDown = (e) => {
    if (e.target.closest && e.target.closest('input[type="range"]')) { if (e.key === ' ') e.preventDefault(); }
    const k = e.key.toLowerCase();
    if (k === 'arrowright') { e.preventDefault(); skip(5); }
    else if (k === 'arrowleft') { e.preventDefault(); skip(-5); }
    else if (k === 'l') { e.preventDefault(); skip(10); }
    else if (k === 'j') { e.preventDefault(); skip(-10); }
    else if (k === 'k' || (k === ' ' && !(e.target.tagName === 'BUTTON'))) { e.preventDefault(); onToggle(); }
    else if (k === 'arrowup') { e.preventDefault(); setMuted(false); setVolume((v) => Math.min(1, +(v + 0.1).toFixed(2))); }
    else if (k === 'arrowdown') { e.preventDefault(); setVolume((v) => Math.max(0, +(v - 0.1).toFixed(2))); }
    else if (k === 'm') { e.preventDefault(); setMuted((m) => !m); }
    else if (k === 'n' && queueApi && queueApi.hasNext) { e.preventDefault(); queueApi.onNext(); }
    else if (k === 'p' && queueApi && queueApi.hasPrev) { e.preventDefault(); queueApi.onPrev(); }
    else if (k === 'b') { e.preventDefault(); addMark(); }
    else if (k === 'v') { e.preventDefault(); toggleViz(); }
    else if (/^[0-9]$/.test(k) && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); seekToRatio(Number(k) / 10); }
    else if (k === 'escape' && rateOpen) { e.stopPropagation(); setRateOpen(false); }
  };

  if (!sources.length) {
    return <p className="exam-empty">{t('Could not open the audio. Please refresh the page.')}</p>;
  }

  const statusErr = unavailable || playErr;
  const statusText = statusErr
    ? t('Could not open the audio. Please refresh the page.')
    : (phase === 'loading' ? t('Loading…') : (buffering && playing ? t('Buffering…') : ''));
  const hoverSec = hover != null && total ? hover * total : null;
  const VolIcon = muted || volume === 0 ? I.mute : (volume < 0.5 ? I.low : I.vol);
  const remaining = total ? Math.max(0, total - cur) : null;

  const doResume = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = resume;
    setResume(0);
    audio.play().catch(() => {});
  };

  const toggleBtn = (cls) => (
    <button type="button" className={cls + (playing ? ' playing' : '') + (phase === 'loading' ? ' loading' : '')}
            aria-label={playing ? t('Pause') : t('Play')} disabled={unavailable} onClick={onToggle}>
      <span className="apx-ic apx-ic-play">{I.play}</span>
      <span className="apx-ic apx-ic-pause">{I.pause}</span>
    </button>
  );

  const waveform = (count, cls) => {
    const list = count === BAR_COUNT ? bars : bars.filter((_, i) => i % Math.ceil(BAR_COUNT / count) === 0).slice(0, count);
    const barsEls = list.map((h, i) => <i key={i} style={{ height: h + '%', '--d': (i % 9) * 0.08 + 's' }} />);
    return (
      <div
        ref={barsRef} className={cls + (ready ? '' : ' disabled')} role="slider" tabIndex={ready ? 0 : -1}
        aria-label={t('Seek')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}
        aria-valuetext={fmtClock(cur) + (total ? ' / ' + fmtClock(total) : '')}
        onPointerDown={onBarsDown} onPointerMove={onBarsMove} onPointerUp={onBarsUp} onPointerCancel={onBarsUp}
        onPointerLeave={() => setHover(null)}
      >
        <div className="apx-wave-layer apx-wave-base">{barsEls}</div>
        <div className="apx-wave-layer apx-wave-buf" style={{ clipPath: `inset(0 ${100 - buffered}% 0 0)` }}>{barsEls}</div>
        <div className="apx-wave-layer apx-wave-fill" style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}>{barsEls}</div>
        {ready && hover != null && !('ontouchstart' in window) && (
          <>
            <span className="apx-hover-line" style={{ left: hover * 100 + '%' }} />
            <span className="apx-hover-tip" style={{ left: Math.min(94, Math.max(6, hover * 100)) + '%' }}>{fmtClock(hoverSec)}</span>
          </>
        )}
        {ready && total && count === BAR_COUNT && marks.map((m) => (m < total ? <span key={m} className="apx-mark" style={{ left: (m / total) * 100 + '%' }} /> : null))}
        {ready && <span className={'apx-head' + (playing ? ' live' : '')} style={{ left: pct + '%' }} />}
      </div>
    );
  };

  /* ---------- Compact (List tab) ---------- */
  if (compact) {
    return (
      <div ref={rootRef} className={'apx-mini' + (playing ? ' is-playing' : '') + (ready ? ' is-ready' : '') + (unavailable ? ' is-unavailable' : '')} onKeyDown={onKeyDown}>
        {toggleBtn('apx-mini-toggle')}
        <div className="apx-mini-main">
          {waveform(MINI_BAR_COUNT, 'apx-wave apx-wave-mini')}
          <div className="apx-mini-row">
            <span>{fmtClock(cur)}</span>
            {statusText ? <span className={'apx-mini-status' + (statusErr ? ' err' : '')}>{statusText}</span> : null}
            <span>{total ? fmtClock(total) : '--:--'}</span>
          </div>
        </div>
        <button type="button" className="apx-mini-rate" disabled={!ready} aria-label={t('Speed')}
                onClick={() => setRate(RATES[(RATES.indexOf(rate) + 1) % RATES.length])}>{rate}×</button>
      </div>
    );
  }

  /* ---------- Full player (lightbox) ---------- */
  return (
    <div ref={rootRef} tabIndex={-1} className={'apx' + (playing ? ' is-playing' : '') + (ready ? ' is-ready' : '') + (unavailable ? ' is-unavailable' : '')} onKeyDown={onKeyDown}>
      <div className={'apx-art' + (viz === 'wide' ? ' is-wide' : '')} aria-hidden="true">
        <AudioVisualizer playing={playing && !buffering} mode={viz} seed={lesson.id} loud={muted ? 0.3 : 0.45 + 0.55 * volume} />
        <span className="apx-glow" />
        <span className="apx-ring apx-ring-1" /><span className="apx-ring apx-ring-2" /><span className="apx-ring apx-ring-3" />
        <div className="apx-disc">
          <span className="apx-disc-grooves" />
          <span className="apx-disc-label">{I.note}</span>
        </div>
      </div>

      {!unavailable && (
        <div className="apx-panel">
          {resume > 0 && (
            <button type="button" className="apx-resume" onClick={doResume}>
              <span>{I.play}</span>{t('Continue from')} <b>{fmtClock(resume)}</b>
            </button>
          )}

          <div className="apx-seek">
            {waveform(BAR_COUNT, 'apx-wave apx-wave-full')}
            <div className="apx-time">
              <span className="apx-time-cur">{fmtClock(cur)}</span>
              <span className="apx-time-rem">{remaining != null ? '−' + fmtClock(remaining) : '--:--'}</span>
            </div>
          </div>

          {marks.length > 0 && (
            <div className="apx-marks" aria-label={t('Bookmarks')}>
              {marks.map((m) => (
                <span className="apx-mark-chip" key={m}>
                  <button type="button" className="apx-mark-go" onClick={() => jumpTo(m)} title={t('Play')}>{I.mark}{fmtClock(m)}</button>
                  <button type="button" className="apx-mark-x" aria-label={t('Remove bookmark')} onClick={() => saveMarks(marks.filter((x) => x !== m))}>×</button>
                </span>
              ))}
            </div>
          )}

          <div className="apx-controls">
            <button type="button" className={'apx-tool' + (loop ? ' on' : '')} aria-pressed={loop} aria-label={t('Repeat')} title={t('Repeat')} disabled={!ready} onClick={() => setLoop((v) => !v)}>
              {I.loop}
            </button>
            <button type="button" className={'apx-skip' + (skipFlash === 'back' ? ' flash' : '')} aria-label="-10s" disabled={!ready} onClick={() => skip(-10)}>
              {I.back}<b>10</b>
            </button>
            {toggleBtn('apx-play')}
            <button type="button" className={'apx-skip' + (skipFlash === 'fwd' ? ' flash' : '')} aria-label="+10s" disabled={!ready} onClick={() => skip(10)}>
              {I.fwd}<b>10</b>
            </button>
            <div className="apx-rate-wrap">
              <button type="button" className={'apx-tool apx-rate' + (rate !== 1 ? ' on' : '')} aria-haspopup="listbox" aria-expanded={rateOpen} aria-label={t('Speed')} title={t('Speed')} disabled={!ready} onClick={() => setRateOpen((v) => !v)}>
                {rate}×
              </button>
              {rateOpen && (
                <ul className="apx-rate-menu" role="listbox">
                  {RATES.map((r) => (
                    <li key={r} role="option" aria-selected={r === rate}>
                      <button type="button" className={r === rate ? 'on' : ''} onClick={() => { setRate(r); setRateOpen(false); }}>{r}×{r === 1 ? <em>{t('Normal')}</em> : null}</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {queueApi && (queueApi.hasPrev || queueApi.hasNext) && (
            <div className="apx-trackbar">
              <button type="button" className="apx-trk" disabled={!queueApi.hasPrev} onClick={queueApi.onPrev} title={queueApi.prevTitle || ''} aria-label={t('Previous lesson')}>
                {I.prev}<span>{t('Previous')}</span>
              </button>
              <button type="button" className={'apx-auto' + (queueApi.autoNext ? ' on' : '')} role="switch" aria-checked={!!queueApi.autoNext} onClick={() => queueApi.setAutoNext(!queueApi.autoNext)}>
                <i /><span>{t('Autoplay next')}</span>
              </button>
              <button type="button" className="apx-trk apx-trk-next" disabled={!queueApi.hasNext} onClick={queueApi.onNext} title={queueApi.nextTitle || ''} aria-label={t('Next lesson')}>
                <span>{t('Next')}</span>{I.next}
              </button>
            </div>
          )}

          <div className="apx-foot">
            <div className="apx-vol">
              <button type="button" className="apx-tool apx-tool-sm" aria-label={t('Mute')} title="M" onClick={() => setMuted((m) => !m)}>{VolIcon}</button>
              <input type="range" min="0" max="1" step="0.02" value={muted ? 0 : volume} aria-label={t('Volume')}
                     style={{ '--v': (muted ? 0 : volume) * 100 + '%' }}
                     onChange={(e) => { const v = parseFloat(e.target.value); setVolume(v); setMuted(v === 0); }} />
            </div>
            <button type="button" className="apx-tool apx-tool-sm" aria-label={t('Add bookmark')} title={t('Add bookmark') + ' (B)'} disabled={!ready} onClick={addMark}>{I.mark}</button>
            <button type="button" className={'apx-tool apx-tool-sm' + (viz === 'wide' ? ' on' : '')} aria-label={t('Visualizer')} title={t('Visualizer') + ' (V)'} onClick={toggleViz}>{I.viz}</button>
            <span className="apx-hint">Space · ← → · N P · B</span>
          </div>
        </div>
      )}

      <p className={'apx-status' + (statusErr ? ' err' : '')} role="status">{statusText}</p>
    </div>
  );
}
