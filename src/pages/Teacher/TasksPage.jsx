import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import useLiveRefresh from '../../lib/liveRefresh';
import { usePanel } from '../../components/panel/PanelContext';
import { EditIcon, Modal, TrashIcon } from '../../components/panel/ui';
import { fmtDate, todayStr } from '../../lib/panelUtils';
import PageStyle from '../../components/PageStyle';
import Loader from '../../components/Loader';
import PhotoLightbox from '../../components/PhotoLightbox';
import tasksCss from './tasks-teacher.css?inline';

import { fmtDate as fmtDateL, fmtDateTime as fmtDateTimeL, currentLang } from '../../lib/dateLocale';

const svgp = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
const IC = {
  done: <svg {...svgp}><path d="M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" /></svg>,
  clock: <svg {...svgp}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  up: <svg {...svgp}><path d="M12 16V4M7 9l5-5 5 5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></svg>,
  file: <svg {...svgp}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /></svg>,
  dl: <svg {...svgp}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><path d="M7 10l5 5 5-5M12 15V3" /></svg>,
  users: <svg {...svgp}><circle cx="9" cy="8" r="3.2" /><path d="M3 19c0-3.2 2.7-5.5 6-5.5s6 2.3 6 5.5" /><circle cx="17" cy="9" r="2.4" /><path d="M16.5 14c2.6 0 4.5 1.8 4.5 4.5" /></svg>,
};

/** All the photos of one submission: the first in file_path / file_name, the others in extra_files (jsonb, up to 4 more). [] when they were cleaned up. */
const filesOf = (s) => (s && s.file_path ? [{ path: s.file_path, name: s.file_name }, ...((Array.isArray(s.extra_files) ? s.extra_files : []).filter((x) => x && x.path).map((x) => ({ path: x.path, name: x.name || '' })))] : []);
const IMG_RE = /\.(jpe?g|jfif|png|webp|gif|avif|bmp)$/i;   // formats every browser can draw; HEIC photos get a picture icon + the download button

