import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useLiveRefresh from '../../lib/liveRefresh';
import { supabase } from '../../lib/supabaseClient';
import { useCabinetI18n } from '../../context/CabinetI18nContext';
import { useDashboardData, getTasksForGroup, getTaskSubmissions, saveTaskSubmission, MAX_TASK_PHOTOS, manyPhotosSupported } from '../../context/DashboardDataContext';
import { compressImage, fmtBytes, imageMime, IMAGE_ACCEPT } from '../../lib/imageCompress';
import { fmtDate as fmtDateL, currentLang } from '../../lib/dateLocale';
import PageStyle from '../../components/PageStyle';
import Loader from '../../components/Loader';
import PhotoLightbox from '../../components/PhotoLightbox';
import tasksCss from './tasks.css?inline';
import { Ring } from '../../app/ui';

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
  img: <svg {...svgp}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.6" /><path d="M21 15l-5-5L5 21" /></svg>,
};

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

/** Signed links (1 h) for several stored photos at once: { path -> url } */
function useSignedUrls(paths, enabled) {
  const [urls, setUrls] = useState({});
  const key = (paths || []).join('|');
  useEffect(() => {
    let off = false;
    setUrls({});
    if (!enabled || !key) return undefined;
    supabase.storage.from('task-submissions').createSignedUrls(key.split('|'), 3600)
      .then(({ data }) => { if (!off && data) setUrls(Object.fromEntries(data.filter((x) => x.signedUrl).map((x) => [x.path, x.signedUrl]))); })
      .catch(() => {});
    return () => { off = true; };
  }, [key, enabled]);
  return urls;
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

/** Photo picker (PHOTOS ONLY, any image format): thumbnails of the chosen photos, a tile to add more (up to `max`), click / drop / camera. */
function PhotoPicker({ items, max, onPick, onRemove, onPreviewError, busy, t }) {
  const inp = useRef(null);
  const [over, setOver] = useState(false);
  const take = (list) => { if (list && list.length) onPick(Array.from(list)); };
  const open = () => { if (inp.current) inp.current.click(); };
  const input = <input ref={inp} type="file" accept={IMAGE_ACCEPT} multiple={max > 1} hidden onChange={(e) => { take(e.target.files); e.target.value = ''; }} />;
  if (items.length === 0) {
    return (
      <div className={'tk2-drop' + (over ? ' over' : '')} role="button" tabIndex={0} onClick={open}
           onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}
           onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
           onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}>
        {IC.upload}
        <b>{max > 1 ? t('Tap to add photos') : t('Tap to add a photo')}</b>
        <span>{max > 1 ? t('Photos only (JPG, PNG, HEIC and more) · up to {n} photos').replace('{n}', max) : t('Photos only (JPG, PNG, HEIC and more) · up to 20 MB')}</span>
        {input}
      </div>
    );
  }
  return (
    <div className="tk2-pickwrap" onDragOver={(e) => { e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); take(e.dataTransfer.files); }}>
      <div className="tk2-grid">
        {items.map((it, i) => (
          <div className="tk2-pic" key={it.key}>
            {it.preview ? <img src={it.preview} alt="" onError={() => onPreviewError(it.key)} /> : <span className="tk2-fileico">{IC.img}</span>}
            <span className="tk2-picsize">{fmtBytes(it.file.size)}</span>
            {!busy && <button type="button" className="tk2-picx" onClick={() => onRemove(i)} aria-label={t('Remove')}>{IC.x}</button>}
          </div>
        ))}
        {items.length < max && !busy && (
          <button type="button" className="tk2-add" onClick={open}>{IC.upload}<span>{t('Add photo')}</span></button>
        )}
      </div>
      {max > 1 && <div className="tk2-cnt">{items.length} / {max}</div>}
      {input}
    </div>
  );
}

