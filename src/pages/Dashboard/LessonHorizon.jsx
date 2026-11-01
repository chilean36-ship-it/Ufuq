import { useEffect, useRef, useState } from 'react';
import { DAY_NAME_BY_JS, formatLocalTime } from './weekUtils';

/**
 * "Lesson horizon" — the hero of My Group.
 * A half-circle arc stands for the lesson day: before class the sun waits at the left horizon and climbs as the
 * start gets closer; during class it travels across the arc as the lesson progresses. The big number is a live
 * countdown (to the start, or to the end while the lesson is on).
 *
 * `resolve(nowMs)` is supplied by MyGroupView and returns { kind: 'live' | 'next' | 'none', start, end }.
 * The clock ticks here, so the rest of the page (chat, roster) does not re-render every second.
 */

const CX = 150;
const CY = 116;
const R = 108;
const ARC = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`;
const DAY_MS = 24 * 60 * 60 * 1000;

const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const pad = (n) => String(n).padStart(2, '0');
const pointAt = (p) => ({ x: CX - R * Math.cos(Math.PI * p), y: CY - R * Math.sin(Math.PI * p) });

function clock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return (h > 0 ? pad(h) + ':' : '') + pad(m) + ':' + pad(s % 60);
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function LessonHorizon({ t, groupName, resolve, onKindChange, teacher = false }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) setNow(Date.now()); }, 1000);
    return () => clearInterval(id);
  }, []);

  const st = resolve(now) || { kind: 'none' };
  const kind = st.kind;
  const start = st.start ? +st.start : 0; // epoch ms
  const end = st.end ? +st.end : 0;

  useEffect(() => { if (onKindChange) onKindChange(kind); }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  // Where the sun should be (0 = left horizon, 1 = right horizon).
  let target = 0;
  if (kind === 'live') target = 0.12 + 0.83 * clamp((now - start) / Math.max(1, end - start), 0, 1);
  else if (kind === 'next') target = 0.02 + 0.1 * (1 - clamp((start - now) / DAY_MS, 0, 1));

  // The sun glides to its place once when the page opens, and eases whenever the target moves.
  const [p, setP] = useState(0);
  const pRef = useRef(0);
  useEffect(() => {
    if (prefersReducedMotion()) { pRef.current = target; setP(target); return undefined; }
    const from = pRef.current;
    const t0 = performance.now();
    const dur = from === 0 ? 1400 : 600;
    let raf;
    const step = (ts) => {
      const k = clamp((ts - t0) / dur, 0, 1);
      const e = 1 - Math.pow(1 - k, 3);
      pRef.current = from + (target - from) * e;
      setP(pRef.current);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target.toFixed(3)]); // eslint-disable-line react-hooks/exhaustive-deps

  const sun = pointAt(p);

  let status; let big; let sub;
  if (kind === 'live') {
    status = t('Live now');
    big = clock(end - now);
    sub = t('left in this lesson');
  } else if (kind === 'next') {
    const ms = start - now;
    status = t(ms <= 3600000 ? 'Starting soon' : 'Next lesson');
    if (ms < DAY_MS) {
      big = clock(ms);
      sub = t(teacher ? 'until the next lesson' : 'until your next lesson');
    } else {
      const d = Math.floor(ms / DAY_MS);
      const h = Math.floor((ms % DAY_MS) / 3600000);
      big = t('{d}d {h}h').replace('{d}', d).replace('{h}', h);
      sub = t(DAY_NAME_BY_JS[new Date(start).getDay()]) + ', ' + formatLocalTime(new Date(start));
    }
  } else {
    status = t('No lesson scheduled');
    big = '—';
    sub = teacher ? t('No lessons scheduled yet.') : t("Your teacher hasn't scheduled the next lesson yet.");
  }

  return (
    <div className={'lh lh-' + kind}>
      <div className="lh-chip" role="status">
        <span className="lh-chip-dot" aria-hidden="true" />
        <span>{status}</span>
      </div>

      <div className="lh-stage">
        <svg viewBox="0 0 300 124" className="lh-arc" aria-hidden="true" focusable="false">
          <line className="lh-horizon" x1="0" y1={CY} x2="300" y2={CY} />
          <path className="lh-track" d={ARC} />
          {kind !== 'none' && <path className="lh-trail" d={ARC} pathLength="1" strokeDasharray="1" strokeDashoffset={1 - p} />}
          {kind !== 'none' && (
            <g transform={`translate(${sun.x.toFixed(2)} ${sun.y.toFixed(2)})`}>
              <circle className="lh-sun-glow" r="17" />
              <circle className="lh-sun" r="6.5" />
            </g>
          )}
        </svg>
        <div className="lh-center" role="timer" aria-label={status + ' ' + big}>
          <div className="lh-count">{big}</div>
          <div className="lh-count-label">{sub}</div>
        </div>
      </div>

      <h2 className="my-group-name lh-name" id="pageGroupName">{groupName || '—'}</h2>
    </div>
  );
}
