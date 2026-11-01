import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import useLiveRefresh from '../../lib/liveRefresh';
import { usePanel } from '../../components/panel/PanelContext';
import { EditIcon, EmptyRow, Modal, TrashIcon } from '../../components/panel/ui';
import { fmtDate, todayStr } from '../../lib/panelUtils';
import Loader from '../../components/Loader';

import { fmtDate as fmtDateL, fmtDateTime as fmtDateTimeL, currentLang } from '../../lib/dateLocale';
export default function TasksPage() {
  const { t, toast, askConfirm, currentGroup: g } = usePanel();
  const code = g ? g.code : null;
  const [tasks, setTasks] = useState(null);       // null = loading
  const [counts, setCounts] = useState({});
  const [taskModal, setTaskModal] = useState({ open: false, task: null });
  const [subs, setSubs] = useState({ open: false, title: '', taskId: null });

  const load = useCallback(async (opts) => {
    const silent = !!(opts && opts.silent);
    if (!code) return;
    if (!silent) setTasks(null);
    const { data, error } = await supabase.from('tasks').select('*').eq('group_code', code).order('due_date');
    if (error) { { if (!silent) toast(error.message, 'err'); }; return; }
    const list = data || [];
    const map = {};
    if (list.length) {
      const { data: rows } = await supabase.from('task_submissions').select('task_id').in('task_id', list.map((x) => x.id));
      (rows || []).forEach((s) => { map[s.task_id] = (map[s.task_id] || 0) + 1; });
    }
    setCounts(map);
    setTasks(list);
  }, [code, toast]);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load);

  function del(task) {
    askConfirm(t('Delete task'), t('This task and all of its submissions will be deleted. Continue?'), async () => {
      const { error } = await supabase.from('tasks').delete().eq('id', task.id);
      if (error) { toast(error.message, 'err'); return; }
      toast(t('Task deleted.'), 'ok');
      load();
    });
  }

  const today = todayStr();
  const list = Array.isArray(tasks) ? tasks : [];
  const overdue = list.filter((x) => x.due_date && x.due_date < today).length;
  const active = list.length - overdue;
  const totalSubs = list.reduce((n, x) => n + (counts[x.id] || 0), 0);
  const openNew = () => { if (!code) { toast(t('Select a group first.'), 'err'); return; } setTaskModal({ open: true, task: null }); };
  const stateOf = (d) => (d < today ? 'late' : d === today ? 'today' : 'soon');

  return (
    <section className="page active" id="page-tasks">
      <div className="page-head pg-head-row">
        <div>
          <h2>{t('Tasks')}</h2>
          <p>{t('Homework tasks and submissions for the selected group.')}</p>
        </div>
        <button className="btn btn-gold" id="newTaskBtn" onClick={openNew}>{t('+ New task')}</button>
      </div>

      {g && Array.isArray(tasks) && (
        <div className="kpi-row kpi-row-3">
          <div className="kpi"><span className="kpi-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" /></svg></span><div><span className="kpi-num">{active}</span><span className="kpi-lbl">{t('Active')}</span></div></div>
          <div className={'kpi' + (overdue ? ' is-alert' : '')}><span className="kpi-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg></span><div><span className="kpi-num">{overdue}</span><span className="kpi-lbl">{t('Overdue')}</span></div></div>
          <div className="kpi"><span className="kpi-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M7 9l5-5 5 5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></svg></span><div><span className="kpi-num">{totalSubs}</span><span className="kpi-lbl">{t('Submissions')}</span></div></div>
        </div>
      )}

      <div className="panel">
        <div className="panel-head"><h3>{t('Task list')}{Array.isArray(tasks) && <span className="mg-count">{tasks.length}</span>}</h3></div>
        <div className="tk-list" id="tasksBody">
          {!g ? <div className="empty-block">{t('Select a group')}</div>
            : tasks === null ? <Loader inline label={t('Loading…')} />
            : tasks.length === 0 ? <div className="empty-block">{t('There are no tasks for this group yet.')}</div>
            : tasks.map((task) => {
              const st = stateOf(task.due_date);
              const n = counts[task.id] || 0;
              return (
                <article className={'tk-card is-' + st} key={task.id}>
                  <div className="tk-due" title={t('Due date')}>
                    <b>{task.due_date ? new Date(task.due_date + 'T00:00:00').getDate() : '—'}</b>
                    <span>{task.due_date ? fmtDateL(task.due_date + 'T00:00:00', currentLang(), { month: 'short' }) : ''}</span>
                  </div>
                  <div className="tk-main">
                    <div className="tk-title" dir="auto">{task.title}</div>
                    {task.description && <div className="tk-desc" dir="auto">{task.description}</div>}
                    <div className="tk-meta">
                      <span className={'tk-state ' + st}>{st === 'late' ? t('Overdue') : fmtDate(task.due_date)}</span>
                    </div>
                  </div>
                  <button className={'tk-subs' + (n ? ' has' : '')} onClick={() => setSubs({ open: true, title: task.title, taskId: task.id })}>
                    <b>{n}</b><span>{t('submitted')}</span>
                  </button>
                  <div className="tk-actions">
                    <button className="icon-btn" title={t('Edit')} onClick={() => setTaskModal({ open: true, task })}><EditIcon /></button>
                    <button className="icon-btn" title={t('Delete')} onClick={() => del(task)}><TrashIcon /></button>
                  </div>
                </article>
              );
            })}
        </div>
      </div>
      <TaskModal open={taskModal.open} task={taskModal.task} groupCode={code} onClose={() => setTaskModal((m) => ({ ...m, open: false }))} onSaved={load} />
      <SubmissionsModal state={subs} onClose={() => setSubs((s) => ({ ...s, open: false }))} />
    </section>
  );
}

