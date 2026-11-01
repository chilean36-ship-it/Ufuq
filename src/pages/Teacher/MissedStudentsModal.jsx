import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { usePanel } from '../../components/panel/PanelContext';
import { Modal } from '../../components/panel/ui';
import { examTitleFor } from '../../lib/examTitle';
import { fmtDateTime } from '../../lib/dateLocale';
import PageStyle from '../../components/PageStyle';
import css from '../../styles/exam-results.css?inline';
import RowMenu from './RowMenu';

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
 * The students of ONE exam who never handed it in, with one place to decide what happens to each of them:
 *  - Extend deadline      : this one student may still take the exam until the date you choose (written_exam_extensions)
 *  - Lower group          : the student goes to the NEAREST LOWER active group, like a student who failed (that level starts fresh)
 *  - Remove from group    : the student leaves the group and waits for the teacher to add them to another one
 *  - Remove from platform : the account is blocked (a main admin can unblock it on the Students page) and the student leaves the group
 * Retaking a paper that was ALREADY handed in is done in the Results window, not here.
 * Data and permissions come from RPCs (exam_missed_students, staff_extend_exam_deadline, staff_demote_missed_student,
 * staff_remove_missed_student, admin_update_student); the server re-checks that the teacher really teaches this exam.
 */
export default function MissedStudentsModal({ state, onClose, onChanged }) {
  const { t, lang, toast, askConfirm } = usePanel();
  const exam = state.exam;
  const examId = exam ? exam.id : null;
  const [rows, setRows] = useState(null);       // null = loading, { error } = failed
  const [busy, setBusy] = useState(false);
  const [ext, setExt] = useState(null);         // { uid, value } while the "extend deadline" editor is open for one row

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

  // Out of the platform: the account is blocked first (the teacher still sees the student in the group at that moment, which
  // the server checks), then the student leaves the group. A main admin can unblock the account on the Students page.
  function removeFromPlatform(r) {
    askConfirm(t('Remove from the platform'), t('Block this account and remove the student from the group? They will not be able to use the platform any more. A main admin can unblock the account later (Students page).'), () => run(async () => {
      const b = await supabase.rpc('admin_update_student', { p_user_id: r.user_id, p_status: 'blocked' });
      if (b.error) throw b.error;
      const { error } = await supabase.rpc('staff_remove_missed_student', { p_exam_id: examId, p_user: r.user_id });
      if (error) throw error;
    }, 'Student removed from the platform.'));
  }

  const now = Date.now();
  const loc = lang === 'UZ' ? 'uz' : lang === 'RU' ? 'ru' : lang === 'AR' ? 'ar' : 'en';
  let deadlineNote = '';
  if (exam && exam.deadline_at) {
    try {
      const mins = Math.round((new Date(exam.deadline_at).getTime() - now) / 60000);
      const rtf = new Intl.RelativeTimeFormat(loc, { numeric: 'auto' });
      const rel = Math.abs(mins) < 60 ? rtf.format(mins, 'minute') : Math.abs(mins) < 2880 ? rtf.format(Math.round(mins / 60), 'hour') : rtf.format(Math.round(mins / 1440), 'day');
      deadlineNote = t('Deadline') + ': ' + fmtDateTime(exam.deadline_at, lang) + ' (' + rel + ')';
    } catch (e) { deadlineNote = ''; }
  }

  return (
    <Modal open={state.open} onClose={onClose} wide>
      <PageStyle css={css} />
      <div className="mm">
        <header>
          <div className="er-kicker">{t('Students who did not submit')}{Array.isArray(rows) && rows.length > 0 ? <span className="er-chip">{rows.length}</span> : null}</div>
          <h3 className="er-title" dir="auto">{exam ? examTitleFor(exam, lang) : ''}</h3>
        </header>
        <p className="mm-info">
          {deadlineNote ? <b>{deadlineNote}. </b> : null}
          {t('Decide what happens to each student: give more time, move to the nearest lower group, or take them out of the group or the platform.')}
        </p>

        {rows === null ? <p className="mm-empty">{t('Loading…')}</p>
          : rows.error ? <p className="mm-empty">{rows.error}</p>
          : rows.length === 0 ? <p className="mm-empty">{t('Everyone handed in on time.')}</p>
          : (
            <div className="mm-list">
              {rows.map((r) => {
                const until = r.extended_until && new Date(r.extended_until).getTime() > now ? r.extended_until : null;
                const editing = ext && ext.uid === r.user_id;
                return (
                  <div className="mm-card" key={r.user_id}>
                    <i className="er-av" aria-hidden="true">{(r.name || '?').trim().charAt(0).toUpperCase()}</i>
                    <div className="mm-who">
                      <b dir="auto">{r.name || t('Student')}</b>
                      <div className="mm-meta">
                        <span>{t('Level')} {r.level}</span>
                        <span className="tag">{r.status === 'draft' ? t('Started, not submitted') : t('Not started')}</span>
                        {until && <span className="tag ext">{t('Extended until')}: {fmtDateTime(until, lang)}</span>}
                      </div>
                    </div>
                    <div className="mm-acts">
                      <button type="button" className="btn btn-gold btn-sm" disabled={busy} title={t('Give this student more time to take the exam')} onClick={() => setExt({ uid: r.user_id, value: tomorrow() })}>{t('Extend deadline')}</button>
                      <button type="button" className="btn btn-ghost btn-sm" disabled={busy || r.level <= 1} title={r.level <= 1 ? t('This student is already on the lowest level.') : t('Move to the nearest lower group')} onClick={() => demote(r)}>{t('Lower level')}</button>
                      <RowMenu label={t('More')} disabled={busy} items={[
                        { key: 'group', label: t('Remove from group'), title: t('Take the student out of the group; they wait for a new one'), onClick: () => remove(r) },
                        { key: 'platform', label: t('Remove from platform'), title: t('Block the account and take the student out of the group'), danger: true, onClick: () => removeFromPlatform(r) },
                      ]} />
                    </div>
                    {editing && (
                      <div className="mm-ext">
                        <label htmlFor={'mmx' + r.user_id}>{t('Can take the exam until')}</label>
                        <input id={'mmx' + r.user_id} type="datetime-local" value={ext.value} min={toLocalInput(new Date())} onChange={(e) => setExt({ uid: r.user_id, value: e.target.value })} />
                        <button type="button" className="btn btn-gold btn-sm" disabled={busy} onClick={() => saveExtension(r.user_id)}>{t('Save')}</button>
                        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setExt(null)}>{t('Cancel')}</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
      </div>
    </Modal>
  );
}