function TaskCard({ task, submission, onSubmitted, t, toast, max }) {
  const { user } = useDashboardData();
  const [items, setItems] = useState([]);                    // [{ key, file, preview }]
  const [badKeys, setBadKeys] = useState({});                // photos the browser cannot draw (HEIC outside Safari) -> icon
  const [busy, setBusy] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [err, setErr] = useState('');
  const [badSigned, setBadSigned] = useState({});
  const [light, setLight] = useState(null);                // index of the photo open in the viewer (it opens on this page, not in a new tab)
  const seq = useRef(0);

  const st = stateOf(task, submission);
  const files = (submission && submission.files) || [];
  const removed = !!submission && files.length === 0;        // the photos were cleaned up after 2 months
  const drawable = (n) => /\.(jpe?g|jfif|png|webp|gif|avif|bmp)$/i.test(n || '');   // formats every browser can draw
  const urls = useSignedUrls(files.map((x) => x.path), !!submission && !removed);
  const viewable = files.filter((fl) => urls[fl.path] && drawable(fl.name) && !badSigned[fl.path]).map((fl) => ({ path: fl.path, url: urls[fl.path], name: fl.name }));
  const late = !!submission && !!task.due && new Date(submission.submittedAt) > new Date(task.due + 'T23:59:59');
  const canChange = !!submission && !submission.gradedAt;
  const showPicker = !submission || replacing;

  // free the preview links of removed / replaced photos
  const itemsRef = useRef([]);
  itemsRef.current = items;
  useEffect(() => () => { itemsRef.current.forEach((it) => { if (it.preview) URL.revokeObjectURL(it.preview); }); }, []);

  async function pick(list) {
    setErr('');
    const room = max - items.length;
    const next = [];
    let msg = '';
    for (const f of list) {
      if (next.length >= room) { msg = t('You can add up to {n} photos.').replace('{n}', max); break; }
      if (!imageMime(f)) { msg = t('Only photos can be uploaded. Choose an image file.'); continue; }
      if (f.size > MAX_BYTES * 2) { msg = t('The file is too large (max 20 MB).'); continue; }
      const small = await compressImage(f);
      if (small.size > MAX_BYTES) { msg = t('The file is too large (max 20 MB).'); continue; }
      seq.current += 1;
      next.push({ key: 'p' + seq.current, file: small, preview: URL.createObjectURL(small) });
    }
    if (next.length) setItems((cur) => [...cur, ...next].slice(0, max));
    if (msg) setErr(msg);
  }
  function removeAt(i) {
    setItems((cur) => { const it = cur[i]; if (it && it.preview) URL.revokeObjectURL(it.preview); return cur.filter((_, k) => k !== i); });
    setErr('');
  }
  function clearAll() { items.forEach((it) => { if (it.preview) URL.revokeObjectURL(it.preview); }); setItems([]); }

  async function submit() {
    if (!items.length) return;
    setBusy(true); setErr('');
    const res = await saveTaskSubmission(user && user.id, task.id, items.map((it) => it.file));
    setBusy(false);
    if (res.ok) { clearAll(); setReplacing(false); toast && toast(t('Your work was submitted.')); onSubmitted(); }
    else setErr(res.error === 'NOT_AN_IMAGE' || /mime|type/i.test(String(res.error || '')) ? t('Only photos can be uploaded. Choose an image file.') : t('Could not upload. Check your connection and try again.'));
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
            <>
              <div className="tk2-grid sent">
                {files.map((fl) => {
                  const url = urls[fl.path];
                  const ok = url && drawable(fl.name) && !badSigned[fl.path];
                  return ok
                    ? <button type="button" className="tk2-pic" key={fl.path} onClick={() => setLight(viewable.findIndex((v) => v.path === fl.path))} title={t('View')}><img src={url} alt="" onError={() => setBadSigned((m) => ({ ...m, [fl.path]: true }))} /></button>
                    : <span className="tk2-pic" key={fl.path}><span className="tk2-fileico">{IC.img}</span></span>;
                })}
              </div>
              <div className="tk2-pickedtxt"><b dir="auto">{files.length > 1 ? t('{n} photos').replace('{n}', files.length) : (files[0] && files[0].name)}</b>
                <span>{t('Submitted')} · {fmtDateL(submission.submittedAt, currentLang(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div>
            </>
          )}
          {submission.gradedAt && (
            <div className="tk2-grade">
              <div className="tk2-gradebadge"><span>{t('Grade')}</span><b>{submission.grade || '✓'}</b></div>
              {submission.feedback ? <div className="tk2-fb">{IC.msg}<p dir="auto">{submission.feedback}</p></div> : null}
            </div>
          )}
          {canChange && <button type="button" className="tk2-link" onClick={() => setReplacing(true)}>{max > 1 ? t('Replace the photos') : t('Replace the file')}</button>}
        </div>
      )}

      {showPicker && (
        <div className="tk2-upload">
          <PhotoPicker items={items.map((it) => ({ ...it, preview: badKeys[it.key] ? null : it.preview }))} max={max} onPick={pick} onRemove={removeAt}
                       onPreviewError={(k) => setBadKeys((m) => ({ ...m, [k]: true }))} busy={busy} t={t} />
          {err ? <p className="tk2-err" role="alert">{err}</p> : null}
          <div className="tk2-actions">
            {replacing && <button type="button" className="tk2-ghost" disabled={busy} onClick={() => { setReplacing(false); clearAll(); setErr(''); }}>{t('Cancel')}</button>}
            <button type="button" className="tk2-primary" disabled={!items.length || busy} onClick={submit}>
              {busy ? t('Uploading…') : replacing ? t('Replace') : t('Submit')}
            </button>
          </div>
        </div>
      )}
      <PhotoLightbox photos={viewable} index={light} onIndex={setLight} onClose={() => setLight(null)} labels={{ close: t('Close'), prev: t('Previous'), next: t('Next') }} />
    </article>
  );
}
const FILTERS = ['all', 'todo', 'submitted', 'overdue'];

