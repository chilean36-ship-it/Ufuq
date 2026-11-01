import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { usePanel } from '../../components/panel/PanelContext';
import { Modal } from '../../components/panel/ui';
import { examTitleFor } from '../../lib/examTitle';
import { fmtDateTime } from '../../lib/dateLocale';

/** Server error code -> English key (translated by t()). Anything else is shown as the server sent it. */
const ERR = {
  bad_date: 'The deadline must be in the future.',
  not_allowed: 'You cannot manage this exam.',
  not_in_group: 'This student is not in the group any more.',
  already_lowest: 'This student is already on the lowest level.',
  not_a_student: 'Only students can be moved.',
  no_lower_group: 'There is no lower level group to move this student to.',
};

/** value for <input type="datetime-local"> in the browser's own time zone */
function toLocalInput(d) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
}
const tomorrow = () => toLocalInput(new Date(Date.now() + 24 * 3600 * 1000));

/**
 * Teacher view of ONE exam whose deadline has passed: the group's students who never handed it in, with three actions:
 *  - Extend      : give this one student more time (written_exam_extensions, read by start_written_exam)
 *  - Move down   : the student goes to the NEAREST LOWER active group, exactly like a student who failed the exam (the lower level starts fresh)
 *  - Remove      : the student leaves this group and waits for the teacher to add them to another one
 * Data and permissions come from RPCs (exam_missed_students, staff_extend_exam_deadline, staff_demote_missed_student,
 * staff_remove_missed_student); the server re-checks that the teacher really teaches this exam's group.
 */
export default function MissedStudentsModal({ state, onClose, onChanged }) {
  const { t, lang, toast, askConfirm } = usePanel();
  const exam = state.exam;
  const examId = exam ? exam.id : null;
  const [rows, setRows] = useState(null);       // null = loading, { error } = failed
  const [busy, setBusy] = useState(false);
  const [ext, setExt] = useState(null);         // { uid, value } while the "extend" editor is open for one row

  const fail = useCallback((e) => {
    const m = String((e && e.message) || e);
    const key = Object.keys(ERR).find((k) => m.indexOf(k) !== -1);
    toast(key ? t(ERR[key]) : m, 'err');
  }, [t, toast]);

  const refresh = useCallback(async () => {
    if (!examId) return;
    setRows(null);
    const { data, error } = await supabase.rpc('exam_missed_students', { p_exam_id: examId });
    if (error) { setRows({ error: error.message || String(error) }); return; }
    setRows(data || []);
  }, [examId]);

  useEffect(() => { if (state.open) { setExt(null); refresh(); } }, [state.open, refresh]);

  async function run(fn, okMsg) {
    setBusy(true);
    try {
      await fn();
      toast(t(okMsg), 'ok');
      setExt(null);
      await refresh();
      if (onChanged) onChanged({ silent: true });
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  function saveExtension(uid) {
    const when = ext && ext.value ? new Date(ext.value) : null;
    if (!when || Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) { toast(t('The deadline must be in the future.'), 'err'); return; }
    run(async () => {
      const { error } = await supabase.rpc('staff_extend_exam_deadline', { p_exam_id: examId, p_user: uid, p_until: when.toISOString() });
      if (error) throw error;
    }, 'Deadline extended.');
  }

  function demote(r) {
    askConfirm(t('Move to the nearest lower group'), t('Move this student to the nearest lower level group, like a student who failed the exam? They will start that level again.'), () => run(async () => {
      const { error } = await supabase.rpc('staff_demote_missed_student', { p_exam_id: examId, p_user: r.user_id });
      if (error) throw error;
    }, 'Student moved to the nearest lower group.'));
  }

  function remove(r) {
    askConfirm(t('Remove from group'), t('Remove this student from the group? They will be told to wait for a new group.'), () => run(async () => {
      const { error } = await supabase.rpc('staff_remove_missed_student', { p_exam_id: examId, p_user: r.user_id });
      if (error) throw error;
    }, 'Student removed from the group.'));
  }

  const now = Date.now();
  return (
    <Modal open={state.open} onClose={onClose} wide>
      <h3>{t('Students who missed the deadline')} &mdash; <span>{exam ? examTitleFor(exam, lang) : ''}</span></h3>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>{t('Student')}</th><th>{t('Level')}</th><th>{t('Status')}</th><th>{t('Extended until')}</th><th></th></tr></thead>
          <tbody>
            {rows === null ? <tr className="empty-row"><td colSpan={5}>{t('Loading…')}</td></tr>
              : rows.error ? <tr className="empty-row"><td colSpan={5}>{rows.error}</td></tr>
              : rows.length === 0 ? <tr className="empty-row"><td colSpan={5}>{t('Everyone handed in on time.')}</td></tr>
              : rows.map((r) => {
                const until = r.extended_until && new Date(r.extended_until).getTime() > now ? r.extended_until : null;
                const editing = ext && ext.uid === r.user_id;
                return (
                  <tr key={r.user_id}>
                    <td><b>{r.name || t('Student')}</b></td>
                    <td>{t('Level')} {r.level}</td>
                    <td>{r.status === 'draft' ? t('Not submitted') : t('Not started')}</td>
                    <td>{until ? fmtDateTime(until, lang) : '\u2014'}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {editing ? (
                        <>
                          <input type="datetime-local" value={ext.value} aria-label={t('Extended until')} min={toLocalInput(new Date())}
                                 onChange={(e) => setExt({ uid: r.user_id, value: e.target.value })} style={{ marginRight: 6 }} />
                          <button type="button" className="btn btn-gold btn-sm" disabled={busy} onClick={() => saveExtension(r.user_id)}>{t('Save')}</button>
                          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setExt(null)} style={{ marginLeft: 6 }}>{t('Cancel')}</button>
                        </>
                      ) : (
                        <>
                          <button type="button" className="btn btn-gold btn-sm" disabled={busy} onClick={() => setExt({ uid: r.user_id, value: tomorrow() })}>{t('Extend')}</button>
                          <button type="button" className="btn btn-ghost btn-sm" disabled={busy || r.level <= 1} title={r.level <= 1 ? t('This student is already on the lowest level.') : t('Move to the nearest lower group')}
                                  onClick={() => demote(r)} style={{ marginLeft: 6 }}>{t('Lower level')}</button>
                          <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => remove(r)} style={{ marginLeft: 6 }}>{t('Remove from group')}</button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
