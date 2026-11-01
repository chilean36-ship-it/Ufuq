import { useEffect, useRef, useState } from 'react';
import './profile-cover.css';

/**
 * Profile cover v5 — «Harf maydoni» (field of letters).
 * A calm, site-themed backdrop (follows the global dark/light theme and the gold accent) made of:
 *   1. a soft gold horizon glow + a faint girih (islamic geometric) line lattice,
 *   2. a canvas field of floating Arabic letters (Amiri) at different depths — they drift slowly,
 *      parallax with the pointer and glow / part gently around it,
 *   3. a large outlined calligraphic «أفق» with a slow light sweep.
 * Pure decoration: aria-hidden, pauses off-screen / hidden tab, respects prefers-reduced-motion.
 */
const LETTERS = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي'.split('');
const WORDS = ['أفق', 'علم', 'نور', 'قرآن', 'حكمة', 'هدى'];   // ufuq · ilm · nur · qur'an · hikmat · hidoyat
const FONT = "'Amiri','Noto Naskh Arabic','Scheherazade New','Traditional Arabic',serif";

const readInk = () => {
  const cs = getComputedStyle(document.documentElement);
  const light = document.documentElement.getAttribute('data-theme') === 'light';
  const hex = (cs.getPropertyValue(light ? '--gold' : '--gold-bright') || '#E5C878').trim();
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  const n = m ? parseInt(m[1], 16) : 0xE5C878;
  return { rgb: ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255), light };
};

