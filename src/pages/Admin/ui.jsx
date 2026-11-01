import { useMemo, useRef, useState } from 'react';

/* Shared building blocks of the redesigned Admin panel (styles live in admin-ui.css, scoped to body.adm). */

const ic = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
export const Ico = ({ children }) => <svg {...ic}>{children}</svg>;
export const SearchIcon = () => <Ico><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></Ico>;
export const ChevronRight = () => <Ico><path d="m9 18 6-6-6-6" /></Ico>;
export const InboxIcon = () => <Ico><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></Ico>;

/** Page heading: title, one-line description, optional actions on the right. */
export function PageHeader({ title, sub, children }) {
  return (
    <div className="a-head">
      <div><h1>{title}</h1>{sub ? <p>{sub}</p> : null}</div>
      {children ? <div className="a-head-actions">{children}</div> : null}
    </div>
  );
}

const HUES = [['#C9A24B', '#E5C878'], ['#B08A38', '#D9B968'], ['#9C8A5E', '#CFC09A'], ['#8F8678', '#C4BDB0']]; // gold + warm neutrals only
function hueOf(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return HUES[h % HUES.length]; }

/** Round avatar: photo if present, otherwise the initial on a colour derived from the name. */
export function Avatar({ name = '', src, size = 38, tone }) {
  // tone 'arabic' (gold) / 'quran' (teal) = fixed group-type colours; no tone = a colour picked from the name.
  const [c1, c2] = hueOf(name || '?');
  const style = tone ? { '--s': size + 'px' } : { '--s': size + 'px', '--h1': c1, '--h2': c2 };
  return (
    <span className={'a-avatar' + (tone ? ' tone-' + tone : '')} style={style} aria-hidden="true">
      {src ? <img src={src} alt="" /> : (name.trim().charAt(0) || '?').toUpperCase()}
    </span>
  );
}

