import { useEffect, useMemo, useRef } from 'react';

/* Hero emblem behind the sand word: a slowly turning ring of the 28 Arabic letters,
   a hairline tick dial and one orbiting spark. The lines draw themselves on load; the layers sit at different depths and
   drift a little with the pointer; a click sends a gold ripple out from the cursor. Pure SVG + CSS (see fx.css).
   Quiet under prefers-reduced-motion. */
const LETTERS = 'ا ب ت ث ج ح خ د ذ ر ز س ش ص ض ط ظ ع غ ف ق ك ل م ن ه و ي'.split(' ');
const C = 200;
const pt = (r, deg) => { const a = (deg - 90) * Math.PI / 180; return [C + r * Math.cos(a), C + r * Math.sin(a)]; };
const f = (n) => Math.round(n * 100) / 100;

export default function HeroOrnament() {
  const ref = useRef(null);

  const geo = useMemo(() => {
    const ticks = Array.from({ length: 96 }, (_, i) => {
      const long = i % 8 === 0, mid = i % 4 === 0;
      const [x1, y1] = pt(188, i * 3.75), [x2, y2] = pt(long ? 178 : mid ? 182 : 184.5, i * 3.75);
      return { d: `M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}`, long };
    });
    const letters = LETTERS.map((ch, i) => ({ ch, deg: (i * 360) / LETTERS.length }));
    const diamonds = [0, 90, 180, 270].map((d) => pt(110, d));
    return { ticks, letters, diamonds };
  }, []);

  useEffect(() => {
    const svg = ref.current;
    const host = svg && svg.closest('.hero-visual');
    if (!host) return undefined;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, visible = true;
    const cur = { x: 0, y: 0 }, tgt = { x: 0, y: 0 };

    const tick = () => {
      raf = 0;
      cur.x += (tgt.x - cur.x) * 0.08; cur.y += (tgt.y - cur.y) * 0.08;
      host.style.setProperty('--px', cur.x.toFixed(3)); host.style.setProperty('--py', cur.y.toFixed(3));
      if (visible && (Math.abs(tgt.x - cur.x) > 0.002 || Math.abs(tgt.y - cur.y) > 0.002)) raf = requestAnimationFrame(tick);
    };
    const kick = () => { if (!raf && visible) raf = requestAnimationFrame(tick); };

    const onMove = (e) => {
      if (still || e.pointerType === 'touch') return;
      const r = host.getBoundingClientRect();
      tgt.x = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2)));
      tgt.y = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2)));
      kick();
    };
    const onDown = (e) => {
      if (still) return;
      const r = host.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
      const s = document.createElement('span');
      s.className = 'ho-ripple';
      s.style.left = (e.clientX - r.left) + 'px'; s.style.top = (e.clientY - r.top) + 'px';
      s.addEventListener('animationend', () => s.remove());
      host.appendChild(s);
    };
    const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) kick(); }, { threshold: 0 });
    io.observe(host);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    return () => {
      cancelAnimationFrame(raf); io.disconnect();
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerdown', onDown);
      host.style.removeProperty('--px'); host.style.removeProperty('--py');
    };
  }, []);

  return (
    <svg ref={ref} className="ornament ho" viewBox="0 0 400 400" aria-hidden="true">
      {/* depth 1 — outer dial + letters (slow turn) */}
      <g className="ho-depth ho-d1"><g className="ho-spin ho-spin-a">
        <circle className="ho-line" pathLength="1" cx={C} cy={C} r="192" style={{ '--i': 0 }} />
        {geo.ticks.map((t, i) => <path key={i} className={'ho-tick' + (t.long ? ' long' : '')} d={t.d} />)}
        {geo.letters.map((l) => (
          <text key={l.ch} className="ho-letter" x={C} y={C - 164} textAnchor="middle" dominantBaseline="middle" transform={`rotate(${f(l.deg)} ${C} ${C})`}>{l.ch}</text>
        ))}
        <circle className="ho-line soft" pathLength="1" cx={C} cy={C} r="150" style={{ '--i': 1 }} />
      </g></g>

      {/* depth 3 — frame around the word */}
      <g className="ho-depth ho-d3">
        <circle className="ho-dash" cx={C} cy={C} r="84" />
        {geo.diamonds.map(([x, y], i) => <rect key={i} className="ho-diamond" x={f(x - 3.2)} y={f(y - 3.2)} width="6.4" height="6.4" transform={`rotate(45 ${f(x)} ${f(y)})`} />)}
      </g>

      {/* orbiting spark with a fading tail */}
      <g className="ho-orbit">
        <path className="ho-tail" d={`M${f(pt(192, -34)[0])} ${f(pt(192, -34)[1])} A192 192 0 0 1 ${C} 8`} />
        <circle className="ho-spark" cx={C} cy="8" r="3.2" />
      </g>
    </svg>
  );
}
