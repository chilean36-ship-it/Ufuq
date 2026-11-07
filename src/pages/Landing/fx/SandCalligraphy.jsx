import { useEffect, useRef } from 'react';

/* The hero word "أُفُق" is built from thousands of sand grains that pour in from above, then
   scatter away from the cursor / finger (and blow apart on click) and settle back. Wind-blown grains
   drift across the whole hero. Pure canvas — no libraries. Pauses off-screen; static under reduced motion. */
const PAD = 80;

export default function SandCalligraphy({ text = 'أُفُق' }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const host = canvas.parentElement;
    const ctx = canvas.getContext('2d');
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let W = 0, H = 0, dpr = 1, raf = 0, last = 0, visible = true, dead = false;
    let parts = [], wind = [], palette = ['#E5C878', '#C9A24B', '#EDEAE3'];
    const ptr = { x: -999, y: -999, active: false, down: false };
    let origin = { left: 0, top: 0 };
    let t0 = performance.now();

    const readPalette = () => {
      const cs = getComputedStyle(document.documentElement);
      const g = (n, f) => (cs.getPropertyValue(n) || '').trim() || f;
      palette = [g('--gold-bright', '#E5C878'), g('--gold-bright', '#E5C878'), g('--gold', '#C9A24B'), g('--gold', '#C9A24B'), g('--text', '#EDEAE3')];
    };

    function build() {
      if (dead) return;
      const rect = host.getBoundingClientRect();
      W = rect.width + PAD * 2; H = rect.height + PAD * 2;
      origin = { left: rect.left - PAD, top: rect.top - PAD };
      dpr = Math.min(window.devicePixelRatio || 1, 3);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // mask is rasterised at device resolution so the letter edges are sharp, then sampled finely
      const off = document.createElement('canvas'); off.width = Math.round(W * dpr); off.height = Math.round(H * dpr);
      const o = off.getContext('2d', { willReadFrequently: true });
      // Draws the word at `size`, returns its pixels and the box the ink really covers (the vowel marks stick out above the
      // letters, so the advance width is not where the word visually sits).
      const raster = (size) => {
        o.setTransform(1, 0, 0, 1, 0, 0); o.clearRect(0, 0, off.width, off.height); o.scale(dpr, dpr);
        o.font = size + 'px Amiri, "Noto Naskh Arabic", serif';
        o.direction = 'rtl'; o.textAlign = 'center'; o.textBaseline = 'middle'; o.fillStyle = '#000';
        o.fillText(text, W / 2, H / 2);
        const data = o.getImageData(0, 0, off.width, off.height).data;
        let x0 = off.width, x1 = -1, y0 = off.height, y1 = -1;
        for (let y = 0; y < off.height; y += 2) for (let x = 0; x < off.width; x += 2) {
          if (data[(y * off.width + x) * 4 + 3] > 150) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        }
        return { data, x0: x0 / dpr, x1: x1 / dpr, y0: y0 / dpr, y1: y1 / dpr };
      };
      // size: as before on wide screens; on narrow ones it is reduced until the word fits inside the ring with some air
      let size = Math.max(100, Math.min(rect.width * 0.46, 220));
      let r = raster(size);
      const maxInkW = Math.min(rect.width * 0.7, 330), maxInkH = rect.height * 0.62;
      if (r.x1 > r.x0) {
        const k = Math.min(1, maxInkW / (r.x1 - r.x0), maxInkH / Math.max(1, r.y1 - r.y0));
        if (k < 1) { size = Math.max(60, size * k); r = raster(size); }
      }
      const img = r.data;
      // centre the INK (not the text box) in the middle of the hero visual, so the word never leans to one side
      const shiftX = r.x1 > r.x0 ? W / 2 - (r.x0 + r.x1) / 2 : 0;
      const shiftY = r.y1 > r.y0 ? H / 2 - (r.y0 + r.y1) / 2 : 0;

      const MAX = W < 700 ? 9000 : 14000;
      let step = W < 700 ? 1.45 : 1.2;               // CSS px between grains
      let pts = [];
      for (let tries = 0; tries < 8; tries++) {
        pts = [];
        const sd = step * dpr;
        let row = 0;
        for (let y = 0; y < off.height; y += sd * 0.87, row++) for (let x = (row & 1) * sd * 0.5; x < off.width; x += sd) {
          const ix = Math.round(x), iy = Math.round(y);
          if (ix >= off.width || iy >= off.height) continue;
          // soft edge: grains thin out where the glyph edge is only partly covered, so outlines stay crisp, not furry
          const a = img[(iy * off.width + ix) * 4 + 3];
          if (a > 150 || (a > 60 && Math.random() < (a - 60) / 90)) pts.push([ix / dpr + shiftX + (Math.random() - 0.5) * step * 0.9, iy / dpr + shiftY + (Math.random() - 0.5) * step * 0.9]);
        }
        if (pts.length <= MAX) break;
        step *= 1.12;
      }
      parts = pts.map(([hx, hy]) => ({
        hx, hy,
        x: still ? hx : hx + (Math.random() - 0.5) * W * 0.5,
        y: still ? hy : -20 - Math.random() * H * 0.7,
        vx: 0, vy: 0,
        s: 0.8 + Math.random() * 0.7,
        c: (Math.random() * palette.length) | 0,
        ph: Math.random() * 6.283,
        delay: Math.random() * 1100,
        spark: Math.random() < 0.07,
      }));
      wind = still ? [] : Array.from({ length: W < 700 ? 40 : 80 }, () => ({
        x: Math.random() * W, y: Math.random() * H, vx: 0.4 + Math.random() * 1.3, vy: (Math.random() - 0.5) * 0.25,
        s: 0.8 + Math.random() * 1.0, a: 0.25 + Math.random() * 0.4, ph: Math.random() * 6.283,
      }));
      t0 = performance.now();
      host.classList.add('fx-ready');
      draw(performance.now());
    }

    function blast(x, y) {
      parts.forEach((p) => {
        const dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy) || 1;
        if (d < 190) { const f = (1 - d / 190) * (8 + Math.random() * 10); p.vx += (dx / d) * f; p.vy += (dy / d) * f - 2; }
      });
    }

    function step(now, dt) {
      const R = 95, R2 = R * R, k = 0.045, damp = 0.86, el = now - t0;
      for (const p of parts) {
        if (el < p.delay) continue;
        p.vx += (p.hx - p.x) * k * dt + Math.sin(now * 0.0016 + p.ph) * 0.011;
        p.vy += (p.hy - p.y) * k * dt + Math.cos(now * 0.0013 + p.ph) * 0.011;
        if (ptr.active) {
          const dx = p.x - ptr.x, dy = p.y - ptr.y, d2 = dx * dx + dy * dy;
          if (d2 < R2) {
            const d = Math.sqrt(d2) || 1, f = (1 - d / R) * (ptr.down ? 3.4 : 1.7) * dt;
            p.vx += (dx / d) * f - (dy / d) * f * 0.45; p.vy += (dy / d) * f + (dx / d) * f * 0.45;
          }
        }
        p.vx *= damp; p.vy *= damp; p.x += p.vx * dt; p.y += p.vy * dt;
      }
      for (const w of wind) {
        w.x += (w.vx + (ptr.active && Math.abs(w.x - ptr.x) < 80 && Math.abs(w.y - ptr.y) < 80 ? 1.8 : 0)) * dt;
        w.y += (w.vy + Math.sin(now * 0.0012 + w.ph) * 0.22) * dt;
        if (w.x > W + 10) { w.x = -10; w.y = Math.random() * H; }
        if (w.y < -10) w.y = H + 5; else if (w.y > H + 10) w.y = -5;
      }
    }

    const TAU = Math.PI * 2;
    // round, sub-pixel dots (anti-aliased) — pixel-snapped squares made neighbouring grains fuse into streaks
    function draw(now) {
      ctx.clearRect(0, 0, W, H);
      const el = now - t0;
      for (let c = 0; c < palette.length; c++) {
        ctx.fillStyle = palette[c]; ctx.globalAlpha = 1; ctx.beginPath();
        for (const p of parts) if (p.c === c && !p.spark && el >= p.delay) { const r = p.s * 0.62; ctx.moveTo(p.x + r, p.y); ctx.arc(p.x, p.y, r, 0, TAU); }
        ctx.fill();
      }
      ctx.fillStyle = palette[1];
      for (const p of parts) if (p.spark && el >= p.delay) {
        ctx.globalAlpha = still ? 0.9 : 0.35 + 0.65 * Math.abs(Math.sin(now * 0.003 + p.ph));
        ctx.beginPath(); ctx.arc(p.x, p.y, p.s * 0.8 + 0.3, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = palette[2];
      for (const w of wind) { ctx.globalAlpha = w.a; ctx.beginPath(); ctx.arc(w.x, w.y, w.s * 0.6, 0, TAU); ctx.fill(); }
      ctx.globalAlpha = 1;
    }

    function loop(now) {
      raf = 0;
      if (dead || !visible || document.hidden || still) return;
      const dt = Math.min(2, (now - (last || now)) / 16.67); last = now;
      step(now, dt); draw(now);
      raf = requestAnimationFrame(loop);
    }
    const kick = () => { if (!raf && !dead && visible && !still) { last = 0; raf = requestAnimationFrame(loop); } };

    const io = new IntersectionObserver((e) => { visible = e[0].isIntersecting; if (visible) kick(); }, { threshold: 0 });
    io.observe(host);
    const onVis = () => { if (!document.hidden) kick(); };
    document.addEventListener('visibilitychange', onVis);

    const local = (e) => { ptr.x = e.clientX - origin.left; ptr.y = e.clientY - origin.top; };
    const inside = () => ptr.x > -40 && ptr.y > -40 && ptr.x < W + 40 && ptr.y < H + 40;
    const onMove = (e) => { origin.left = host.getBoundingClientRect().left - PAD; origin.top = host.getBoundingClientRect().top - PAD; local(e); ptr.active = inside(); };
    const onDown = (e) => { local(e); ptr.down = true; if (inside()) { ptr.active = true; blast(ptr.x, ptr.y); } };
    const onUp = (e) => { ptr.down = false; if (e.pointerType !== 'mouse') ptr.active = false; };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onUp, { passive: true });

    const mo = new MutationObserver(() => { readPalette(); if (still) draw(performance.now()); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const ro = new ResizeObserver(() => { clearTimeout(ro.t); ro.t = setTimeout(() => { build(); kick(); }, 160); });
    ro.observe(host);

    readPalette();
    const fontReady = (document.fonts && document.fonts.load) ? document.fonts.load('150px Amiri', text) : Promise.resolve();
    Promise.race([fontReady, new Promise((r) => setTimeout(r, 1500))]).then(() => { build(); kick(); });

    return () => {
      dead = true; cancelAnimationFrame(raf); clearTimeout(ro.t);
      io.disconnect(); ro.disconnect(); mo.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp);
      host.classList.remove('fx-ready');
    };
  }, [text]);

  return <canvas ref={ref} className="fx-sand" aria-hidden="true" />;
}