function TaskModal({ open, task, groupCode, onClose, onSaved }) {
  const { t, toast } = usePanel();
  const [f, setF] = useState({ title: '', desc: '', due: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setF({ title: task ? task.title : '', desc: task ? (task.description || '') : '', due: task ? task.due_date : '' });
    setError('');
  }, [open, task]);

  async function submit(e) {
    e.preventDefault();
    const payload = { title: f.title.trim(), description: f.desc.trim(), due_date: f.due, group_code: groupCode };
    setSaving(true);
    try {
      const result = task
        ? await supabase.from('tasks').update(payload).eq('id', task.id)
        : await supabase.from('tasks').insert(payload);
      if (result.error) throw result.error;
      toast(task ? t('Task updated.') : t('New task added.'), 'ok');
      onClose();
      onSaved();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} id="taskModalOverlay">
      <h3 id="taskModalTitle">{task ? t('Edit task') : t('New task')}</h3>
      <form id="taskForm" onSubmit={submit}>
        <div className="field"><label>{t('Title')}</label><input type="text" id="taskTitle" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div className="field"><label>{t('Description')}</label><textarea id="taskDesc" value={f.desc} onChange={(e) => setF({ ...f, desc: e.target.value })}></textarea></div>
        <div className="field"><label>{t('Due date')}</label><input type="date" id="taskDue" required value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></div>
        <p className="hint" id="taskFormError" style={{ display: error ? 'block' : 'none', color: 'var(--danger-bright)' }}>{error}</p>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t('Cancel')}</button>
          <button type="submit" className="btn btn-gold" id="taskSaveBtn" disabled={saving}>{t('Save')}</button>
        </div>
      </form>
    </Modal>
  );
}

function SubmissionsModal({ state, onClose }) {
  const { t, toast } = usePanel();
  const [rows, setRows] = useState(null);   // null = loading, {error}|[]
  const [draft, setDraft] = useState({});   // id -> { grade, feedback }
  const [saving, setSaving] = useState(null);

  useEffect(() => {
    if (!state.open) return undefined;
    let cancelled = false;
    setRows(null);
    (async () => {
      const { data: subs, error } = await supabase.from('task_submissions').select('*').eq('task_id', state.taskId).order('submitted_at', { ascending: false });
      if (cancelled) return;
      if (error) { setRows({ error: error.message }); return; }
      if (!subs || subs.length === 0) { setRows([]); return; }
      const { data: members } = await supabase.from('group_members').select('user_id, name').in('user_id', subs.map((s) => s.user_id));
      const names = {};
      (members || []).forEach((m) => { names[m.user_id] = m.name; });
      const list = subs.map((s) => ({ ...s, studentName: names[s.user_id] || s.user_id }));
      if (!cancelled) {
        setRows(list);
        setDraft(Object.fromEntries(list.map((s) => [s.id, { grade: s.grade || '', feedback: s.feedback || '' }])));
      }
    })();
    return () => { cancelled = true; };
  }, [state.open, state.taskId]);

  async function download(path) {
    const { data, error } = await supabase.storage.from('task-submissions').createSignedUrl(path, 300);
    if (error) { toast(error.message, 'err'); return; }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function saveGrade(id) {
    const d = draft[id] || { grade: '', feedback: '' };
    setSaving(id);
    const { error } = await supabase.from('task_submissions').update({
      grade: d.grade.trim() || null, feedback: d.feedback.trim() || null, graded_at: new Date().toISOString(),
    }).eq('id', id);
    setSaving(null);
    if (error) { toast(error.message, 'err'); return; }
    setRows((cur) => cur.map((r) => (r.id === id ? { ...r, graded_at: new Date().toISOString() } : r)));
    toast(t('Grade saved.'), 'ok');
  }

  return (
    <Modal open={state.open} onClose={onClose} wide id="submissionsOverlay">
      <h3>{t('Submissions')} &mdash; <span id="submissionsTaskTitle">{state.title}</span></h3>
      <table>
        <thead><tr><th>{t('Student')}</th><th>{t('File')}</th><th>{t('Submitted at')}</th><th>{t('Grade')}</th><th>{t('Feedback')}</th><th></th></tr></thead>
        <tbody id="submissionsBody">
          {rows === null ? <EmptyRow cols={6}>{t('Loading…')}</EmptyRow>
            : rows.error ? <EmptyRow cols={6}>{rows.error}</EmptyRow>
            : rows.length === 0 ? <EmptyRow cols={6}>{t('No one has submitted yet.')}</EmptyRow>
            : rows.map((s) => (
              <tr key={s.id}>
                <td>{s.studentName}</td>
                <td>{s.file_name || '\u2014'}</td>
                <td className="muted">
                  {fmtDateTimeL(s.submitted_at, currentLang())}
                  {s.graded_at && <div className="muted" style={{ fontSize: 11 }}>{t('Grade')}: {fmtDate(s.graded_at)}</div>}
                </td>
                <td><input className="grade-input" placeholder="5 / A / 85" value={draft[s.id] ? draft[s.id].grade : ''}
                           onChange={(e) => setDraft((cur) => ({ ...cur, [s.id]: { ...cur[s.id], grade: e.target.value } }))} /></td>
                <td><input className="grade-fb" value={draft[s.id] ? draft[s.id].feedback : ''}
                           onChange={(e) => setDraft((cur) => ({ ...cur, [s.id]: { ...cur[s.id], feedback: e.target.value } }))} /></td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn btn-gold btn-sm" disabled={saving === s.id} onClick={() => saveGrade(s.id)}>{t('Save')}</button>{' '}
                  <button className="btn btn-ghost btn-sm" onClick={() => download(s.file_path)}>{t('Download')}</button>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </Modal>
  );
}
