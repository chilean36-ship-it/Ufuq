import { useCallback, useEffect, useState } from 'react';
import { useCabinetI18n } from '../../../context/CabinetI18nContext';
import { supabase } from '../../../lib/supabaseClient';
import useLiveRefresh from '../../../lib/liveRefresh';
import { MIDTERM_MAX, FINAL_MAX, LEVEL_MAX, PASS_MARK, fmtPts } from '../../../lib/scoring';

/** Student's per-level result: Midterm (50) + Final (100) = 150, pass mark 75. Data: my_level_results() RPC. */
export default function LevelResults({ userId }) {
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

  if (!rows || rows.length === 0) return null;
  return (
    <section className="lvr" aria-label={t('Level results')}>
      <h3 className="lvr-h">{t('Level results')}</h3>
      <div className="lvr-grid">
        {rows.map((r) => {
          const status = r.passed ? 'pass' : (r.complete ? 'fail' : 'wait');
          return (
            <article className={'lvr-card ' + status} key={r.level}>
              <div className="lvr-top">
                <b>{t('Level')} {r.level}</b>
                <span className={'lvr-badge ' + status}>
                  {r.passed ? t('Passed') : (r.complete ? t('Not passed') : t('In progress'))}
                </span>
              </div>
              <div className="lvr-total"><b>{fmtPts(r.total_points)}</b><small>/ {LEVEL_MAX}</small></div>
              <div className="lvr-parts">
                <span>{t('Midterm')}: <b>{r.midterm_done ? fmtPts(r.midterm_points) : '\u2014'}</b> / {MIDTERM_MAX}</span>
                <span>{t('Final exam')}: <b>{r.final_done ? fmtPts(r.final_points) : '\u2014'}</b> / {FINAL_MAX}</span>
              </div>
              {moves[r.level] && moves[r.level].to_level !== r.level && <p className="lvr-note">{t('Moved to')}: {t('Level')} {moves[r.level].to_level}</p>}
              <p className="lvr-note">{t('Pass mark')}: {PASS_MARK} / {LEVEL_MAX}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