export default function TasksPage() {
  const { t, toast, askConfirm, currentGroup: g } = usePanel();
  const code = g ? g.code : null;
  const [tasks, setTasks] = useState(null);       // null = loading
  const [counts, setCounts] = useState({});
  const [members, setMembers] = useState(0);
  const [tab, setTab] = useState('active');
  const [taskModal, setTaskModal] = useState({ open: false, task: null });
  const [subs, setSubs] = useState({ open: false, task: null });

  const load = useCallback(async (opts) => {
    const silent = !!(opts && opts.silent);
    if (!code) return;
    if (!silent) setTasks(null);
    const { data, error } = await supabase.from('tasks').select('*').eq('group_code', code).order('due_date', { ascending: false });
    if (error) { if (!silent) toast(error.message, 'err'); return; }
    const list = data || [];
    const map = {};
    if (list.length) {
      const { data: rows } = await supabase.from('task_submissions').select('task_id').in('task_id', list.map((x) => x.id));
      (rows || []).forEach((s) => { map[s.task_id] = (map[s.task_id] || 0) + 1; });
    }
    const { count } = await supabase.from('group_members').select('user_id', { count: 'exact', head: true }).eq('group_code', code);
    setMembers(count || 0);
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
  const isPast = (x) => !!x.due_date && x.due_date < today;
  const overdue = list.filter(isPast).length;
  const active = list.length - overdue;
  const totalSubs = list.reduce((n, x) => n + (counts[x.id] || 0), 0);
  const shown = useMemo(() => {
    const l = tab === 'all' ? list : list.filter((x) => (tab === 'past' ? isPast(x) : !isPast(x)));
    // active: nearest deadline first; past / all: newest first
    return l.slice().sort((a, b) => (tab === 'active' ? String(a.due_date).localeCompare(String(b.due_date)) : String(b.due_date).localeCompare(String(a.due_date))));
  }, [list, tab, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const openNew = () => { if (!code) { toast(t('Select a group first.'), 'err'); return; } setTaskModal({ open: true, task: null }); };
  const stateOf = (d) => (d < today ? 'late' : d === today ? 'today' : 'soon');

  return (
    <section className="page active" id="page-tasks">
      <PageStyle css={tasksCss} />
      <div className="page-head pg-head-row">
        <div>
          <h2>{t('Tasks')}</h2>
        </div>
        <button className="btn btn-gold" id="newTaskBtn" onClick={openNew}>{t('+ New task')}</button>
      </div>

      {g && Array.isArray(tasks) && (
        <div className="kpi-row kpi-row-3">
          <div className="kpi"><span className="kpi-ico">{IC.done}</span><div><span className="kpi-num">{active}</span><span className="kpi-lbl">{t('Active')}</span></div></div>
          <div className={'kpi' + (overdue ? ' is-alert' : '')}><span className="kpi-ico">{IC.clock}</span><div><span className="kpi-num">{overdue}</span><span className="kpi-lbl">{t('Overdue')}</span></div></div>
          <div className="kpi"><span className="kpi-ico">{IC.up}</span><div><span className="kpi-num">{totalSubs}</span><span className="kpi-lbl">{t('Submissions')}</span></div></div>
        </div>
      )}

      <div className="panel">
        <div className="tt-bar">
          <div className="tt-tabs" role="tablist">
            {[['active', t('Active'), active], ['past', t('Past'), overdue], ['all', t('All'), list.length]].map(([k, label, n]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} className={'tt-tab' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{label}<i>{n}</i></button>
            ))}
          </div>
          {g && members > 0 && <span className="tt-members">{IC.users}{members} {t('students')}</span>}
        </div>
        <div className="tt-list" id="tasksBody">
          {!g ? <div className="empty-block">{t('Select a group')}</div>
            : tasks === null ? <Loader inline label={t('Loading…')} />
            : list.length === 0 ? (
              <div className="tt-empty"><h4>{t('There are no tasks for this group yet.')}</h4><p>{t('Create the first task and your students will see it right away.')}</p><button className="btn btn-gold" onClick={openNew}>{t('+ New task')}</button></div>
            )
            : shown.length === 0 ? <div className="tt-empty"><p>{t('Nothing here.')}</p></div>
            : shown.map((task) => {
              const st = stateOf(task.due_date);
              const n = counts[task.id] || 0;
              const pct = members ? Math.min(100, Math.round((n / members) * 100)) : 0;
              return (
                <article className={'tt-card is-' + st} key={task.id}>
                  <div className="tt-due" title={t('Due date')}>
                    <b>{task.due_date ? new Date(task.due_date + 'T00:00:00').getDate() : '—'}</b>
                    <span>{task.due_date ? fmtDateL(task.due_date + 'T00:00:00', currentLang(), { month: 'short' }) : ''}</span>
                  </div>
                  <div className="tt-main">
                    <div className="tt-title" dir="auto">{task.title}</div>
                    {task.description && <div className="tt-desc" dir="auto">{task.description}</div>}
                    <div className="tt-meta">
                      <span className={'tt-state ' + st}>{st === 'late' ? t('Overdue') : st === 'today' ? t('Due today') : fmtDate(task.due_date)}</span>
                      <span className="tt-prog" title={n + ' / ' + members}>
                        <span className="tt-bar-track"><span className="tt-bar-fill" style={{ width: pct + '%' }} /></span>
                        <b>{n}</b>{members ? <span> / {members}</span> : null} {t('submitted')}
                      </span>
                    </div>
                  </div>
                  <div className="tt-actions">
                    <button className={'btn btn-sm ' + (n ? 'btn-gold' : 'btn-ghost')} onClick={() => setSubs({ open: true, task })}>{t('Review')}</button>
                    <button className="icon-btn" title={t('Edit')} onClick={() => setTaskModal({ open: true, task })}><EditIcon /></button>
                    <button className="icon-btn" title={t('Delete')} onClick={() => del(task)}><TrashIcon /></button>
                  </div>
                </article>
              );
            })}
        </div>
      </div>
      <TaskModal open={taskModal.open} task={taskModal.task} groupCode={code} onClose={() => setTaskModal((m) => ({ ...m, open: false }))} onSaved={load} />
      <SubmissionsModal state={subs} onClose={() => setSubs((s) => ({ ...s, open: false }))} onChanged={() => load({ silent: true })} />
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
    } catch (err) {
      // the database refuses task changes to "standard" admin accounts (policy no_std_admin_*): say so in plain words
      const m = String((err && err.message) || err);
      setError(/row-level security|42501/i.test(m) ? t('This account is not allowed to create or edit tasks. Ask the main admin to allow it.') : m);
    } finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} id="taskModalOverlay">
      <h3 id="taskModalTitle">{task ? t('Edit task') : t('New task')}</h3>
      <form id="taskForm" onSubmit={submit}>
        <div className="field"><label>{t('Title')}</label><input type="text" id="taskTitle" required maxLength={140} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div className="field"><label>{t('Description')}</label><textarea id="taskDesc" rows={4} value={f.desc} onChange={(e) => setF({ ...f, desc: e.target.value })}></textarea></div>
        <div className="field"><label>{t('Due date')}</label><input type="date" id="taskDue" required value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></div>
        <p className="hint">{t('Students upload a photo or file. Files are deleted automatically after 2 months; grades stay.')}</p>
        <p className="hint" id="taskFormError" style={{ display: error ? 'block' : 'none', color: 'var(--danger-bright)' }}>{error}</p>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t('Cancel')}</button>
          <button type="submit" className="btn btn-gold" id="taskSaveBtn" disabled={saving}>{t('Save')}</button>
        </div>
      </form>
    </Modal>
  );
}

function SubmissionsModal({ state, onClose, onChanged }) {
  const { t, toast } = usePanel();
  const task = state.task;
  const [data, setData] = useState(null);   // null = loading, {error} | { rows, missing }
  const [draft, setDraft] = useState({});   // id -> { grade, feedback }
  const [saving, setSaving] = useState(null);
  const [urls, setUrls] = useState({});     // file_path -> signed url (images only)
  const [light, setLight] = useState(null);  // { photos: [{ url, name, path }], index } = the photo viewer that opens on this page

  useEffect(() => {
    if (!state.open || !task) return undefined;
    let cancelled = false;
    setData(null); setUrls({});
    (async () => {
      const [subRes, memRes] = await Promise.all([
        supabase.from('task_submissions').select('*').eq('task_id', task.id).order('submitted_at', { ascending: false }),
        supabase.from('group_members').select('user_id, name').eq('group_code', task.group_code).order('name'),
      ]);
      if (cancelled) return;
      if (subRes.error) { setData({ error: subRes.error.message }); return; }
      const names = {};
      (memRes.data || []).forEach((m) => { names[m.user_id] = m.name; });
      const rows = (subRes.data || []).map((s) => ({ ...s, studentName: names[s.user_id] || t('Student') }));
      const doneIds = new Set(rows.map((r) => r.user_id));
      const missing = (memRes.data || []).filter((m) => !doneIds.has(m.user_id));
      setData({ rows, missing });
      setDraft(Object.fromEntries(rows.map((s) => [s.id, { grade: s.grade || '', feedback: s.feedback || '' }])));
      const imgPaths = rows.flatMap((r) => filesOf(r)).filter((x) => IMG_RE.test(x.name || '')).map((x) => x.path);
      if (imgPaths.length) {
        const { data: signed } = await supabase.storage.from('task-submissions').createSignedUrls(imgPaths, 3600);
        if (!cancelled && signed) setUrls(Object.fromEntries(signed.filter((x) => x.signedUrl).map((x) => [x.path, x.signedUrl])));
      }
    })();
    return () => { cancelled = true; };
  }, [state.open, task]); // eslint-disable-line react-hooks/exhaustive-deps

  // A photo the browser cannot draw (HEIC) and the viewer's Download button: the file is sent as an attachment, the page stays where it is.
  async function download(path, name) {
    const { data: d, error } = await supabase.storage.from('task-submissions').createSignedUrl(path, 300, { download: name || true });
    if (error) { toast(error.message, 'err'); return; }
    const a = document.createElement('a'); a.href = d.signedUrl; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
  }
  const openPhoto = (row, path) => {
    const list = filesOf(row).filter((x) => urls[x.path]).map((x) => ({ url: urls[x.path], name: x.name, path: x.path }));
    const i = list.findIndex((x) => x.path === path);
    if (i >= 0) setLight({ photos: list, index: i });
  };

  async function saveGrade(id) {
    const d = draft[id] || { grade: '', feedback: '' };
    setSaving(id);
    const now = new Date().toISOString();
    const { error } = await supabase.from('task_submissions').update({
      grade: d.grade.trim() || null, feedback: d.feedback.trim() || null, graded_at: now,
    }).eq('id', id);
    setSaving(null);
    if (error) { toast(error.message, 'err'); return; }
    setData((cur) => (cur && cur.rows ? { ...cur, rows: cur.rows.map((r) => (r.id === id ? { ...r, grade: d.grade.trim() || null, feedback: d.feedback.trim() || null, graded_at: now } : r)) } : cur));
    toast(t('Grade saved.'), 'ok');
    onChanged && onChanged();
  }

  const rows = data && data.rows ? data.rows : [];
  const graded = rows.filter((r) => r.graded_at).length;
  const setD = (id, k, v) => setDraft((cur) => ({ ...cur, [id]: { ...cur[id], [k]: v } }));

  return (
    <Modal open={state.open} onClose={onClose} wide id="submissionsOverlay">
      <h3>{t('Submissions')} &mdash; <span id="submissionsTaskTitle">{task ? task.title : ''}</span></h3>
      {data === null ? <Loader inline label={t('Loading…')} />
        : data.error ? <div className="empty-block">{data.error}</div>
        : (
          <>
            <div className="tt-sum">
              <span><b>{rows.length}</b> {t('submitted')}</span>
              <span><b>{graded}</b> {t('Graded').toLowerCase()}</span>
              <span className={data.missing.length ? 'warn' : ''}><b>{data.missing.length}</b> {t('not submitted')}</span>
            </div>
            {rows.length === 0 ? <div className="tt-empty small"><p>{t('No one has submitted yet.')}</p></div> : (
              <div className="tt-subs">
                {rows.map((s) => {
                  const removed = !s.file_path;
                  const late = task && task.due_date && new Date(s.submitted_at) > new Date(task.due_date + 'T23:59:59');
                  return (
                    <div className={'tt-sub' + (s.graded_at ? ' graded' : '')} key={s.id}>
                      <div className="tt-sub-file">
                        {removed ? <span className="tt-fileico off">{IC.file}</span> : (
                          <div className="tt-photos">
                            {filesOf(s).map((x) => (urls[x.path]
                              ? <button type="button" key={x.path} className="tt-ph" onClick={() => openPhoto(s, x.path)} title={t('View')}><img src={urls[x.path]} alt="" onError={(e) => { e.currentTarget.parentElement.replaceWith(Object.assign(document.createElement('span'), { className: 'tt-fileico', textContent: '\u{1F5BC}' })); }} /></button>
                              : <button type="button" key={x.path} className="tt-ph file" onClick={() => download(x.path, x.name)} title={t('Download')}>{IC.file}</button>))}
                          </div>)}
                      </div>
                      <div className="tt-sub-body">
                        <div className="tt-sub-head">
                          <b dir="auto">{s.studentName}</b>
                          <span className="muted">{fmtDateTimeL(s.submitted_at, currentLang())}</span>
                          {late && <span className="u-pill amber">{t('Late')}</span>}
                          {s.graded_at && <span className="u-pill gold">{t('Graded')}</span>}
                        </div>
                        <div className="tt-sub-name" dir="auto">{removed ? t('File removed (older than 2 months)') : (filesOf(s).length > 1 ? t('{n} photos').replace('{n}', filesOf(s).length) : (s.file_name || '—'))}</div>
                        <div className="tt-grade-row">
                          <input className="grade-input" aria-label={t('Grade')} placeholder={t('Grade') + ' (5 / A / 85)'} value={draft[s.id] ? draft[s.id].grade : ''} onChange={(e) => setD(s.id, 'grade', e.target.value)} />
                          <input className="grade-fb" aria-label={t('Feedback')} placeholder={t('Feedback')} value={draft[s.id] ? draft[s.id].feedback : ''} onChange={(e) => setD(s.id, 'feedback', e.target.value)} />
                        </div>
                      </div>
                      <div className="tt-sub-actions">
                        <button className="btn btn-gold btn-sm" disabled={saving === s.id} onClick={() => saveGrade(s.id)}>{t('Save')}</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {data.missing.length > 0 && (
              <div className="tt-missing">
                <h4>{t('Not submitted yet')} <i>{data.missing.length}</i></h4>
                <div className="tt-chips">{data.missing.map((m) => <span className="tt-chip" key={m.user_id} dir="auto">{m.name || t('Student')}</span>)}</div>
              </div>
            )}
          </>
        )}
      <PhotoLightbox photos={light ? light.photos : null} index={light ? light.index : null} onIndex={(i) => setLight((l) => (l ? { ...l, index: i } : l))} onClose={() => setLight(null)}
                     onDownload={(p) => download(p.path, p.name)} labels={{ close: t('Close'), prev: t('Previous'), next: t('Next'), download: t('Download') }} />
    </Modal>
  );
}