export default function ProfileCover() {
  const cvRef = useRef(null);
  const [wi, setWi] = useState(0);
  useEffect(() => {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const id = setInterval(() => { if (!document.hidden) setWi((i) => (i + 1) % WORDS.length); }, 7000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const cv = cvRef.current;
    const ctx = cv && cv.getContext('2d');
    if (!ctx) return undefined;
    const host = cv.closest('.pv-hero') || cv.parentElement;
    const reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    let w = 0; let h = 0; let dpr = 1; let raf = 0; let last = performance.now(); let visible = true;
    let glyphs = []; let bursts = []; let rings = []; let ink = readInk();
    const ptr = { x: 0, y: 0, tx: 0, ty: 0, on: false };

    const seed = () => {
      const n = Math.max(14, Math.min(40, Math.round((w * h) / 5200)));
      glyphs = Array.from({ length: n }, (_, i) => {
        const z = Math.random();                       // 0 far … 1 near
        return {
          ch: LETTERS[i % LETTERS.length], z,
          x: Math.random() * w, y: Math.random() * h,
          size: 20 + z * 46, rot: (Math.random() - 0.5) * 0.7, vr: (Math.random() - 0.5) * 0.12,
          vx: (Math.random() - 0.5) * 6 * (0.4 + z), vy: -2 - Math.random() * 5 * (0.4 + z),
          ox: 0, oy: 0, glow: 0, ph: Math.random() * 6.283,
        };
      });
      glyphs.sort((a, b) => a.z - b.z);
    };
    const resize = () => {
      const r = cv.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = r.width; h = r.height;
      cv.width = Math.max(1, Math.round(w * dpr)); cv.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
      if (reduce) draw(0);
    };

    const PUSH = 120;
    function draw(dt) {
      ctx.clearRect(0, 0, w, h);
      ptr.x += (ptr.tx - ptr.x) * Math.min(1, dt * 8 || 1); ptr.y += (ptr.ty - ptr.y) * Math.min(1, dt * 8 || 1);
      const px = ptr.on ? (ptr.x / w - 0.5) : 0; const py = ptr.on ? (ptr.y / h - 0.5) : 0;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const g of glyphs) {
        if (!reduce) {
          g.ph += dt * 0.6;
          g.x += g.vx * dt; g.y += g.vy * dt; g.rot += g.vr * dt;
          if (g.y < -50) { g.y = h + 50; g.x = Math.random() * w; }
          if (g.x < -50) g.x = w + 50; else if (g.x > w + 50) g.x = -50;
        }
        // pointer: gentle repel + glow
        let tx = 0; let ty = 0; let target = 0;
        if (ptr.on && !reduce) {
          const dx = g.x + g.ox - ptr.x; const dy = g.y + g.oy - ptr.y; const d = Math.hypot(dx, dy);
          if (d < PUSH && d > 0.5) { const f = (1 - d / PUSH); tx = (dx / d) * f * 34; ty = (dy / d) * f * 34; target = f; }
        }
        g.ox += (tx - g.ox) * Math.min(1, dt * 5); g.oy += (ty - g.oy) * Math.min(1, dt * 5);
        g.glow += (target - g.glow) * Math.min(1, dt * 6);
        const par = (g.z - 0.5) * 26;                    // depth parallax
        const x = g.x + g.ox - px * par; const y = g.y + g.oy - py * par * 0.6;
        const base = ink.light ? 0.10 + g.z * 0.16 : 0.08 + g.z * 0.2;
        const a = Math.min(0.95, base * (0.75 + 0.25 * Math.sin(g.ph)) + g.glow * 0.7);
        ctx.save();
        ctx.translate(x, y); ctx.rotate(g.rot + g.glow * 0.15);
        ctx.font = '700 ' + g.size.toFixed(1) + 'px ' + FONT;
        if (g.glow > 0.05) { ctx.shadowColor = 'rgba(' + ink.rgb + ',' + (g.glow * 0.8).toFixed(2) + ')'; ctx.shadowBlur = 16 * g.glow; }
        ctx.fillStyle = 'rgba(' + ink.rgb + ',' + a.toFixed(3) + ')';
        ctx.fillText(g.ch, 0, 0);
        ctx.restore();
        g.sx = x; g.sy = y;
      }
      // thin threads from the pointer to nearby letters + soft halo
      if (ptr.on && !reduce) {
        const R = 150;
        ctx.lineWidth = 1;
        for (const g of glyphs) {
          const d = Math.hypot(g.sx - ptr.x, g.sy - ptr.y);
          if (d < R) {
            ctx.strokeStyle = 'rgba(' + ink.rgb + ',' + ((1 - d / R) * 0.45).toFixed(3) + ')';
            ctx.beginPath(); ctx.moveTo(ptr.x, ptr.y); ctx.lineTo(g.sx, g.sy); ctx.stroke();
          }
        }
        const gr = ctx.createRadialGradient(ptr.x, ptr.y, 0, ptr.x, ptr.y, 90);
        gr.addColorStop(0, 'rgba(' + ink.rgb + ',.22)'); gr.addColorStop(1, 'rgba(' + ink.rgb + ',0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(ptr.x, ptr.y, 90, 0, 6.283); ctx.fill();
      }
      // click: expanding ring + burst of little letters
      rings = rings.filter((r) => (r.age += dt) < 1.2);
      for (const r of rings) {
        ctx.strokeStyle = 'rgba(' + ink.rgb + ',' + (0.55 * (1 - r.age / 1.2)).toFixed(3) + ')'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(r.x, r.y, r.age * 150, 0, 6.283); ctx.stroke();
      }
      bursts = bursts.filter((b) => (b.life += dt) < b.max);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const b of bursts) {
        b.x += b.vx * dt; b.y += b.vy * dt; b.vx *= 0.95; b.vy *= 0.95; b.rot += b.vr * dt;
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot);
        ctx.font = '700 ' + b.size + 'px ' + FONT;
        ctx.fillStyle = 'rgba(' + ink.rgb + ',' + (0.9 * (1 - b.life / b.max)).toFixed(3) + ')';
        ctx.shadowColor = 'rgba(' + ink.rgb + ',.6)'; ctx.shadowBlur = 10;
        ctx.fillText(b.ch, 0, 0); ctx.restore();
      }
    }

    const toLocal = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const onMove = (e) => { const p = toLocal(e); ptr.tx = p.x; ptr.ty = p.y; if (!ptr.on) { ptr.x = p.x; ptr.y = p.y; } ptr.on = p.y < h + 40; };
    const onLeave = () => { ptr.on = false; };
    const onDown = (e) => {
      if (e.target.closest && e.target.closest('button, a, input, label, [role="button"], .avatar-upload')) return;
      const p = toLocal(e);
      if (p.y > h + 20 || p.y < -20) return;
      const y = Math.min(p.y, h);
      ptr.on = true; ptr.tx = ptr.x = p.x; ptr.ty = ptr.y = y;
      rings.push({ x: p.x, y, age: 0 });
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * 6.283 + Math.random() * 0.5; const sp = 50 + Math.random() * 80;
        bursts.push({ x: p.x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 4,
          size: 16 + Math.round(Math.random() * 14), ch: LETTERS[Math.floor(Math.random() * LETTERS.length)], life: 0, max: 0.9 + Math.random() * 0.6 });
      }
      if (reduce) draw(0);
    };
    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerleave', onLeave);
    host.addEventListener('pointerdown', onDown);

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden) { last = now; return; }
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      draw(dt);
    };
    const start = () => { resize(); if (!reduce) raf = requestAnimationFrame(frame); };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(cv);
    const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(([en]) => { visible = en.isIntersecting; }) : null;
    if (io) io.observe(cv);
    const mo = new MutationObserver(() => { ink = readInk(); if (reduce) draw(0); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    let dead = false;
    const fonts = document.fonts && document.fonts.load ? document.fonts.load('700 40px Amiri', LETTERS.join('')) : Promise.resolve();
    fonts.catch(() => {}).then(() => { if (!dead) start(); });
    return () => {
      dead = true; cancelAnimationFrame(raf); if (ro) ro.disconnect(); if (io) io.disconnect(); mo.disconnect();
      host.removeEventListener('pointermove', onMove); host.removeEventListener('pointerleave', onLeave); host.removeEventListener('pointerdown', onDown);
    };
  }, []);

  return (
    <div className="pv-cover pvc">
      <div className="pvc-layers" aria-hidden="true">
        <span className="pvc-glow" />
        <span className="pvc-lattice" />
        <span className="pvc-word" key={wi}>{WORDS[wi]}</span>
        <svg className="pvc-orn pvc-orn-l" viewBox="0 0 80 80" width="64" height="64"><path d="M4 76V30C4 16 16 4 30 4h46" /><path d="M14 76V34c0-10 10-20 20-20h42" /><path d="M30 30l7 7-7 7-7-7z" /><circle cx="30" cy="30" r="2" /></svg>
        <svg className="pvc-orn pvc-orn-r" viewBox="0 0 80 80" width="64" height="64"><path d="M4 76V30C4 16 16 4 30 4h46" /><path d="M14 76V34c0-10 10-20 20-20h42" /><path d="M30 30l7 7-7 7-7-7z" /><circle cx="30" cy="30" r="2" /></svg>
        <span className="pvc-arches" />
        <canvas ref={cvRef} className="pvc-canvas" />
        <span className="pvc-vignette" />
      </div>
    </div>
  );
}
