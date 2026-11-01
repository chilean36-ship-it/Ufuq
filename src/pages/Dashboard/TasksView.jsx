import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useLiveRefresh from '../../lib/liveRefresh';
import { supabase } from '../../lib/supabaseClient';
import { useCabinetI18n } from '../../context/CabinetI18nContext';
import { useDashboardData, getTasksForGroup, getTaskSubmissions, saveTaskSubmission } from '../../context/DashboardDataContext';
import { compressImage, fmtBytes, isImageFile } from '../../lib/imageCompress';
import { fmtDate as fmtDateL, currentLang } from '../../lib/dateLocale';
import PageStyle from '../../components/PageStyle';
import Loader from '../../components/Loader';
import tasksCss from './tasks.css?inline';

const svgp = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
const IC = {
  lock: <svg {...svgp} strokeWidth="1.6"><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>,
  cal: <svg {...svgp}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>,
  upload: <svg {...svgp}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><path d="M17 8l-5-5-5 5M12 3v12" /></svg>,
  file: <svg {...svgp}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /></svg>,
  check: <svg {...svgp} strokeWidth="2.4"><path d="M20 6L9 17l-5-5" /></svg>,
  x: <svg {...svgp} strokeWidth="2.4"><path d="M18 6L6 18M6 6l12 12" /></svg>,
  clip: <svg {...svgp} strokeWidth="1.6"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>,
  msg: <svg {...svgp}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>,
};

const ACCEPT = 'image/*,.pdf,.doc,.docx,.txt,.ppt,.pptx';
const MAX_BYTES = 20 * 1024 * 1024;   // bucket limit

const parseDay = (s) => (s ? new Date(s + 'T00:00:00') : null);
const todayMidnight = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const daysUntil = (due) => { const d = parseDay(due); return d ? Math.round((d - todayMidnight()) / 86400000) : null; };

/** One of: graded | submitted | overdue | soon | todo */
function stateOf(task, sub) {
  if (sub && sub.gradedAt) return 'graded';
  if (sub) return 'submitted';
  const left = daysUntil(task.due);
  if (left !== null && left < 0) return 'overdue';
  if (left !== null && left <= 2) return 'soon';
  return 'todo';
}

function useSignedUrl(path, enabled) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let off = false;
    setUrl(null);
    if (!enabled || !path) return undefined;
    supabase.storage.from('task-submissions').createSignedUrl(path, 3600).then(({ data }) => { if (!off && data) setUrl(data.signedUrl); }).catch(() => {});
    return () => { off = true; };
  }, [path, enabled]);
  return url;
}

function DueText({ task, t }) {
  const left = daysUntil(task.due);
  const date = task.due ? fmtDateL(task.due + 'T00:00:00', currentLang(), { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  let rel = '';
  if (left === 0) rel = t('Due today');
  else if (left === 1) rel = t('Due tomorrow');
  else if (left !== null && left > 1) rel = t('{n} days left').replace('{n}', left);
  else if (left !== null && left < 0) rel = t('{n} days overdue').replace('{n}', -left);
  return <span className="tk2-due">{IC.cal}<b>{date}</b>{rel && <em>{rel}</em>}</span>;
}

/** Upload area: click, drop, or take a photo. Big photos are shrunk before upload. */
function DropZone({ file, preview, onPick, onClear, busy, t }) {
  const inp = useRef(null);
  const [over, setOver] = useState(false);
  const take = (f) => { if (f) onPick(f); };
  if (file) {
    return (
      <div className="tk2-picked">
        {preview ? <img src={preview} alt="" className="tk2-thumb" /> : <span className="tk2-fileico">{IC.file}</span>}
        <div className="tk2-pickedtxt"><b dir="auto">{file.name}</b><span>{fmtBytes(file.size)}</span></div>
        {!busy && <button type="button" className="tk2-iconbtn" onClick={onClear} aria-label={t('Remove')}>{IC.x}</button>}
      </div>
    );
  }
  return (
    <div className={'tk2-drop' + (over ? ' over' : '')} role="button" tabIndex={0}
         onClick={() => inp.current && inp.current.click()}
         onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.current && inp.current.click(); } }}
         onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
         onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files && e.dataTransfer.files[0]); }}>
      {IC.upload}
      <b>{t('Tap to add a photo or file')}</b>
      <span>{t('Photo, PDF or document · up to 20 MB')}</span>
      <input ref={inp} type="file" accept={ACCEPT} hidden onChange={(e) => { take(e.target.files && e.target.files[0]); e.target.value = ''; }} />
    </div>
  );
}

