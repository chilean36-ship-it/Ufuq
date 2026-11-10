import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useCabinetI18n } from '../../context/CabinetI18nContext';
import useLiveRefresh from '../../lib/liveRefresh';

/**
 * Shown to a student who sits in a switched-off group and in no running one. The closed group is hidden everywhere else;
 * this card explains why (the server tells the reason: the final-exam deadline passed, the group moved on, or staff
 * switched it off) and that the teacher decides what happens next.
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
  // an older database sends no reason: it only closed groups on the deadline
  const byDeadline = rows.some((r) => !r.reason || r.reason === 'deadline');
  return (
    <div className="panel" role="status" style={{ marginBottom: 14, borderColor: 'var(--gold)' }}>
      <div className="panel-head"><h3>{t('Your group is closed')}</h3></div>
      <p style={{ margin: '4px 0 6px' }}>{byDeadline ? t('The final exam deadline has passed, so this group is closed:') : t('This group is not running any more:')} <b>{rows.map((r) => r.name).join(', ')}</b></p>
      <p className="muted" style={{ margin: 0 }}>{byDeadline
        ? t('Your teacher will decide what happens next: open the exam for you again, move you to a lower level, or remove you from the group.')
        : t('Your teacher will move you to a running group. If this takes long, please write to your teacher.')}</p>
    </div>
  );
}
