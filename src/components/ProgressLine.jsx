import { useEffect, useMemo, useRef, useState } from 'react';
import { useCabinetI18n } from '../context/CabinetI18nContext';

/**
 * The student's Progress picture: ONE line graph of the exam results (0-100 %) in time order. The latest result and how it
 * changed sit on top, a small switch chooses the last 3 months or everything; tap / hover a dot to see the exam and the date.
 * items: [{ id, title, pct, score, total, at }]  (as returned by getExamHistory()).
 */
/** Monotone cubic (Fritsch–Carlson) path through [x,y] points — smooth, never overshoots the 0–100 range. */
export function smoothPath(pts) {
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) return `M${pts[0][0]} ${pts[0][1]}`;
  const dx = [], m = [], tan = new Array(n);
  for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0] || 1e-6; m[i] = (pts[i + 1][1] - pts[i][1]) / dx[i]; }
  tan[0] = m[0]; tan[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) tan[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { tan[i] = 0; tan[i + 1] = 0; continue; }
    const a = tan[i] / m[i], b = tan[i + 1] / m[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); tan[i] = k * a * m[i]; tan[i + 1] = k * b * m[i]; }
  }
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${(pts[i][0] + h).toFixed(1)} ${(pts[i][1] + tan[i] * h).toFixed(1)} ${(pts[i + 1][0] - h).toFixed(1)} ${(pts[i + 1][1] - tan[i + 1] * h).toFixed(1)} ${pts[i + 1][0].toFixed(1)} ${pts[i + 1][1].toFixed(1)}`;
  }
  return d;
}

const LOCALES = { UZ: 'uz', RU: 'ru', AR: 'ar', EN: 'en' };

export const LINE_CSS = `
.pl{ display:grid; gap:14px; }
.pl-top{ display:flex; align-items:flex-end; justify-content:space-between; gap:12px; flex-wrap:wrap; }
.pl-now{ display:flex; align-items:baseline; gap:12px; }
.pl-now b{ font-family:'Fraunces',serif; font-size:44px; line-height:1; color:var(--gold-bright); }
.pl-now i{ font-style:normal; font-size:14px; font-weight:700; padding:3px 10px; border-radius:99px; }
.pl-up{ background:rgba(79,193,126,.16); color:#4FC17E; } .pl-down{ background:rgba(229,120,100,.16); color:#E57864; } .pl-flat{ background:var(--bg-3); color:var(--text-muted); }
.pl-range{ display:inline-flex; gap:4px; padding:3px; border-radius:10px; background:var(--bg-3); }
.pl-range button{ border:0; background:transparent; color:var(--text-muted); padding:6px 14px; border-radius:8px; font:600 13px/1 inherit; cursor:pointer; }
.pl-range button.on{ background:var(--gold); color:#171717; }
.pl-box{ position:relative; border-radius:12px; outline:none; touch-action:pan-y; }
.pl-box:focus-visible{ box-shadow:0 0 0 2px var(--gold); }
.pl-svg{ width:100%; height:auto; display:block; overflow:visible; user-select:none; }
.pl-grid{ stroke:var(--line); stroke-width:1; }
.pl-pass{ stroke:var(--gold); stroke-width:1; stroke-dasharray:4 5; opacity:.5; }
.pl-axis{ fill:var(--text-muted); font-size:12px; }
.pl-line{ fill:none; stroke:var(--gold); stroke-width:3.4; stroke-linecap:round; stroke-linejoin:round; stroke-dasharray:1; stroke-dashoffset:1; animation:plDraw 1s ease forwards; }
.pl-area{ opacity:0; animation:plFade .8s .3s ease forwards; }
.pl-dot{ fill:var(--bg-2); stroke:var(--gold); stroke-width:3; cursor:pointer; transition:r .15s ease; }
.pl-dot.last{ fill:var(--gold); }
.pl-cross{ stroke:var(--gold); stroke-width:1; stroke-dasharray:3 3; opacity:.6; }
.pl-tip{ position:absolute; pointer-events:none; z-index:3; padding:9px 13px; border-radius:11px; background:var(--bg-3); border:1px solid var(--line); box-shadow:0 10px 26px rgba(0,0,0,.35); font-size:13px; white-space:nowrap; }
.pl-tip b{ color:var(--gold-bright); font-size:17px; margin-inline-end:6px; } .pl-tip small{ color:var(--text-muted); }
.pl-compact .pl-now b{ font-size:32px; } .pl-compact .pl-now i{ font-size:12.5px; } .pl-compact .pl-range button{ padding:5px 11px; font-size:12px; }
.pl-empty{ padding:46px 0; text-align:center; color:var(--text-muted); font-size:14.5px; }
@keyframes plDraw{ to{ stroke-dashoffset:0; } } @keyframes plFade{ to{ opacity:1; } }
@media (max-width:520px){ .pl-now b{ font-size:36px; } }
@media (prefers-reduced-motion:reduce){ .pl-line, .pl-area{ animation:none; stroke-dashoffset:0; opacity:1; } }
`;

export default function ProgressLine({ items, compact = false }) {
  const { t, lang } = useCabinetI18n();
  const locale = LOCALES[lang] || 'en';
  const [range, setRange] = useState(null);      // '3m' | 'all' | null = decided from the data
  const [hover, setHover] = useState(null);
  const rootRef = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = rootRef.current; if (!el) return undefined;
    const read = () => setWidth(Math.round(el.getBoundingClientRect().width));
    read();
    if (typeof ResizeObserver === 'undefined') { window.addEventListener('resize', read); return () => window.removeEventListener('resize', read); }
    const ro = new ResizeObserver(read); ro.observe(el); return () => ro.disconnect();
  }, []);

  const data = useMemo(() => (items || []).map((d) => ({ ...d, ts: new Date(d.at).getTime() })).filter((d) => !Number.isNaN(d.ts)).sort((a, b) => a.ts - b.ts), [items]);
  const threeAgo = useMemo(() => { const d = new Date(); d.setMonth(d.getMonth() - 3); d.setHours(0, 0, 0, 0); return d.getTime(); }, []);
  const recent = useMemo(() => data.filter((d) => d.ts >= threeAgo), [data, threeAgo]);
  const mode = range || (recent.length >= 2 ? '3m' : 'all');
  const pts = mode === '3m' ? recent : data;

  const latest = data.length ? data[data.length - 1] : null;
  const prev = data.length > 1 ? data[data.length - 2] : null;
  const delta = latest && prev ? latest.pct - prev.pct : null;

  // geometry
  const W = Math.max(280, width || 640);
  const H = compact ? Math.round(Math.min(260, Math.max(190, W * 0.62))) : Math.round(Math.min(380, Math.max(220, W * 0.42)));
  const L = 40, R = 18, T = 14, B = 30;
  const t0 = mode === '3m' ? threeAgo : (pts.length ? pts[0].ts : 0);
  const t1 = mode === '3m' ? Date.now() : (pts.length ? pts[pts.length - 1].ts : 1);
  const span = Math.max(1, t1 - t0);
  const xp = (ts) => (pts.length === 1 && mode === 'all' ? (L + W - R) / 2 : L + ((ts - t0) / span) * (W - L - R));
  const yp = (p) => T + ((100 - p) * (H - T - B)) / 100;
  const P = pts.map((d) => [xp(d.ts), yp(d.pct)]);
  const line = smoothPath(P);
  const area = P.length > 1 ? line + ` L${P[P.length - 1][0].toFixed(1)} ${H - B} L${P[0][0].toFixed(1)} ${H - B} Z` : '';

  // month labels under the line (at most ~6)
  const ticks = useMemo(() => {
    const out = []; const d = new Date(t0); d.setDate(1); d.setHours(0, 0, 0, 0);
    if (d.getTime() < t0) d.setMonth(d.getMonth() + 1);
    while (d.getTime() <= t1 && out.length < 40) { out.push({ ts: d.getTime(), text: d.toLocaleDateString(locale, { month: 'short' }) }); d.setMonth(d.getMonth() + 1); }
    const step = Math.max(1, Math.ceil(out.length / 6));
    return out.filter((_, i) => i % step === 0);
  }, [t0, t1, locale]);

  // the details bubble shows only while the pointer is over a dot (or after a tap on a phone), never by itself
  const active = hover != null && hover < pts.length ? hover : null;
  const shown = active != null ? pts[active] : null;
  const boxRef = useRef(null);
  useEffect(() => {
    if (hover == null) return undefined;
    const away = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setHover(null); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [hover]);
  // the dot under the pointer; null when the pointer is not close to any dot (the bubble then disappears)
  function nearest(clientX, clientY) {
    const el = boxRef.current; if (!el || !P.length) return null;
    const r = el.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    const py = ((clientY - r.top) / r.height) * H;
    let best = null, bd = Infinity;
    P.forEach((p, i) => { const dd = Math.hypot(p[0] - px, p[1] - py); if (dd < bd) { bd = dd; best = i; } });
    return bd <= 26 ? best : null;
  }

  return (
    <div className={'pl' + (compact ? ' pl-compact' : '')} ref={rootRef}>
      <div className="pl-top">
        <div className="pl-now">
          <b>{latest ? latest.pct + '%' : '—'}</b>
          {delta !== null && <i className={delta > 0 ? 'pl-up' : delta < 0 ? 'pl-down' : 'pl-flat'}>{delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : '▬ '}{delta}%</i>}
        </div>
        <div className="pl-range" role="tablist" aria-label={t('Period')}>
          <button type="button" role="tab" aria-selected={mode === '3m'} className={mode === '3m' ? 'on' : ''} onClick={() => { setRange('3m'); setHover(null); }}>{t('3 months')}</button>
          <button type="button" role="tab" aria-selected={mode === 'all'} className={mode === 'all' ? 'on' : ''} onClick={() => { setRange('all'); setHover(null); }}>{t('All')}</button>
        </div>
      </div>

      {pts.length === 0 ? <div className="pl-empty">{t('No exams in this period.')}</div> : (
        <div className="pl-box" ref={boxRef} tabIndex={0} role="img" aria-label={t('Exam results over time')}
             onMouseMove={(e) => setHover(nearest(e.clientX, e.clientY))} onMouseLeave={() => setHover(null)}
             onTouchStart={(e) => setHover(nearest(e.touches[0].clientX, e.touches[0].clientY))}
             onKeyDown={(e) => {
               if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
               e.preventDefault();
               const cur = active == null ? (e.key === 'ArrowRight' ? -1 : pts.length) : active;
               setHover(Math.min(pts.length - 1, Math.max(0, cur + (e.key === 'ArrowRight' ? 1 : -1))));
             }}>
          <svg key={mode} className="pl-svg" viewBox={`0 0 ${W} ${H}`}>
            <defs><linearGradient id="plFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--gold)" stopOpacity=".32" /><stop offset="100%" stopColor="var(--gold)" stopOpacity="0" /></linearGradient></defs>
            {[0, 50, 100].map((v) => <g key={v}><line className="pl-grid" x1={L} x2={W - R} y1={yp(v)} y2={yp(v)} /><text className="pl-axis" x={L - 8} y={yp(v) + 4} textAnchor="end">{v}</text></g>)}
            {ticks.map((tk) => <text key={tk.ts} className="pl-axis" x={xp(tk.ts)} y={H - 8} textAnchor="middle">{tk.text}</text>)}
            {P.length > 1 && <path className="pl-area" d={area} fill="url(#plFill)" />}
            {P.length > 1 && <path className="pl-line" d={line} pathLength="1" />}
            {active != null && P[active] && <line className="pl-cross" x1={P[active][0]} x2={P[active][0]} y1={T} y2={H - B} />}
            {P.map((p, i) => <circle key={pts[i].id + '-' + i} className={'pl-dot' + (i === pts.length - 1 ? ' last' : '')} cx={p[0]} cy={p[1]} r={active === i ? 9 : 6} />)}
          </svg>
          {shown && P[active] && (
            <div className="pl-tip" style={{ left: Math.min(Math.max((P[active][0] / W) * 100, 16), 84) + '%', top: (P[active][1] / H) * 100 + '%', transform: 'translate(-50%,-135%)' }}>
              <b>{shown.pct}%</b><small>{new Date(shown.ts).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })}</small>
              {shown.title ? <><br /><small dir="auto">{shown.title}</small></> : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
