import { useRef, useState } from 'react';
import Reveal from '../../components/Reveal';
import { useI18n } from '../../context/I18nContext';

const SRC = '/assets/videos/ufuq-features-720.mp4';
const POSTER = '/assets/videos/ufuq-features-poster.jpg';

const fmt = (s) => {
  if (!isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  return m + ':' + String(Math.floor(s % 60)).padStart(2, '0');
};

const I = {
  play: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>,
  pause: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg>,
  vol: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H3v6h3l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></svg>,
  mute: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H3v6h3l5 4z" /><path d="m16 9 5 6M21 9l-5 6" /></svg>,
  full: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>,
};

/** Big "inside Ufuq" video stage: static poster with a centred play button; a click starts the video with sound. */
export default function Showcase() {
  const { t } = useI18n();
  const stageRef = useRef(null);
  const frameRef = useRef(null);
  const vref = useRef(null);
  const [sound, setSound] = useState(false);   // user chose to watch with sound
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [time, setTime] = useState({ cur: 0, dur: 0 });
  const src = SRC;

  const watch = () => {
    const v = vref.current; if (!v) return;
    setSound(true);
    v.loop = false; v.muted = false;
    setMuted(false);
    const p = v.play(); if (p && p.catch) p.catch(() => { v.muted = true; setMuted(true); v.play().catch(() => {}); });
  };
  const toggle = () => { const v = vref.current; if (!v) return; if (v.paused) v.play().catch(() => {}); else v.pause(); };
  const toggleMute = () => { const v = vref.current; if (!v) return; v.muted = !v.muted; setMuted(v.muted); };
  const seek = (e) => {
    const v = vref.current; if (!v || !v.duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
    const f = Math.min(1, Math.max(0, rtl ? (r.right - e.clientX) / r.width : (e.clientX - r.left) / r.width));
    v.currentTime = f * v.duration;
  };
  const full = () => {
    const f = frameRef.current; if (!f) return;
    if (document.fullscreenElement) document.exitFullscreen(); else if (f.requestFullscreen) f.requestFullscreen();
  };
  const onEnded = () => { setSound(false); setMuted(true); const v = vref.current; if (v) { v.currentTime = 0; v.load(); } };

  const pct = time.dur ? (time.cur / time.dur) * 100 : 0;

  return (
    <section className="showcase" id="showcase">
      <div className="sc-aurora" aria-hidden="true"><i /><i /><i /></div>
      <div className="wrap">
        <Reveal className="section-head">
          <div className="eyebrow">{t('showcase.eyebrow')}</div>
          <h2>{t('showcase.title')}</h2>
          <p>{t('showcase.sub')}</p>
        </Reveal>

        <Reveal className="sc-stage">
          <div className="sc-perspective" ref={stageRef}>
            <span className="sc-ring r1" aria-hidden="true" />
            <span className="sc-ring r2" aria-hidden="true" />

            <div className={'sc-frame' + (sound ? ' is-sound' : '') + (playing ? ' is-playing' : '')} ref={frameRef}>
              <div className="sc-bar" aria-hidden="true"><i /><i /><i /><span>ufuqtaleem.com</span></div>
              <div className="sc-screen">
                <video
                  ref={vref}
                  src={src}
                  poster={POSTER}
                  muted
                  playsInline
                  preload="metadata"
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onEnded={onEnded}
                  onTimeUpdate={(e) => setTime({ cur: e.currentTarget.currentTime, dur: e.currentTarget.duration })}
                  onClick={sound ? toggle : watch}
                  aria-label={t('showcase.title')}
                />
                
                {!sound && (
                  <button type="button" className="sc-cta" onClick={watch} aria-label={t('showcase.watch')}>
                    <span className="sc-play"><span className="sc-pulse" /><span className="sc-pulse p2" />{I.play}</span>
                    <span className="sc-cta-text"><strong>{t('showcase.watch')}</strong></span>
                  </button>
                )}

                {sound && (
                  <div className="sc-controls">
                    <button type="button" onClick={toggle} aria-label={playing ? t('showcase.pause') : t('showcase.play')}>{playing ? I.pause : I.play}</button>
                    <span className="sc-time">{fmt(time.cur)}</span>
                    <div className="sc-track" onClick={seek} role="slider" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
                      <i style={{ width: pct + '%' }} />
                    </div>
                    <span className="sc-time">{fmt(time.dur)}</span>
                    <button type="button" onClick={toggleMute} aria-label={muted ? t('showcase.unmute') : t('showcase.mute')}>{muted ? I.mute : I.vol}</button>
                    <button type="button" onClick={full} aria-label={t('showcase.full')}>{I.full}</button>
                  </div>
                )}
              </div>
            </div>
            <div className="sc-reflect" aria-hidden="true" />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