function TaskCard({ task, submission, onSubmitted, t, toast }) {
  const { user } = useDashboardData();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [err, setErr] = useState('');

  const st = stateOf(task, submission);
  const removed = !!submission && !submission.filePath;       // the file was cleaned up after 2 months
  const isImg = !!submission && /\.(jpe?g|png|webp|gif|heic)$/i.test(submission.fileName || '');
  const signed = useSignedUrl(submission && submission.filePath, !!submission && !removed && isImg);
  const late = !!submission && !!task.due && new Date(submission.submittedAt) > new Date(task.due + 'T23:59:59');
  const canChange = !!submission && !submission.gradedAt;
  const showPicker = !submission || replacing;

  useEffect(() => {
    if (!file || !isImageFile(file)) { setPreview(null); return undefined; }
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  async function pick(f) {
    setErr('');
    if (f.size > MAX_BYTES * 2) { setErr(t('The file is too large (max 20 MB).')); return; }
    const small = await compressImage(f);
    if (small.size > MAX_BYTES) { setErr(t('The file is too large (max 20 MB).')); return; }
    setFile(small);
  }

  async function submit() {
    if (!file) return;
    setBusy(true); setErr('');
    const res = await saveTaskSubmission(user && user.id, task.id, file);
    setBusy(false);
    if (res.ok) { setFile(null); setReplacing(false); toast && toast(t('Your work was submitted.')); onSubmitted(); }
    else setErr(t('Could not upload. Check your connection and try again.'));
  }

  const label = { graded: t('Graded'), submitted: late ? t('Submitted late') : t('Submitted'), overdue: t('Overdue'), soon: t('Due soon'), todo: t('To do') }[st];

  return (
    <article className={'tk2-card is-' + st} data-task-id={task.id}>
      <div className="tk2-top">
        <div className="tk2-date" aria-hidden="true">
          <b>{task.due ? parseDay(task.due).getDate() : '—'}</b>
          <span>{task.due ? fmtDateL(task.due + 'T00:00:00', currentLang(), { month: 'short' }) : ''}</span>
        </div>
        <div className="tk2-head">
          <h3 dir="auto">{task.title}</h3>
          <DueText task={task} t={t} />
        </div>
        <span className={'tk2-chip ' + st}>{st === 'graded' || st === 'submitted' ? IC.check : null}{label}</span>
      </div>

      {task.desc ? <p className="tk2-desc" dir="auto">{task.desc}</p> : null}

      {submission && !replacing && (
        <div className="tk2-sub">
          {removed ? (
            <div className="tk2-removed">{IC.file}<span>{t('The file was removed automatically after 2 months.')}</span></div>
          ) : (
            <div className="tk2-subfile">
              {signed && isImg ? <a href={signed} target="_blank" rel="noopener noreferrer"><img src={signed} alt="" className="tk2-thumb big" /></a> : <span className="tk2-fileico">{IC.file}</span>}
              <div className="tk2-pickedtxt"><b dir="auto">{submission.fileName}</b>
                <span>{t('Submitted')} · {fmtDateL(submission.submittedAt, currentLang(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div>
            </div>
          )}
          {submission.gradedAt && (
            <div className="tk2-grade">
              <div className="tk2-gradebadge"><span>{t('Grade')}</span><b>{submission.grade || '✓'}</b></div>
              {submission.feedback ? <div className="tk2-fb">{IC.msg}<p dir="auto">{submission.feedback}</p></div> : null}
            </div>
          )}
          {canChange && <button type="button" className="tk2-link" onClick={() => setReplacing(true)}>{t('Replace the file')}</button>}
        </div>
      )}

      {showPicker && (
        <div className="tk2-upload">
          <DropZone file={file} preview={preview} onPick={pick} onClear={() => setFile(null)} busy={busy} t={t} />
          {err ? <p className="tk2-err" role="alert">{err}</p> : null}
          <div className="tk2-actions">
            {replacing && <button type="button" className="tk2-ghost" disabled={busy} onClick={() => { setReplacing(false); setFile(null); setErr(''); }}>{t('Cancel')}</button>}
            <button type="button" className="tk2-primary" disabled={!file || busy} onClick={submit}>
              {busy ? t('Uploading…') : replacing ? t('Replace') : t('Submit')}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

const FILTERS = ['all', 'todo', 'submitted', 'overdue'];

/** Tasks (homework): cards with a clear status, photo / file upload, and the teacher's grade + comment. */
export default function TasksView() {
  const { t } = useCabinetI18n();
  const { user, groupCode, groupReady } = useDashboardData();
  const joined = !!groupCode;
  const [tasks, setTasks] = useState(null);
  const [submissions, setSubmissions] = useState({});
  const [filter, setFilter] = useState('all');
  const [note, setNote] = useState('');

  const reload = useCallback(async () => {
    if (!joined) return;
    const [rows, subs] = await Promise.all([getTasksForGroup(groupCode), getTaskSubmissions(user && user.id)]);
    setTasks(rows);
    setSubmissions(subs);
  }, [joined, groupCode, user]);

  useEffect(() => {
    if (!groupReady) return;
    if (!joined) { setTasks(null); return; }
    reload();
  }, [groupReady, joined, groupCode]); // eslint-disable-line react-hooks/exhaustive-deps
  useLiveRefresh(() => reload());
  useEffect(() => { if (!note) return undefined; const id = setTimeout(() => setNote(''), 3500); return () => clearTimeout(id); }, [note]);

  const view = useMemo(() => {
    const list = (tasks || []).map((task) => ({ task, sub: submissions[task.id], st: stateOf(task, submissions[task.id]) }));
    const counts = {
      all: list.length,
      todo: list.filter((x) => x.st === 'todo' || x.st === 'soon').length,
      submitted: list.filter((x) => x.st === 'submitted' || x.st === 'graded').length,
      overdue: list.filter((x) => x.st === 'overdue').length,
    };
    const keep = (x) => filter === 'all' || (filter === 'todo' && (x.st === 'todo' || x.st === 'soon')) || (filter === 'submitted' && (x.st === 'submitted' || x.st === 'graded')) || (filter === 'overdue' && x.st === 'overdue');
    // unfinished work first (closest deadline first), finished work after that
    const rank = (x) => (x.st === 'overdue' ? 0 : x.st === 'soon' ? 1 : x.st === 'todo' ? 2 : 3);
    const shown = list.filter(keep).sort((a, b) => rank(a) - rank(b) || String(a.task.due).localeCompare(String(b.task.due)));
    return { counts, shown };
  }, [tasks, submissions, filter]);

  const FLABEL = { all: t('All'), todo: t('To do'), submitted: t('Submitted'), overdue: t('Overdue') };

  return (
    <section id="tasksView" className="tk2">
      <PageStyle css={tasksCss} />
      <div className="inner-page-head">
        <div>
          <h1>{t('Tasks')}</h1>
          <p>{t('Homework and assignments from your teacher. Upload your work before the deadline.')}</p>
        </div>
      </div>

      {!joined ? (
        <div className="panel" id="tasksLockedPanel">
          <div className="inner-locked">
            {IC.lock}
            <h3>{t('No tasks yet')}</h3>
            <p>{t('Ask your teacher for a group code to see your homework and submit your work here.')}</p>
          </div>
        </div>
      ) : tasks === null ? (
        <Loader inline label={t('Loading…')} />
      ) : tasks.length === 0 ? (
        <div className="tk2-empty">{IC.clip}<h3>{t('No tasks assigned yet.')}</h3><p>{t('When your teacher adds homework, it will appear here.')}</p></div>
      ) : (
        <>
          <div className="tk2-tabs" role="tablist" aria-label={t('Tasks')}>
            {FILTERS.map((k) => (
              <button key={k} type="button" role="tab" aria-selected={filter === k} className={'tk2-tab' + (filter === k ? ' on' : '') + (k === 'overdue' && view.counts.overdue ? ' alert' : '')} onClick={() => setFilter(k)}>
                {FLABEL[k]}<i>{view.counts[k]}</i>
              </button>
            ))}
          </div>
          <div className="tk2-list" id="tasksList">
            {view.shown.length === 0 ? <div className="tk2-empty small"><p>{t('Nothing here.')}</p></div>
              : view.shown.map(({ task, sub }) => <TaskCard key={task.id} task={task} submission={sub} onSubmitted={reload} t={t} toast={setNote} />)}
          </div>
          <p className="tk2-keep">{t('Uploaded files are kept for 2 months, then deleted automatically. Your grades stay.')}</p>
        </>
      )}
      {note ? <div className="tk2-toast" role="status">{IC.check}{note}</div> : null}
    </section>
  );
}
