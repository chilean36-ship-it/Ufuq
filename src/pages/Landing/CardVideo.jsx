import { useEffect, useRef, useState } from 'react';

/**
 * Silent looping preview of a card's video. It lies on top of the card's still image, so a card that has a video
 * (default or uploaded by the admin) shows the video straight away instead of a frozen picture; the image stays underneath
 * until the first frame is playing and is the fallback when the file is missing or cannot play.
 * Loads and plays only while the card is on screen (hidden tabs / off-screen rows cost nothing).
 * Used by the landing page cards and by the admin "Landing page" thumbnails.
 */
export default function CardVideo({ src, poster }) {
  const ref = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [wide, setWide] = useState(false); // landscape clip inside a portrait card

  useEffect(() => { setPlaying(false); setFailed(false); setWide(false); }, [src]);

  useEffect(() => {
    const v = ref.current;
    if (!v || !src || failed) return undefined;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const saver = navigator.connection && navigator.connection.saveData;
    if (reduce || saver) return undefined;
    v.muted = true; // set on the element too: some mobile browsers ignore the attribute for autoplay
    const start = () => { const p = v.play(); if (p && p.then) p.then(() => setPlaying(true)).catch(() => {}); };
    if (!('IntersectionObserver' in window)) { start(); return undefined; }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { start(); } else { v.pause(); }
    }, { threshold: 0.25 });
    io.observe(v);
    return () => io.disconnect();
  }, [src, failed]);

  // A landscape clip in a portrait card would lose its sides (and any text in them). Show it whole instead, on a soft blurred
  // copy of the card picture, so the card is still filled edge to edge.
  const onMeta = () => {
    const v = ref.current; if (!v || !v.videoWidth) return;
    const host = v.parentElement; const hr = host ? host.getBoundingClientRect() : null;
    if (hr && hr.height > 0) setWide(v.videoWidth / v.videoHeight > (hr.width / hr.height) * 1.15);
  };

  if (!src || failed) return null;
  return (
    <>
    {wide && playing && poster && <span aria-hidden="true" style={{ position: 'absolute', inset: '-12%', backgroundImage: 'url("' + poster + '")', backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(22px) brightness(.55) saturate(1.2)', pointerEvents: 'none' }} />}
    <video
      ref={ref}
      src={src}
      poster={poster}
      muted
      loop
      playsInline
      preload="none"
      aria-hidden="true"
      tabIndex={-1}
      onLoadedMetadata={onMeta}
      onPlaying={() => setPlaying(true)}
      onError={() => setFailed(true)}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: wide ? 'contain' : 'cover', display: 'block', background: wide && poster ? 'transparent' : '#000', pointerEvents: 'none', opacity: playing ? 1 : 0, transition: 'opacity .5s ease' }}
    />
    </>
  );
}
