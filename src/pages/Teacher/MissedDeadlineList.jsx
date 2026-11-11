import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import useLiveRefresh from '../../lib/liveRefresh';
import { usePanel } from '../../components/panel/PanelContext';
import { Modal } from '../../components/panel/ui';

/** Teacher + admin Exams page: students whose group closed before they finished the level exams.
 *  They have no group; they wait here (and cannot join one by code) until staff decide:
 *  extend (this student only: he sees the exam in his Exams page), one level down, move to a running group, or remove.
 *  Server: staff_missed_list / staff_resolve_missed (supabase/migrations/20261201d_closed_group_empties_itself.sql). */
const CSS = `
.md-box{ border:1px solid rgba(224,102,79,.45); background:rgba(224,102,79,.07); border-radius:14px; padding:14px 16px; margin-bottom:16px; }
.md-box h3{ margin:0 0 4px; font-size:1rem; }
.md-row{ display:flex; align-items:center; gap:10px 12px; flex-wrap:wrap; padding:10px 0; border-top:1px solid rgba(128,128,128,.2); }
.md-who{ flex:1 1 220px; min-width:0; } .md-who small{ display:block; opacity:.7; overflow:hidden; text-overflow:ellipsis; }
.md-tags{ display:flex; gap:6px; flex-wrap:wrap; }
.md-tag{ font-size:.75rem; padding:2px 9px; border-radius:99px; background:rgba(128,128,128,.18); }
.md-tag.ext{ background:rgba(60,190,120,.18); }
`;

export default function MissedDeadlineList() {
  const { t, toast, askConfirm } = usePanel();
  const [rows, setRows] = useState([]);
  const [target, setTarget] = useState(null);
  const [mode, setMode] = useState('extend');
  const [groups, setGroups] = useState([]);
  const [pick, setPick] = useState('');
  const [until, setUntil] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('staff_missed_list');
    if (!error) setRows(Array.isArray(data) ? data : []);   // before the migration is applied the box stays hidden
  }, []);
  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load);

  async function open(r) {
    setTarget(r); setMode('extend'); setPick('');
    setUntil(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
    const { data } = await supabase.from('groups').select('code, name, level').eq('type', 'class').eq('is_active', true).order('name');
    setGroups(data || []);
  }
  async function run(action, extra) {
    setBusy(true);
    const { error } = await supabase.rpc('staff_resolve_missed', { p_user: target.user_id, p_action: action, ...(extra || {}) });
    setBusy(false);
    if (error) {
      const m = error.message || '';
      toast(m.includes('nothing_to_extend') ? t('There is no published midterm / final exam of his level to open.')
        : m.includes('no_lower_group') ? t('There is no running group on a lower level.')
        : m.includes('bad_date') ? t('Pick a future date (up to 180 days).') : m, 'err');
      return;
    }
    toast(t('Saved.'), 'ok'); setTarget(null); load();
  }
  function submit() {
    if (mode === 'extend') run('extend', { p_until: new Date(until + 'T23:59:59').toISOString() });
    else if (mode === 'down') run('down');
    else if (mode === 'move') { if (pick) run('move', { p_target: pick }); }
    else askConfirm(t('Remove from the list'), (target.full_name || target.email) + ' — ' + t('stays without a group. Continue?'), () => run('remove'));
  }

  if (!rows.length) return null;
  const now = Date.now();
  return (
    <div className="md-box" role="region" aria-label={t('Missed the deadline')}>
      <style>{CSS}</style>
      <h3>{t('Missed the deadline')} · {rows.length}</h3>
      <p className="hint" style={{ margin: '0 0 6px' }}>{t('Their group was closed before they finished. They have no group and cannot join one until you decide.')}</p>
      {rows.map((r) => {
        const live = r.extended_until && new Date(r.extended_until).getTime() > now;
        return (
          <div className="md-row" key={r.user_id}>
            <div className="md-who"><b>{r.full_name}</b><small>{r.email} · {r.group_name} · L{r.level}</small></div>
            <div className="md-tags">
              {(r.exams || []).map((x) => (
                <span key={x.exam_id} className={'md-tag' + (x.extended_until && new Date(x.extended_until).getTime() > now ? ' ext' : '')}>
                  {x.kind === 'midterm' ? t('Midterm') : t('Final')}: {x.status === 'submitted' || x.status === 'graded' ? t('handed in') : x.status === 'draft' ? t('not finished') : t('not taken')}
                </span>
              ))}
              {live && <span className="md-tag ext">{t('Extended until')}: {new Date(r.extended_until).toLocaleDateString()}</span>}
            </div>
            <button type="button" className="btn btn-gold btn-sm" onClick={() => open(r)}>{t('Decide')}</button>
          </div>
        );
      })}

      <Modal open={!!target} onClose={() => setTarget(null)} style={{ maxWidth: 460 }}>
        {target && (<>
          <h3>{t('Decide')}</h3>
          <p className="hint" style={{ color: 'var(--text)' }}>{target.full_name} · {target.group_name}</p>
          <div className="field"><select style={{ width: '100%' }} value={mode} onChange={(e) => setMode(e.target.value)} aria-label={t('Decide')}>
            <option value="extend">{t('Give more time (only this student)')}</option>
            <option value="down">{t('Move one level down')}</option>
            <option value="move">{t('Move to a running group')}</option>
            <option value="remove">{t('Remove from the list')}</option>
          </select></div>
          {mode === 'extend' && <>
            <div className="field"><input type="date" style={{ width: '100%' }} value={until} onChange={(e) => setUntil(e.target.value)} /></div>
            <p className="hint">{t('He will see his unfinished midterm / final in his Exams page. After it is graded the normal rule applies: pass → next level group, fail → lower level.')}</p>
          </>}
          {mode === 'move' && <div className="field"><select style={{ width: '100%' }} value={pick} onChange={(e) => setPick(e.target.value)} aria-label={t('Groups')}>
            <option value="">—</option>{groups.map((g) => <option key={g.code} value={g.code}>{g.name}</option>)}
          </select></div>}
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setTarget(null)}>{t('Cancel')}</button>
            <button className="btn btn-gold" disabled={busy || (mode === 'move' && !pick)} onClick={submit}>{t('Save')}</button>
          </div>
        </>)}
      </Modal>
    </div>
  );
}
