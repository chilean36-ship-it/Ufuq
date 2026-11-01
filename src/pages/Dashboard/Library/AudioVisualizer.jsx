import { useEffect, useRef } from 'react';

/**
 * Decorative live spectrum. (A real analyser can't be used: Drive / R2 files are served without CORS headers, and
 * routing them through Web Audio would silence them.) The bars react to play / pause, volume and mute instead.
 * mode "ring" = bars radiating around the disc, "wide" = mirrored equalizer across the whole art area.
 */
function seeded(seedText) {
  let h = 2166136261;
  const s = String(seedText || 'ufuq');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
}

export default function AudioVisualizer({ playing, mode = 'ring', seed, loud = 1 }) {
  const ref = useRef(null);
  const live = useRef({ playing, mode, loud });
  live.current = { playing, mode, loud };

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return undefined;
    const ctx = cv.getContext('2d');
    if (!ctx) return undefined;
    const MAX = 72;
    const rnd = seeded(seed);
    const p1 = Array.from({ length: MAX }, rnd);
    const p2 = Array.from({ length: MAX }, rnd);
    const levels = new Float32Array(MAX);
    const reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    let raf = 0; let last = performance.now(); let t = 0; let w = 0; let h = 0; let dirty = true; let lastMode = '';

    const resize = () => {
      const r = cv.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = r.width; h = r.height;
      cv.width = Math.max(1, Math.round(w * dpr)); cv.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dirty = true;
    };
    resize();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(cv);

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
      const { playing: on, mode: m, loud: vol } = live.current;
      const n = m === 'wide' ? 56 : 72;
      let alive = false;
      for (let i = 0; i < n; i++) {
        const a = 0.5 + 0.5 * Math.sin(t * (2.2 + p1[i] * 2.8) + p2[i] * 6.283);
        const b = 0.5 + 0.5 * Math.sin(t * (0.9 + p2[i] * 1.7) + i * 0.45);
        const target = on ? (reduce ? 0.35 : (0.1 + 0.9 * a * (0.3 + 0.7 * b)) * vol) : 0;
        levels[i] += (target - levels[i]) * Math.min(1, dt * (target > levels[i] ? 11 : 4));
        if (levels[i] > 0.012) alive = true;
      }
      if (!on && !alive && !dirty && lastMode === m) return; // idle & already drawn — nothing to repaint
      dirty = false; lastMode = m;
      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = 'round';
      if (m === 'wide') {
        const gap = w / n; const bw = Math.max(2, gap * 0.56); const mid = h / 2;
        for (let i = 0; i < n; i++) {
          const lv = levels[i]; const half = Math.max(2, lv * h * 0.46);
          ctx.fillStyle = 'rgba(229,200,120,' + (0.22 + 0.7 * lv).toFixed(3) + ')';
          const x = i * gap + (gap - bw) / 2;
          if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, mid - half, bw, half * 2, bw / 2); ctx.fill(); } else ctx.fillRect(x, mid - half, bw, half * 2);
        }
      } else {
        const cx = w / 2; const cy = h / 2; const pad = 52;
        const r0 = Math.min(w, h) / 2 - pad + 9; const maxLen = pad - 12;
        ctx.lineWidth = Math.max(2, (2 * Math.PI * r0) / n * 0.46);
        for (let i = 0; i < n; i++) {
          const idx = i < n / 2 ? i : n - 1 - i; // mirror left/right
          const lv = levels[Math.round(idx * 0.98)];
          const len = 2 + lv * maxLen;
          const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
          const cos = Math.cos(ang); const sin = Math.sin(ang);
          ctx.strokeStyle = 'rgba(229,200,120,' + (0.28 + 0.72 * lv).toFixed(3) + ')';
          ctx.beginPath(); ctx.moveTo(cx + cos * r0, cy + sin * r0); ctx.lineTo(cx + cos * (r0 + len), cy + sin * (r0 + len)); ctx.stroke();
        }
      }
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); if (ro) ro.disconnect(); };
  }, [seed]);

  return <canvas ref={ref} className={'apx-viz apx-viz-' + mode} aria-hidden="true" />;
}
