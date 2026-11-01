import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useCabinetI18n } from '../../context/CabinetI18nContext';
import useLiveRefresh from '../../lib/liveRefresh';

/**
 * Shown to a student whose group was switched off (its final-exam deadline passed and he did not hand the exam in).
 * The closed group is hidden everywhere else; this card only explains that the teacher will decide.
 * It also asks the server to close any group whose deadline has just passed (the server does it by itself every minute too).
 */
export default function ClosedGroupNotice() {
  const { t } = useCabinetI18n();
  const [rows, setRows] = useState([]);

  const load = async () => {
    try {
      await supabase.rpc('ufuq_sweep_group_deadlines');
      const { data, error } = await supabase.rpc('my_closed_groups');
      if (!error) setRows(Array.isArray(data) ? data : []);
    } catch (e) { /* non-fatal: no notice */ }
  };
  useEffect(() => { load(); }, []);
  useLiveRefresh(() => load());

  if (!rows.length) return null;
  return (
    <div className="panel" role="status" style={{ marginBottom: 14, borderColor: 'var(--gold)' }}>
      <div className="panel-head"><h3>{t('Your group is closed')}</h3></div>
      <p style={{ margin: '4px 0 6px' }}>{t('The final exam deadline has passed, so this group is closed:')} <b>{rows.map((r) => r.name).join(', ')}</b></p>
      <p className="muted" style={{ margin: 0 }}>{t('Your teacher will decide what happens next: open the exam for you again, move you to a lower level, or remove you from the group.')}</p>
    </div>
  );
}