/** Tasks (homework): cards with a clear status, photo / file upload, and the teacher's grade + comment. */
export default function TasksView({ native = false }) {
  const { t } = useCabinetI18n();
  const { user, groupCode, groupReady } = useDashboardData();
  const joined = !!groupCode;
  const [tasks, setTasks] = useState(null);
  const [submissions, setSubmissions] = useState({});
  const [filter, setFilter] = useState('all');
  const [note, setNote] = useState('');
  const [maxPhotos, setMaxPhotos] = useState(1);            // 5 once the database column for extra photos exists, else 1 (as before)

  const reload = useCallback(async () => {
    if (!joined) return;
    const [rows, subs] = await Promise.all([getTasksForGroup(groupCode), getTaskSubmissions(user && user.id)]);
    setTasks(rows);
    setSubmissions(subs);
    setMaxPhotos(manyPhotosSupported() ? MAX_TASK_PHOTOS : 1);
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
      {!native && (
        <div className="inner-page-head">
          <div>
            <h1>{t('Tasks')}</h1>
            <p>{t('Homework and assignments from your teacher. Upload your work before the deadline.')}</p>
          </div>
        </div>
      )}
      {native && joined && tasks && tasks.length > 0 && (
        <>
          <section className="ua-hero2 prog ua-tk-hero" style={{ '--i': 0 }}>
            <Ring value={view.counts.all ? view.counts.submitted / view.counts.all : 0} size={96} stroke={10} color="#fff">
              <b className="ua-ring-n">{view.counts.submitted}/{view.counts.all}</b>
            </Ring>
            <div className="ua-tk-hero-t"><b>{t('Tasks')}</b><span>{t('Submitted')}: {view.counts.submitted}</span></div>
          </section>
          <div className="ua-tiles3" style={{ '--i': 1 }}>
            <div className="ua-t3 gold"><b>{view.counts.todo}</b><small>{t('To do')}</small></div>
            <div className="ua-t3 ok"><b>{view.counts.submitted}</b><small>{t('Submitted')}</small></div>
            <div className="ua-t3 bad"><b>{view.counts.overdue}</b><small>{t('Overdue')}</small></div>
          </div>
        </>
      )}

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
          <div className={native ? 'ua-seg ua-tk-seg' : 'tk2-tabs'} role="tablist" aria-label={t('Tasks')}>
            {FILTERS.map((k) => (
              <button key={k} type="button" role="tab" aria-selected={filter === k} className={(native ? '' : 'tk2-tab') + (filter === k ? ' on' : '') + (k === 'overdue' && view.counts.overdue ? ' alert' : '')} onClick={() => setFilter(k)}>
                {FLABEL[k]}{native ? ' ' + view.counts[k] : <i>{view.counts[k]}</i>}
              </button>
            ))}
          </div>
          <div className="tk2-list" id="tasksList">
            {view.shown.length === 0 ? <div className="tk2-empty small"><p>{t('Nothing here.')}</p></div>
              : view.shown.map(({ task, sub }) => <TaskCard key={task.id} task={task} submission={sub} onSubmitted={reload} t={t} toast={setNote} max={maxPhotos} />)}
          </div>
          <p className="tk2-keep">{t('Uploaded files are kept for 2 months, then deleted automatically. Your grades stay.')}</p>
        </>
      )}
      {note ? <div className="tk2-toast" role="status">{IC.check}{note}</div> : null}
    </section>
  );
}
