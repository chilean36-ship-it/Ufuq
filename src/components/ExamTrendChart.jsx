import { useEffect, useMemo, useRef, useState } from 'react';
import { useCabinetI18n } from '../context/CabinetI18nContext';

/**
 * Interactive exam-progress line chart (pure SVG, no dependencies).
 *
 *  - "Monthly" (every exam of one month, x = day of month) / "Yearly" (12 monthly averages), with ‹ › navigation.
 *  - size="sm" fits a dashboard panel, size="lg" is the big full-page chart. The chart measures its own width,
 *    so text and dots keep their real pixel size on any screen.
 *  - hover / touch / arrow keys move a crosshair + tooltip; click pins a point; the line draws itself in.
 *
 * items: [{ id, title, pct, score, total, at }]  (oldest first, as returned by getExamHistory()).
 */

const LOCALES = { UZ: 'uz', RU: 'ru', AR: 'ar', EN: 'en' };
const DAY = 86400000;

export const CHART_CSS = `
.etc{ position:relative; }
.etc-bar{ display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-bottom:12px; }
.etc-nav{ display:inline-flex; align-items:center; gap:8px; }
.etc-nav button{ width:30px; height:30px; border-radius:9px; border:1px solid var(--line); background:var(--bg-3); color:var(--text); cursor:pointer; display:inline-flex; align-items:center; justify-content:center; transition:border-color .15s, transform .15s; }
.etc-nav button:hover:not(:disabled){ border-color:var(--gold); transform:translateY(-1px); }
.etc-nav button:disabled{ opacity:.35; cursor:default; }
.etc-nav svg{ width:14px; height:14px; }
.etc-period{ min-width:128px; text-align:center; font-weight:700; font-size:14px; text-transform:capitalize; }
.etc-pills{ display:inline-flex; gap:4px; padding:3px; background:var(--bg-3); border-radius:10px; }
.etc-pills button{ border:0; background:transparent; color:var(--text-muted); padding:5px 14px; border-radius:8px; font-size:12.5px; font-weight:600; cursor:pointer; transition:background .15s,color .15s; }
.etc-pills button.on{ background:var(--gold); color:#1a1405; }
.etc-kpis{ display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; margin-bottom:12px; }
.etc-kpi{ background:var(--bg-3); border:1px solid var(--line); border-radius:10px; padding:9px 10px; text-align:center; }
.etc-kpi b{ display:block; font-family:'Fraunces',serif; font-size:19px; color:var(--gold-bright); line-height:1.1; }
.etc-kpi span{ font-size:11.5px; color:var(--text-muted); }
.etc-kpi i{ display:inline-block; font-style:normal; font-size:11px; font-weight:700; margin-left:5px; padding:1px 6px; border-radius:99px; vertical-align:middle; }
.etc-up{ background:rgba(79,193,126,.15); color:#4FC17E; } .etc-down{ background:rgba(229,120,100,.15); color:#E57864; } .etc-flat{ background:var(--bg-2); color:var(--text-muted); }
.etc-box{ position:relative; outline:none; border-radius:10px; touch-action:pan-y; }
.etc-box:focus-visible{ box-shadow:0 0 0 2px var(--gold); }
.etc-svg{ width:100%; height:auto; display:block; overflow:visible; user-select:none; }
.etc-grid{ stroke:var(--line); stroke-width:1; } .etc-axis{ fill:var(--text-muted); font-size:10.5px; }
.etc-avg{ stroke:var(--text-muted); stroke-dasharray:4 4; stroke-width:1; opacity:.8; }
.etc-area{ opacity:0; animation:etcFade .8s .3s ease forwards; }
.etc-line{ fill:none; stroke:var(--gold); stroke-width:2.6; stroke-linecap:round; stroke-linejoin:round; stroke-dasharray:1; stroke-dashoffset:1; animation:etcDraw 1s ease forwards; }
.etc-dot{ fill:var(--bg-2); stroke:var(--gold); stroke-width:2.4; transition:r .15s ease, fill .15s ease; opacity:0; animation:etcFade .4s .7s ease forwards; }
.etc-dot.good{ stroke:#4FC17E; } .etc-dot.low{ stroke:#E57864; }
.etc-dot.on{ fill:var(--gold); } .etc-dot.good.on{ fill:#4FC17E; } .etc-dot.low.on{ fill:#E57864; }
.etc-cross{ stroke:var(--gold); stroke-width:1; stroke-dasharray:3 3; opacity:.7; }
.etc-tip{ position:absolute; pointer-events:none; background:var(--bg-3); border:1px solid var(--line); border-radius:10px; padding:8px 12px; font-size:12.5px; box-shadow:0 10px 26px rgba(0,0,0,.35); white-space:nowrap; z-index:3; transition:left .08s linear, top .08s linear; }
.etc-tip b{ color:var(--gold-bright); font-size:14px; } .etc-tip small{ color:var(--text-muted); }
.etc-empty{ padding:34px 0; text-align:center; font-size:13px; color:var(--text-muted); }
.etc-legend{ display:flex; gap:14px; flex-wrap:wrap; justify-content:center; margin-top:8px; font-size:11.5px; color:var(--text-muted); }
.etc-legend i{ display:inline-block; width:9px; height:9px; border-radius:50%; margin-right:5px; border:2px solid var(--gold); vertical-align:-1px; }
.etc.sm .etc-axis{ font-size:12px; }
.etc.sm .etc-kpi b{ font-size:22px; } .etc.sm .etc-kpi span{ font-size:12.5px; }
.etc.sm .etc-tip{ font-size:13px; } .etc.sm .etc-tip b{ font-size:15px; }
.etc.lg .etc-bar{ margin-bottom:18px; }
.etc.lg .etc-pills button{ font-size:14.5px; padding:8px 20px; }
.etc.lg .etc-nav button{ width:38px; height:38px; border-radius:11px; } .etc.lg .etc-nav svg{ width:17px; height:17px; }
.etc.lg .etc-period{ font-size:17px; min-width:170px; }
.etc.lg .etc-kpis{ gap:14px; margin-bottom:20px; }
.etc.lg .etc-kpi{ padding:18px 14px; border-radius:14px; }
.etc.lg .etc-kpi b{ font-size:34px; } .etc.lg .etc-kpi span{ font-size:14px; } .etc.lg .etc-kpi i{ font-size:12.5px; }
.etc.lg .etc-axis{ font-size:13px; }
.etc.lg .etc-line{ stroke-width:3.4; }
.etc.lg .etc-dot{ stroke-width:3; }
.etc.lg .etc-tip{ font-size:14.5px; padding:11px 16px; } .etc.lg .etc-tip b{ font-size:18px; }
.etc.lg .etc-empty{ font-size:15px; padding:70px 0; }
.etc.lg .etc-legend{ font-size:13px; margin-top:14px; gap:20px; }
.etc-kpi{ transition:transform .15s ease, border-color .15s ease; } .etc-kpi:hover{ transform:translateY(-2px); border-color:var(--gold); }
.etc-dot{ cursor:pointer; }
@keyframes etcDraw{ to{ stroke-dashoffset:0; } } @keyframes etcFade{ to{ opacity:1; } }
@media (prefers-reduced-motion:reduce){ .etc-line,.etc-area,.etc-dot{ animation:none; stroke-dashoffset:0; opacity:1; } }
`;

