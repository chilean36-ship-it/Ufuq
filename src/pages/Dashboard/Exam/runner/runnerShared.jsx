import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { examMax, examPoints, fmtPts } from '../../../../lib/scoring';

export const FS_STEPS = [0.9, 1, 1.18, 1.38];   // text size levels for the question and the answer boxes
export const OFFLINE_BANNER = {
  position: 'fixed', left: '50%', bottom: 16, transform: 'translateX(-50%)', zIndex: 99990, maxWidth: '92vw',
  background: '#3A2A10', color: '#F5DEA0', border: '1px solid rgba(201,162,75,.55)', borderRadius: 12,
  padding: '10px 16px', fontSize: 14, lineHeight: 1.5, boxShadow: '0 12px 32px rgba(0,0,0,.45)',
};

/** A textarea that grows with its content, so long answers never hide behind a tiny scrolling box. */
export function Grow({ value, className, ...rest }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = (el.scrollHeight + 2) + 'px';
  }, [value]);
  return <textarea ref={ref} className={className} value={value} {...rest} />;
}

/** A two-field answer ("word\nsentence") with both parts empty is not an answer. */
export function isAnswered(v) { return !!v && v.replace(/\s+/g, '') !== ''; }
export function wordCount(v) { const m = (v || '').trim().match(/\S+/g); return m ? m.length : 0; }

/** 75 → "01:15", 3725 → "1:02:05" */
export function fmtClock(sec) {
  const v = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(v / 3600); const m = Math.floor((v % 3600) / 60); const x = v % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h > 0 ? h + ':' + p(m) + ':' + p(x) : p(m) + ':' + p(x);
}


/** The window that opens the moment the AI has checked the paper: the score out of 100, nothing else in the way. */
export function ScoreWindow({ t, total, kind, title, counts, onDetails, onBack }) {
  const target = Math.max(0, Math.min(100, Number(total) || 0));
  const [shown, setShown] = useState(0);
  useEffect(() => {
    let raf = 0;
    const reduce = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || target === 0) { setShown(target); return undefined; }
    const t0 = performance.now(); const dur = 1100;
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      setShown(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  const tone = target >= 80 ? 'good' : target >= 50 ? 'mid' : 'bad';
  const msg = target >= 80 ? t('Excellent result!') : target >= 50 ? t('Good work — you can do even better.') : t('Keep practising — you will improve.');
  return (
    <div className="xr-modal xr-scorewin" role="dialog" aria-modal="true" aria-label={t('Your result')}>
      <div className="xr-modal-box xr-scorebox">
        <div className={'xr-score ' + tone}>
          <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" className="bg" /><circle cx="60" cy="60" r="52" className="fg" style={{ strokeDasharray: (shown * 3.267) + ' 400' }} /></svg>
          <b>{fmtPts(examPoints(shown, kind))}</b><span>/ {examMax(kind)}</span>
        </div>
        <h3>{t('Your result')}: {fmtPts(examPoints(target, kind))} / {examMax(kind)}</h3>
        <p className="xr-scoremsg">{msg}</p>
        <p className="xr-scoresub" dir="auto">{t('Checked by AI')} · {title}</p>
        <div className="xr-sum">
          <div className="ok"><b>{counts.good}</b>{t('Correct')}</div>
          <div className="fl"><b>{counts.mid}</b>{t('Partial')}</div>
          <div className="no"><b>{counts.bad}</b>{t('Wrong')}</div>
        </div>
        <div className="xr-modal-actions" style={{ justifyContent: 'center' }}>
          <button type="button" className="xr-btn" onClick={onBack}>{t('Back to exams')}</button>
          <button type="button" className="xr-btn pri" onClick={onDetails} autoFocus>{t('View details')}</button>
        </div>
      </div>
    </div>
  );
}
