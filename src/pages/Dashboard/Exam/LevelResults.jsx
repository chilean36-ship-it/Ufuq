import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCabinetI18n } from '../../../context/CabinetI18nContext';
import { supabase } from '../../../lib/supabaseClient';
import useLiveRefresh from '../../../lib/liveRefresh';
import { MIDTERM_MAX, FINAL_MAX, LEVEL_MAX, PASS_MARK, fmtPts } from '../../../lib/scoring';

/** Student's level progress: Midterm (50) + Final (100) = 150, pass mark 75. Data: my_level_results() RPC.
 *  useLevelResults() loads it once for the page; <LevelCard> is the compact card of the current level and
 *  <EarlierLevelsModal> (opened from the button in the page header) lists the levels already behind the student. */
export function useLevelResults(userId, level) {
  const [rows, setRows] = useState(null);
  const [moves, setMoves] = useState({});

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_level_results');
    if (error) { setRows([]); return; }
    setRows(data || []);
    const tr = await supabase.from('level_transitions').select('from_level, to_level, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(30);
    const m = {}; (tr.data || []).forEach((x) => { if (!(x.from_level in m)) m[x.from_level] = x; });
    setMoves(m);
  }, [userId]);
  useEffect(() => { if (userId) load(); }, [userId, load]);
  useLiveRefresh(load);

  if (!rows) return { ready: false, cur: null, older: [], moves };
  const mine = rows.find((r) => Number(r.level) === Number(level));
  const cur = mine || (level ? { level, passed: false, complete: false, total_points: 0, midterm_done: false, final_done: false, midterm_points: 0, final_points: 0 } : null);
  const older = rows.filter((r) => !cur || Number(r.level) !== Number(cur.level)).sort((a, b) => b.level - a.level);
  return { ready: true, cur, older, moves };
}

const statusOf = (r) => (r.passed ? 'pass' : (r.complete ? 'fail' : 'wait'));
const pctOf = (v, max) => Math.max(0, Math.min(100, (Number(v) || 0) / max * 100));

function Ring({ value, size = 76, stroke = 8 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = pctOf(value, LEVEL_MAX);
  const passAngle = (PASS_MARK / LEVEL_MAX) * 360 - 90;   // where the pass mark sits on the ring
  const px = size / 2 + r * Math.cos((passAngle * Math.PI) / 180);
  const py = size / 2 + r * Math.sin((passAngle * Math.PI) / 180);
  return (
    <svg className="ex2-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="trk" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" className="val"
              strokeDasharray={c} strokeDashoffset={c - (c * p) / 100} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <circle cx={px} cy={py} r={stroke / 2 + 1.5} className="pass" />
    </svg>
  );
}

/** One slim card for the current level: a ring with the total, the two exams as small bars; tap it for the details. */
export function LevelCard({ data }) {
  const { t } = useCabinetI18n();
  const [open, setOpen] = useState(false);
  const cur = data && data.cur;
  if (!data || !data.ready || !cur) return null;
  const st = statusOf(cur);
  const label = st === 'pass' ? t('Passed') : st === 'fail' ? t('Not passed') : t('In progress');
  const total = Number(cur.total_points) || 0;
  const need = Math.max(0, PASS_MARK - total);
  const mv = data.moves[cur.level];
  const parts = [
    { key: 'm', name: t('Midterm'), done: cur.midterm_done, pts: cur.midterm_points, max: MIDTERM_MAX },
    { key: 'f', name: t('Final exam'), done: cur.final_done, pts: cur.final_points, max: FINAL_MAX },
  ];
  return (
    <section className={'ex2-lv ' + st + (open ? ' open' : '')} aria-label={t('Level results')}>
      <button type="button" className="ex2-lv-main" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="ex2-ring-wrap">
          <Ring value={total} />
          <span className="ex2-ring-num"><b>{fmtPts(total)}</b><small>/ {LEVEL_MAX}</small></span>
        </span>
        <span className="ex2-lv-body">
          <span className="ex2-lv-head"><b>{t('Level')} {cur.level}</b><span className={'ex2-lvl-badge ' + st}>{label}</span></span>
          <span className="ex2-lv-bars">
            {parts.map((p) => (
              <span className="ex2-lv-bar" key={p.key}>
                <span className="n">{p.name}<em>{p.done ? fmtPts(p.pts) : '—'} / {p.max}</em></span>
                <span className="track"><i style={{ width: p.done ? pctOf(p.pts, p.max) + '%' : '0%' }} /></span>
              </span>
            ))}
          </span>
        </span>
        <svg className="ex2-lv-chev" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="ex2-lv-more">
          <p>{st === 'pass'
            ? t('Level passed. Well done!')
            : need > 0
              ? t('{n} more points to pass').replace('{n}', fmtPts(need))
              : t('Pass mark reached')}
            <span> · {t('Pass mark')}: {PASS_MARK} / {LEVEL_MAX}</span></p>
          {mv && mv.to_level !== cur.level && <p>{t('Moved to')}: {t('Level')} {mv.to_level}</p>}
        </div>
      )}
    </section>
  );
}

/** Pop-up with every earlier level: score ring-less rows with the two exams and the level the student moved to. */
export function EarlierLevelsModal({ data, onClose }) {
  const { t } = useCabinetI18n();
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  const older = data.older;
  const passedN = older.filter((r) => r.passed).length;
  return createPortal(
    <div className="ex2-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ex2-modal" role="dialog" aria-modal="true" aria-label={t('Earlier levels')}>
        <div className="ex2-modal-head">
          <div>
            <h3>{t('Earlier levels')}</h3>
            <p>{passedN} / {older.length} {t('Passed').toLowerCase()}</p>
          </div>
          <button type="button" className="ex2-modal-x" onClick={onClose} aria-label={t('Close')}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div className="ex2-modal-list">
          {older.map((r) => {
            const st = statusOf(r);
            const label = st === 'pass' ? t('Passed') : st === 'fail' ? t('Not passed') : t('In progress');
            const mv = data.moves[r.level];
            return (
              <article className={'ex2-old ' + st} key={r.level}>
                <div className="ex2-old-top">
                  <span className="ex2-old-lvl">{r.level}</span>
                  <div className="ex2-old-mid">
                    <b>{t('Level')} {r.level}</b>
                    {mv && mv.to_level !== r.level && <em>→ {t('Level')} {mv.to_level}</em>}
                  </div>
                  <span className={'ex2-lvl-badge ' + st}>{label}</span>
                </div>
                <div className="ex2-old-total"><b>{fmtPts(r.total_points)}</b><small>/ {LEVEL_MAX}</small>
                  <span className="track"><i style={{ width: pctOf(r.total_points, LEVEL_MAX) + '%' }} /><u style={{ left: pctOf(PASS_MARK, LEVEL_MAX) + '%' }} /></span>
                </div>
                <div className="ex2-old-parts">
                  <span>{t('Midterm')}: <b>{r.midterm_done ? fmtPts(r.midterm_points) : '—'}</b> / {MIDTERM_MAX}</span>
                  <span>{t('Final exam')}: <b>{r.final_done ? fmtPts(r.final_points) : '—'}</b> / {FINAL_MAX}</span>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