/** Mini trend line for stat cards. */
export function Sparkline({ data, color = 'var(--gold-bright)' }) {
  const pts = data && data.length > 1 ? data : [0, 0];
  const max = Math.max(...pts, 1), min = Math.min(...pts, 0);
  const w = 96, h = 30, step = w / (pts.length - 1);
  const y = (v) => h - 3 - ((v - min) / (max - min || 1)) * (h - 6);
  const d = pts.map((v, i) => (i ? 'L' : 'M') + (i * step).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
  return (
    <svg className="a-spark" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={d + ` L${w} ${h} L0 ${h} Z`} fill={color} opacity=".12" />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** KPI card. `trend` = % change (number) or null. Becomes a button when `onClick` is passed. */
export function StatCard({ icon, label, value, tone = 'var(--gold)', trend = null, spark, onClick, loading }) {
  const Tag = onClick ? 'button' : 'div';
  const dir = trend == null ? null : trend > 0 ? 'up' : trend < 0 ? 'down' : 'flat';
  return (
    <Tag type={onClick ? 'button' : undefined} className="a-stat" style={{ '--tone': tone }} onClick={onClick}>
      <div className="a-stat-top"><span className="a-stat-ico">{icon}</span>
        {dir && <span className={'a-trend ' + dir}>{dir === 'up' ? '▲' : dir === 'down' ? '▼' : '•'} {Math.abs(trend)}%</span>}
      </div>
      {loading ? <div className="a-skel" style={{ height: 34, width: '55%', marginTop: 14 }} /> : <div className="a-stat-num">{value}</div>}
      <div className="a-stat-foot"><div className="a-stat-lbl" style={{ margin: 0 }}>{label}</div>{spark ? <Sparkline data={spark} color={tone} /> : null}</div>
    </Tag>
  );
}

/** Area/line chart with hover tooltip. data = [{ label, value }] */
export function AreaChart({ data, height = 190, color = 'var(--gold-bright)', unit = '' }) {
  const [hover, setHover] = useState(null);
  const ref = useRef(null);
  const W = 640, H = height, pl = 30, pr = 8, pt = 12, pb = 24;
  const calc = useMemo(() => {
    const max = Math.max(...data.map((d) => d.value), 1);
    const nice = max <= 4 ? 4 : Math.ceil(max / 4) * 4;
    const x = (i) => pl + (data.length > 1 ? (i / (data.length - 1)) * (W - pl - pr) : 0);
    const y = (v) => pt + (1 - v / nice) * (H - pt - pb);
    const pts = data.map((d, i) => [x(i), y(d.value)]);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    return { nice, x, y, pts, line, area: line + ` L${x(data.length - 1)} ${H - pb} L${x(0)} ${H - pb} Z` };
  }, [data, H]);
  const ticks = [0, 1, 2, 3, 4].map((i) => (calc.nice / 4) * i);
  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect();
    const rel = (e.clientX - r.left) / r.width * W;
    let best = 0, bd = 1e9;
    calc.pts.forEach((p, i) => { const dd = Math.abs(p[0] - rel); if (dd < bd) { bd = dd; best = i; } });
    setHover(best);
  };
  const gid = useMemo(() => 'g' + Math.random().toString(36).slice(2, 8), []);
  const hp = hover != null ? calc.pts[hover] : null;
  const every = Math.max(1, Math.ceil(data.length / 7));
  return (
    <div className="a-chart-wrap" ref={ref} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg className="a-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="chart">
        <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".32" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
        {ticks.map((tv, i) => (<g key={i}><line className="grid" x1={pl} x2={W - pr} y1={calc.y(tv)} y2={calc.y(tv)} strokeDasharray={i ? '3 4' : ''} /><text x={pl - 6} y={calc.y(tv) + 3} textAnchor="end">{Math.round(tv)}</text></g>))}
        <path className="area" d={calc.area} fill={`url(#${gid})`} />
        <path className="line" d={calc.line} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" pathLength="1200" style={{ '--len': 1200 }} />
        {data.map((d, i) => (i % every === 0 ? <text key={i} x={calc.x(i)} y={H - 6} textAnchor="middle">{d.label}</text> : null))}
        {hp && <><line x1={hp[0]} x2={hp[0]} y1={pt} y2={H - pb} stroke={color} strokeOpacity=".4" strokeDasharray="3 3" /><circle cx={hp[0]} cy={hp[1]} r="5" fill="var(--bg-2)" stroke={color} strokeWidth="2.5" /></>}
      </svg>
      <div className={'a-tip' + (hp ? ' on' : '')} style={hp ? { left: (hp[0] / W * 100) + '%', top: (hp[1] / H * 100) + '%' } : undefined}>
        {hp ? <>{data[hover].value}{unit}<small>{data[hover].label}</small></> : null}
      </div>
    </div>
  );
}

/** Donut with centre total + legend. items = [{ label, value, color }] */
export function Donut({ items, centerLabel, onPick }) {
  const total = items.reduce((s, i) => s + i.value, 0);
  const R = 56, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="a-donut-wrap">
      <svg className="a-donut" viewBox="0 0 150 150" role="img" aria-label={centerLabel}>
        <circle cx="75" cy="75" r={R} fill="none" stroke="var(--bg-3)" strokeWidth="16" />
        {total > 0 && items.map((it, i) => {
          const len = (it.value / total) * C;
          const el = <circle key={i} className="seg" cx="75" cy="75" r={R} fill="none" stroke={it.color} strokeWidth="16" strokeDasharray={`${Math.max(len - 2, 0)} ${C}`} strokeDashoffset={-acc} transform="rotate(-90 75 75)" onClick={onPick ? () => onPick(it) : undefined}><title>{`${it.label}: ${it.value}`}</title></circle>;
          acc += len; return el;
        })}
        <text x="75" y="76" textAnchor="middle" className="c-num">{total}</text>
        <text x="75" y="92" textAnchor="middle" className="c-lbl">{centerLabel}</text>
      </svg>
      <div className="a-legend">
        {items.map((it) => (
          <div className="a-legend-row" key={it.label} style={{ '--c': it.color }}>
            <i /><span>{it.label}</span><b>{it.value}</b><em>{total ? Math.round(it.value / total * 100) : 0}%</em>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Horizontal bars. rows = [{ label, value }] */
export function HBars({ rows, empty }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  if (!rows.length) return <EmptyState title={empty} />;
  return (
    <div className="a-hbar">
      {rows.map((r, i) => (
        <div className="a-hbar-row" key={r.label + i}>
          <span className="nm" title={r.label}>{r.label}</span>
          <div className="a-hbar-track"><div className="a-hbar-fill" style={{ '--w': (r.value / max * 100) + '%', animationDelay: i * 70 + 'ms' }} /></div>
          <span className="v">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title, hint, icon, children }) {
  return (
    <div className="a-empty">
      <span className="a-empty-ico">{icon || <InboxIcon />}</span>
      {title ? <b>{title}</b> : null}
      {hint ? <span>{hint}</span> : null}
      {children}
    </div>
  );
}

/** Segmented filter. options = [{ value, label, count }] */
export function Segmented({ options, value, onChange }) {
  return (
    <div className="a-seg" role="tablist">
      {options.map((o) => (
        <button type="button" role="tab" aria-selected={value === o.value} key={o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}{o.count != null ? <em>{o.count}</em> : null}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder }) {
  return (
    <label className="a-search"><SearchIcon />
      <input className="u-input" type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </label>
  );
}

export const Skeleton = ({ w = '100%', h = 16, style }) => <div className="a-skel" style={{ width: w, height: h, ...style }} />;