const CHEV_L = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>;
const CHEV_R = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>;

/** Monotone cubic (Fritsch–Carlson) path through [x,y] points — smooth, never overshoots the 0–100 range. */
function smoothPath(pts) {
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

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

export default function ExamTrendChart({ items, size = 'sm' }) {
  const { t, lang } = useCabinetI18n();
  const locale = LOCALES[lang] || 'en';
  const now = new Date();
  const [mode, setMode] = useState('month'); // 'month' | 'year'
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [hover, setHover] = useState(null);
  const [pinned, setPinned] = useState(null);
  const boxRef = useRef(null);
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
  const earliest = data.length ? new Date(data[0].ts) : now;

  // ---- what is on the chart for the chosen period ----
  const view = useMemo(() => {
    let pts = [], from, to, prev = [], xMax, xTicks = [];
    if (mode === 'month') {
      const start = new Date(cursor.y, cursor.m, 1).getTime(), end = new Date(cursor.y, cursor.m + 1, 1).getTime();
      const dim = new Date(cursor.y, cursor.m + 1, 0).getDate();
      pts = data.filter((d) => d.ts >= start && d.ts < end).map((d) => ({ ...d, x: (d.ts - start) / DAY, label: new Date(d.ts).toLocaleDateString(locale, { day: 'numeric', month: 'long' }) }));
      const ps = new Date(cursor.y, cursor.m - 1, 1).getTime();
      prev = data.filter((d) => d.ts >= ps && d.ts < start);
      xMax = dim;
      xTicks = [1, 5, 10, 15, 20, 25, dim].filter((v, i, a) => a.indexOf(v) === i).map((v) => ({ v: v - 1, text: String(v) }));
    } else {
      const start = new Date(cursor.y, 0, 1).getTime(), end = new Date(cursor.y + 1, 0, 1).getTime();
      const inYear = data.filter((d) => d.ts >= start && d.ts < end);
      for (let mo = 0; mo < 12; mo++) {
        const g = inYear.filter((d) => new Date(d.ts).getMonth() === mo);
        if (g.length) {
          const best = g.reduce((a, b) => (b.pct > a.pct ? b : a));
          pts.push({ id: 'm' + mo, x: mo, pct: Math.round(mean(g.map((d) => d.pct))), count: g.length, best: best.pct, title: g.length + ' ' + t('exams'), label: new Date(cursor.y, mo, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' }), isMonth: true });
        }
      }
      prev = data.filter((d) => d.ts >= new Date(cursor.y - 1, 0, 1).getTime() && d.ts < start);
      xMax = 11;
      xTicks = Array.from({ length: 12 }, (_, mo) => ({ v: mo, text: new Date(2020, mo, 1).toLocaleDateString(locale, { month: 'short' }) }));
    }
    const periodItems = pts.filter((p) => !p.isMonth).length ? pts : (mode === 'year' ? data.filter((d) => new Date(d.ts).getFullYear() === cursor.y) : pts);
    const pcts = periodItems.map((p) => p.pct);
    const avg = pcts.length ? Math.round(mean(pcts)) : null;
    const pAvg = prev.length ? Math.round(mean(prev.map((d) => d.pct))) : null;
    return { pts, xMax, xTicks, count: pcts.length, avg, best: pcts.length ? Math.max(...pcts) : null, delta: avg != null && pAvg != null ? avg - pAvg : null };
  }, [data, mode, cursor, locale, t]);

  // reset the crosshair whenever the period changes
  useEffect(() => { setHover(null); setPinned(null); }, [mode, cursor]);

  const lg = size === 'lg';
  const W = Math.max(260, width || 640);
  const H = lg ? Math.round(Math.min(480, Math.max(300, W * 0.42))) : Math.round(Math.min(300, Math.max(200, W * 0.5)));
  const L = lg ? 40 : 34, R = 16, T = 16, B = lg ? 32 : 28;
  const n = view.pts.length;
  const xp = (x) => L + Math.min(1, Math.max(0, x / view.xMax)) * (W - L - R);
  const yp = (p) => T + ((100 - p) * (H - T - B)) / 100;
  const P = view.pts.map((d, i) => [xp(d.x + i * 1e-4), yp(d.pct)]);
  const line = smoothPath(P);
  const area = n > 1 ? line + ` L${P[n - 1][0].toFixed(1)} ${H - B} L${P[0][0].toFixed(1)} ${H - B} Z` : '';
  const active = pinned != null ? pinned : hover;
  const shown = active != null ? view.pts[active] : null;

  function nearest(clientX) {
    const el = boxRef.current; if (!el || !n) return null;
    const r = el.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    let best = 0, bd = Infinity;
    P.forEach((p, i) => { const d = Math.abs(p[0] - px); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  function onKey(e) {
    if (!n) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const cur = active == null ? (e.key === 'ArrowRight' ? -1 : n) : active;
      setPinned(null); setHover(Math.min(n - 1, Math.max(0, cur + (e.key === 'ArrowRight' ? 1 : -1))));
    } else if (e.key === 'Escape') { setHover(null); setPinned(null); }
  }

  // ---- period navigation ----
  const atNow = mode === 'month' ? (cursor.y === now.getFullYear() && cursor.m === now.getMonth()) : cursor.y === now.getFullYear();
  const atStart = mode === 'month' ? (cursor.y < earliest.getFullYear() || (cursor.y === earliest.getFullYear() && cursor.m <= earliest.getMonth())) : cursor.y <= earliest.getFullYear();
  const step = (d) => setCursor((c) => (mode === 'month' ? (() => { const dt = new Date(c.y, c.m + d, 1); return { y: dt.getFullYear(), m: dt.getMonth() }; })() : { y: c.y + d, m: c.m }));
  const periodLabel = mode === 'month' ? new Date(cursor.y, cursor.m, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' }) : String(cursor.y);
  const Delta = ({ v }) => (v == null ? null : <i className={v > 0 ? 'etc-up' : v < 0 ? 'etc-down' : 'etc-flat'}>{v > 0 ? '▲ +' : v < 0 ? '▼ ' : '▬ '}{v}%</i>);
  const dotClass = (d) => (d.pct >= 80 ? ' good' : d.pct < 50 ? ' low' : '');

  return (
    <div className={'etc ' + (lg ? 'lg' : 'sm')} ref={rootRef}>
      {(
        <div className="etc-bar">
          <div className="etc-pills" role="tablist" aria-label={t('Period')}>
            <button type="button" role="tab" aria-selected={mode === 'month'} className={mode === 'month' ? 'on' : ''} onClick={() => setMode('month')}>{t('Monthly')}</button>
            <button type="button" role="tab" aria-selected={mode === 'year'} className={mode === 'year' ? 'on' : ''} onClick={() => setMode('year')}>{t('Yearly')}</button>
          </div>
          <div className="etc-nav">
            <button type="button" aria-label={t('Previous')} disabled={atStart} onClick={() => step(-1)}>{CHEV_L}</button>
            <div className="etc-period">{periodLabel}</div>
            <button type="button" aria-label={t('Next')} disabled={atNow} onClick={() => step(1)}>{CHEV_R}</button>
          </div>
        </div>
      )}

      <div className="etc-kpis">
        <div className="etc-kpi"><b>{view.count}</b><span>{t('Exams taken')}</span></div>
        <div className="etc-kpi"><b>{view.avg != null ? view.avg + '%' : '—'}</b><span>{t('Average')}<Delta v={view.delta} /></span></div>
        <div className="etc-kpi"><b>{view.best != null ? view.best + '%' : '—'}</b><span>{t('Best result')}</span></div>
      </div>

      {n === 0 ? (
        <div className="etc-empty">{t('No exams in this period.')}</div>
      ) : (
        <div className="etc-box" ref={boxRef} tabIndex={0} role="img" aria-label={t('Exam results over time')}
             onKeyDown={onKey} onBlur={() => setHover(null)}
             onMouseMove={(e) => { if (pinned == null) setHover(nearest(e.clientX)); }}
             onMouseLeave={() => setHover(null)}
             onTouchStart={(e) => { setPinned(null); setHover(nearest(e.touches[0].clientX)); }}
             onTouchMove={(e) => setHover(nearest(e.touches[0].clientX))}
             onClick={(e) => { const i = nearest(e.clientX); setPinned((cur) => (cur === i ? null : i)); setHover(i); }}>
          <svg key={mode + cursor.y + '-' + cursor.m + size} className="etc-svg" viewBox={`0 0 ${W} ${H}`}>
            <defs><linearGradient id={'etcFill' + size} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--gold)" stopOpacity=".35" /><stop offset="100%" stopColor="var(--gold)" stopOpacity="0" /></linearGradient></defs>
            {[0, 25, 50, 75, 100].map((g) => <g key={g}><line className="etc-grid" x1={L} x2={W - R} y1={yp(g)} y2={yp(g)} /><text className="etc-axis" x={L - 6} y={yp(g) + 3} textAnchor="end">{g}</text></g>)}
            {view.xTicks.map((tk) => <text key={tk.v} className="etc-axis" x={xp(tk.v)} y={H - 8} textAnchor="middle">{tk.text}</text>)}
            {view.avg != null && <><line className="etc-avg" x1={L} x2={W - R} y1={yp(view.avg)} y2={yp(view.avg)} /><text className="etc-axis" x={W - R} y={yp(view.avg) - 4} textAnchor="end">{t('Average')} {view.avg}%</text></>}
            {n > 1 && <path className="etc-area" d={area} fill={`url(#etcFill${size})`} />}
            {n > 1 && <path className="etc-line" d={line} pathLength="1" />}
            {active != null && <line className="etc-cross" x1={P[active][0]} x2={P[active][0]} y1={T} y2={H - B} />}
            {P.map((p, i) => <circle key={view.pts[i].id + i} className={'etc-dot' + dotClass(view.pts[i]) + (active === i ? ' on' : '')} cx={p[0]} cy={p[1]} r={active === i ? (lg ? 9 : 7) : (lg ? 5.5 : 4.5)} />)}
          </svg>
          {shown && (
            <div className="etc-tip" style={{ left: Math.min(Math.max((P[active][0] / W) * 100, 14), 86) + '%', top: (P[active][1] / H) * 100 + '%', transform: 'translate(-50%,-125%)' }}>
              <b>{shown.pct}%</b>{shown.isMonth ? <> · {shown.count} {t('exams')}</> : <> · {shown.score}/{shown.total}</>}<br />
              {shown.isMonth ? <small>{t('Best result')}: {shown.best}%</small> : shown.title}<br />
              <small>{shown.label}</small>
            </div>
          )}
        </div>
      )}
      {n > 0 && <div className="etc-legend"><span><i style={{ borderColor: '#4FC17E' }} />≥ 80%</span><span><i />50–79%</span><span><i style={{ borderColor: '#E57864' }} />&lt; 50%</span></div>}
    </div>
  );
}
