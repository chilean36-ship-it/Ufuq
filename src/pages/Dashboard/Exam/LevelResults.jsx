import { useCallback, useEffect, useState } from 'react';
import { useCabinetI18n } from '../../../context/CabinetI18nContext';
import { supabase } from '../../../lib/supabaseClient';
import useLiveRefresh from '../../../lib/liveRefresh';
import { MIDTERM_MAX, FINAL_MAX, LEVEL_MAX, PASS_MARK, fmtPts } from '../../../lib/scoring';

/** Student's level progress: Midterm (50) + Final (100) = 150, pass mark 75. The current level is one clear card with a
 *  progress bar and the pass mark on it; earlier levels are folded away. Data: my_level_results() RPC. */
export default function LevelResults({ userId, level }) {
  const { t } = useCabinetI18n();
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

  if (!rows) return null;
  const mine = rows.find((r) => Number(r.level) === Number(level));
  const cur = mine || (level ? { level, passed: false, complete: false, total_points: 0, midterm_done: false, final_done: false, midterm_points: 0, final_points: 0 } : null);
  const older = rows.filter((r) => !cur || Number(r.level) !== Number(cur.level)).sort((a, b) => b.level - a.level);
  if (!cur && older.length === 0) return null;

  const statusOf = (r) => (r.passed ? 'pass' : (r.complete ? 'fail' : 'wait'));
  const label = (s) => (s === 'pass' ? t('Passed') : s === 'fail' ? t('Not passed') : t('In progress'));
  const pctOf = (v) => Math.max(0, Math.min(100, (Number(v) || 0) / LEVEL_MAX * 100));

  return (
    <section className="ex2-lvl" aria-label={t('Level results')}>
      {cur && (() => {
        const st = statusOf(cur);
        return (
          <div className={'ex2-lvlcard ' + st}>
            <div className="ex2-lvl-top">
              <b>{t('Level')} {cur.level}</b>
              <span className={'ex2-lvl-badge ' + st}>{label(st)}</span>
            </div>
            <div className="ex2-lvl-total"><b>{fmtPts(cur.total_points)}</b><small>/ {LEVEL_MAX}</small></div>
            <div className="ex2-meter" role="progressbar" aria-valuemin={0} aria-valuemax={LEVEL_MAX} aria-valuenow={Number(cur.total_points) || 0}>
              <i style={{ width: pctOf(cur.total_points) + '%' }} />
              <span className="mark" style={{ left: pctOf(PASS_MARK) + '%' }}><em>{t('Pass mark')} {PASS_MARK}</em></span>
            </div>
            <div className="ex2-parts">
              <div className={cur.midterm_done ? 'done' : ''}><span>{t('Midterm')}</span><b>{cur.midterm_done ? fmtPts(cur.midterm_points) : '—'}</b><small>/ {MIDTERM_MAX}</small></div>
              <div className={cur.final_done ? 'done' : ''}><span>{t('Final exam')}</span><b>{cur.final_done ? fmtPts(cur.final_points) : '—'}</b><small>/ {FINAL_MAX}</small></div>
            </div>
            {moves[cur.level] && moves[cur.level].to_level !== cur.level && <p className="ex2-lvl-note">{t('Moved to')}: {t('Level')} {moves[cur.level].to_level}</p>}
          </div>
        );
      })()}

      {older.length > 0 && (
        <details className="ex2-older">
          <summary>{t('Earlier levels')} <i>{older.length}</i></summary>
          <div className="ex2-older-list">
            {older.map((r) => {
              const st = statusOf(r);
              return (
                <div className="ex2-older-row" key={r.level}>
                  <b>{t('Level')} {r.level}</b>
                  <span>{fmtPts(r.total_points)} / {LEVEL_MAX}</span>
                  <span className={'ex2-lvl-badge ' + st}>{label(st)}</span>
                  {moves[r.level] && moves[r.level].to_level !== r.level && <em>→ {t('Level')} {moves[r.level].to_level}</em>}
                </div>
              );
            })}
          </div>
        </details>
      )}
    </section>
  );
}
