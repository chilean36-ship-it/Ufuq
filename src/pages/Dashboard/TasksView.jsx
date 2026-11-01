import { useEffect, useState } from 'react';
import useLiveRefresh from '../../lib/liveRefresh';
import { useCabinetI18n } from '../../context/CabinetI18nContext';
import { useDashboardData, getTasksForGroup, getTaskSubmissions, saveTaskSubmission } from '../../context/DashboardDataContext';
import { fmtDueDate, isOverdue } from './weekUtils';
import Loader from '../../components/Loader';

const LOCK_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
);
const CAL_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
);
const CHECK_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>
);
const UPLOAD_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><path d="M17 8l-5-5-5 5M12 3v12" /></svg>
);

/** One task card: shows the submitted file, or a file picker + Submit button. Plain-English
 * status/upload copy matches the original (never localized there either). */
function TaskCard({ task, submission, onSubmitted }) {
  const { user } = useDashboardData();
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);

  const overdue = !submission && isOverdue(task.due);
  const statusText = submission ? 'Submitted' : overdue ? 'Overdue' : 'Pending';
  const statusClass = submission ? 'submitted' : 'pending';

  async function handleSubmit() {
    if (!file) return;
    setBusy(true);
    const ok = await saveTaskSubmission(user && user.id, task.id, file);
    setBusy(false);
    if (ok) onSubmitted();
  }

  return (
    <div className="task-card" data-task-id={task.id}>
      <div className="task-card-top">
        <div>
          <h3 className="task-card-title">{task.title}</h3>
          <p className="task-card-desc">{task.desc}</p>
        </div>
        <span className={'task-status ' + statusClass}>{statusText}</span>
      </div>
      <div className="task-card-meta">
        <span>{CAL_ICON}Due {fmtDueDate(task.due)}</span>
        {submission && <span>{CHECK_ICON}{submission.fileName}</span>}
      </div>
      {!submission && (
        <div className="task-upload-row">
          <label className="task-file-label">
            {UPLOAD_ICON}
            <span className="task-file-name">{file ? file.name : 'Choose a file to upload'}</span>
            <input type="file" style={{ display: 'none' }} onChange={(e) => setFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)} />
          </label>
          <button type="button" className="task-submit-btn" disabled={!file || busy} onClick={handleSubmit}>
            {busy ? 'Uploading…' : 'Submit'}
          </button>
        </div>
      )}
    </div>
  );
}

/** Tasks (homework) page — port of `<section id="tasksView">` + renderTasksForGroup(). */
export default function TasksView() {
  const { t } = useCabinetI18n();
  const { user, groupCode, groupReady } = useDashboardData();
  const joined = !!groupCode;
  const [tasks, setTasks] = useState(null);
  const [submissions, setSubmissions] = useState({});

  async function reload() {
    if (!joined) return;
    const [rows, subs] = await Promise.all([getTasksForGroup(groupCode), getTaskSubmissions(user && user.id)]);
    setTasks(rows);
    setSubmissions(subs);
  }

  useEffect(() => {
    if (!groupReady) return;
    if (!joined) { setTasks(null); return; }
    reload();
  }, [groupReady, joined, groupCode]); // eslint-disable-line react-hooks/exhaustive-deps
  useLiveRefresh(() => reload());

  return (
    <section id="tasksView">
      <div className="inner-page-head">
        <div>
          <h1>{t('Tasks')}</h1>
          <p>{t('Homework and assignments from your teacher. Upload your work before the deadline.')}</p>
        </div>
      </div>

      {!joined ? (
        <div className="panel" id="tasksLockedPanel">
          <div className="inner-locked">
            {LOCK_ICON}
            <h3>{t('No tasks yet')}</h3>
            <p>{t('Ask your teacher for a group code to see your homework and submit your work here.')}</p>
          </div>
        </div>
      ) : (
        <div className="task-list" id="tasksList">
          {tasks === null ? (
            <Loader inline label={t('Loading…')} />
          ) : tasks.length === 0 ? (
            <div className="empty-state">{t('No tasks assigned yet.')}</div>
          ) : tasks.map((task) => (
            <TaskCard key={task.id} task={task} submission={submissions[task.id]} onSubmitted={reload} />
          ))}
        </div>
      )}
    </section>
  );
}
