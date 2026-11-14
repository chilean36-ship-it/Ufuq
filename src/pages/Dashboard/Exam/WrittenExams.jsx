import { useCallback, useEffect, useRef, useState } from 'react';
import { useCabinetI18n } from '../../../context/CabinetI18nContext';
import { useDashboardData } from '../../../context/DashboardDataContext';
import { fetchAnswerCounts, fetchMyExtensions, fetchMyLevelExams, fetchMySubmissions, fetchPublishedWrittenExams, fetchQuestionCounts, friendlyExamError, gradeExam } from './writtenData';
import WrittenRunner from './WrittenRunner';
import useScrollTop from '../../../hooks/useScrollTop';
import { examTitleFor } from '../../../lib/examTitle';
import useLiveRefresh from '../../../lib/liveRefresh';
import PageStyle from '../../../components/PageStyle';
import css from '../../../styles/exam-list.css?inline';
import css2 from '../../../styles/exam-list2.css?inline';
import Loader from '../../../components/Loader';
import { examMax, examPoints, fmtPts } from '../../../lib/scoring';
import { LevelCard } from './LevelResults';

const CHECK_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
);
const sv = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
const ICON = {
  midterm: <svg {...sv}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></svg>,
  final: <svg {...sv}><circle cx="12" cy="9" r="6" /><path d="M8.5 14L7 22l5-3 5 3-1.5-8" /></svg>,
  custom: <svg {...sv}><path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>,
  clock: <svg {...sv} width="15" height="15"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9 2h6" /></svg>,
  list: <svg {...sv} width="15" height="15"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>,
  cal: <svg {...sv} width="15" height="15"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>,
  arrow: <svg {...sv} width="16" height="16"><path d="M5 12h14M13 6l6 6-6 6" /></svg>,
  lock: <svg {...sv} width="16" height="16"><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>,
};

/** Student's Exams page. One clear next step on top, your level progress, then a short list of exams (To do / Done / All). */
export default function WrittenExams({ levelData }) {
  const { t, lang } = useCabinetI18n();
  const { user, role, level: myLevel, levelFree, groupCode, groupData } = useDashboardData();
  const userId = user && user.id;
  const isStaff = role === 'teacher';   // teachers only preview the list; admins may take exams (server allows it)

  const [exams, setExams] = useState(null);     // null = loading
  const [subs, setSubs] = useState({});
  const [counts, setCounts] = useState({});
  const [ext, setExt] = useState({});           // exam id -> ISO time the teacher extended MY deadline to
  const [answered, setAnswered] = useState({}); // submission id -> how many questions are already answered (unfinished papers only)
  const [tab, setTab] = useState(null);         // 'todo' | 'done' | 'all' (null = decided after the first load)
  const [error, setError] = useState('');
  const [runExam, setRunExam] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);
  useScrollTop(runExam ? runExam.id : 'list');
  const toastTimer = useRef(null);
  const [, setTick] = useState(0);            // re-render every 30 s: an exam flips from "Opens soon" to "Start" by itself
  useEffect(() => { const id = setInterval(() => setTick((n) => n + 1), 30000); return () => clearInterval(id); }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // The dashboard has one save-chip and no general toast, so reuse the same markup (original weToast()).
  const toast = useCallback((msg) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2800);
  }, []);

  // `silent` = the 5-second background refresh: no loading state, no error message, and nothing re-renders unless the data changed
  const sigRef = useRef('');
  const load = useCallback(async (opts) => {
    const silent = !!(opts && opts.silent);
    if (!silent) { setExams(null); setError(''); sigRef.current = ''; }
    try {
      // published exams of the group selected at the top; with no running group there is no group list (only the level exams below)
      const groupList = groupCode ? await fetchPublishedWrittenExams(groupCode) : [];
      // Midterm / final exams belong to a LEVEL: every student of the level sees them in any group, locked until a teacher opens them.
      const levelList = isStaff || levelFree ? [] : await fetchMyLevelExams();
      const isLevelExam = (e) => !!(e.exam_kind && e.level);
      const levelIds = new Set(levelList.map((e) => e.id));
      const list = isStaff || levelFree
        ? groupList
        : [...levelList, ...groupList.filter((e) => !levelIds.has(e.id))];
      let s = {}; let c = {}; let x = {};
      if (list.length > 0) {
        const ids = list.map((e) => e.id);
        [s, c, x] = await Promise.all([fetchMySubmissions(userId, ids), fetchQuestionCounts(ids), fetchMyExtensions(userId, ids).catch(() => ({}))]);
      }
      // A regular student: level exams come from the level list (one copy per level + kind); the group list adds only the
      // custom exams and papers the student already started. A free account / staff see the group list as it is.
      const shown = isStaff || levelFree
        ? list
        : list.filter((e) => !isLevelExam(e) || levelIds.has(e.id) || s[e.id]);
      const draftIds = Object.values(s).filter((r) => r.status === 'draft').map((r) => r.id);
      const a = await fetchAnswerCounts(draftIds).catch(() => ({}));
      const sig = JSON.stringify([shown, s, c, x, a]);
      if (silent && sig === sigRef.current) return;
      sigRef.current = sig;
      setSubs(s); setCounts(c); setExt(x); setAnswered(a); setExams(shown); setError('');
    } catch (err) {
      if (silent) return;
      setError(t(friendlyExamError(err)));
      setExams([]);
    }
  }, [userId, groupCode, isStaff, myLevel, levelFree]);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh((o) => (runExam ? undefined : load(o)));

  // Self-healing: a paper handed in but never checked (tab closed, AI busy) is checked now, once per paper per visit.
  const healed = useRef({});
  useEffect(() => {
    if (isStaff || !exams) return;
    Object.values(subs).filter((x) => x.status === 'submitted' && !healed.current[x.id]).forEach((x) => {
      healed.current[x.id] = true;
      gradeExam(x.id, { attempts: 2 }).then(() => load()).catch(() => { /* the card keeps saying "not checked yet"; the next visit tries again */ });
    });
  }, [subs, exams, isStaff, load]);

  const onSubChange = useCallback((sub) => {
    if (sub) setSubs((prev) => ({ ...prev, [sub.exam_id]: sub }));
  }, []);
  const onBack = useCallback(() => { setRunExam(null); load(); }, [load]);

  const openExam = (ex) => {
    if (!userId) { toast(t('Loading…')); return; }
    if (isStaff) { toast(t('Teachers and admins cannot take exams — this is a student view.')); return; }
    setRunExam(ex);
  };

  // ---- what each card shows ----
  const nowMs = Date.now();
  // One place that decides the look of a card: state (css), bucket (tab), badge text.
  const describe = (ex) => {
    const sb = subs[ex.id];
    const extUntil = ext[ex.id] && new Date(ext[ex.id]).getTime() > nowMs ? ext[ex.id] : null;   // teacher gave this student more time
    if (sb && sb.status === 'graded') return { state: 'graded', bucket: 'done', badge: t('Graded'), sb, extUntil };
    if (sb && sb.status === 'submitted') return { state: 'wait', bucket: 'done', badge: t('Checking…'), sb, extUntil };
    if (sb && sb.status === 'draft') {
      // the exam clock runs on the server: started + duration + paused time. Past it the paper is finished the moment it is opened.
      const dur = ex.duration_minutes ? Number(ex.duration_minutes) * 60000 : 0;
      const t0 = sb.clock_started_at ? new Date(sb.clock_started_at).getTime() : 0;
      const timeUp = !!(dur && t0 && nowMs > t0 + dur + (Number(sb.paused_seconds) || 0) * 1000);
      return { state: timeUp ? 'timeup' : 'draft', bucket: 'todo', badge: timeUp ? t('Time is up') : t('In progress'), sb, extUntil, timeUp };
    }
    if (ex.is_published === false) return { state: 'locked', bucket: 'todo', badge: t('Not open yet'), sb, extUntil };
    if (ex.open_at && new Date(ex.open_at).getTime() > nowMs) return { state: 'soon', bucket: 'todo', badge: t('Opens soon'), sb, extUntil };
    if (ex.deadline_at && new Date(ex.deadline_at).getTime() < nowMs && !extUntil) return { state: 'closed', bucket: 'todo', badge: t('Deadline passed'), sb, extUntil };
    return { state: 'new', bucket: 'todo', badge: t('To do'), sb, extUntil };
  };

  const loc = lang === 'UZ' ? 'uz' : lang === 'RU' ? 'ru' : lang === 'AR' ? 'ar' : 'en';
  const fmtDt = (iso) => new Date(iso).toLocaleString(loc, { dateStyle: 'medium', timeStyle: 'short' });
  // "in 2 days" / "in 3 hours", written in the page language by the browser (no extra translations needed)
  const relTime = (iso) => {
    try {
      const mins = Math.round((new Date(iso).getTime() - nowMs) / 60000);
      const rtf = new Intl.RelativeTimeFormat(loc, { numeric: 'auto' });
      if (Math.abs(mins) < 60) return rtf.format(mins, 'minute');
      const hrs = Math.round(mins / 60);
      if (Math.abs(hrs) < 48) return rtf.format(hrs, 'hour');
      return rtf.format(Math.round(hrs / 24), 'day');
    } catch (e) { return ''; }
  };

  const all = (exams || []).map((e) => ({ ex: e, d: describe(e) }));
  const todoList = all.filter((r) => r.d.bucket === 'todo');
  const doneList = all.filter((r) => r.d.bucket === 'done');
  // open / running exams first, then the ones that are locked or closed; nearest deadline first inside each group
  const rank = (r) => (r.d.state === 'draft' || r.d.state === 'timeup' ? 0 : r.d.state === 'new' ? 1 : r.d.state === 'soon' ? 2 : r.d.state === 'locked' ? 3 : 4);
  const byDeadline = (a, b) => rank(a) - rank(b) || String(a.ex.deadline_at || '9999').localeCompare(String(b.ex.deadline_at || '9999')) || (a.ex.level || 0) - (b.ex.level || 0);
  todoList.sort(byDeadline);
  doneList.sort((a, b) => String((b.d.sb && b.d.sb.submitted_at) || '').localeCompare(String((a.d.sb && a.d.sb.submitted_at) || '')));
  const activeTab = tab || (todoList.length > 0 || doneList.length === 0 ? 'todo' : 'done');
  const visible = activeTab === 'todo' ? todoList : activeTab === 'done' ? doneList : [...todoList, ...doneList];
  const next = todoList.find((r) => r.d.state === 'draft' || r.d.state === 'timeup' || r.d.state === 'new') || null;

  const actionOf = (ex, d, big) => {
    const cls = 'ex2-btn pri' + (big ? ' big' : '');
    if (d.state === 'graded' || d.state === 'wait') return <button type="button" className="ex2-btn" onClick={() => openExam(ex)}>{t('See result')}{ICON.arrow}</button>;
    if (d.state === 'timeup') return <button type="button" className={cls} onClick={() => openExam(ex)}>{t('Finish and see result')}{ICON.arrow}</button>;
    if (d.state === 'draft') return <button type="button" className={cls} onClick={() => openExam(ex)}>{t('Continue')}{ICON.arrow}</button>;
    if (d.state === 'locked') return <button type="button" className="ex2-btn" disabled title={t('Your teacher will open this exam soon.')}>{ICON.lock}{t('Locked')}</button>;
    if (d.state === 'soon') return <button type="button" className="ex2-btn" disabled title={t('You can start this exam from the opening time.')}>{ICON.lock}{t('Opens soon')}</button>;
    if (d.state === 'closed') return <button type="button" className="ex2-btn" disabled>{t('Closed')}</button>;
    return <button type="button" className={cls} onClick={() => openExam(ex)}>{t('Start')}{ICON.arrow}</button>;
  };

  const metaOf = (ex, d, withDeadline) => {
    const total = counts[ex.id];
    return (
      <div className="ex2-meta">
        <span>{ICON.list}{total != null ? total : '…'} {t('questions')}</span>
        <span>{ICON.clock}{ex.duration_minutes ? ex.duration_minutes + ' ' + t('min') : t('No time limit')}</span>
        {ex.open_at && !d.sb && d.state === 'soon' && <span className="dl soon">{ICON.cal}{t('Opens at')}: {fmtDt(ex.open_at)}<em>{relTime(ex.open_at)}</em></span>}
        {withDeadline && ex.deadline_at && !d.sb && <span className={'dl' + (new Date(ex.deadline_at).getTime() - nowMs < 86400000 * 2 ? ' soon' : '')}>{ICON.cal}{t('Deadline')}: {fmtDt(ex.deadline_at)}<em>{relTime(ex.deadline_at)}</em></span>}
        {d.extUntil && !d.sb && <span className="dl ext">{ICON.cal}{t('Extended until')}: {fmtDt(d.extUntil)}</span>}
      </div>
    );
  };

  const kindIcon = (ex) => (ex.exam_kind === 'final' ? ICON.final : ex.exam_kind === 'midterm' ? ICON.midterm : ICON.custom);
  const kindName = (ex) => (ex.exam_kind === 'midterm' ? t('Midterm') : ex.exam_kind === 'final' ? t('Final exam') : t('Exam'));

  const renderRow = ({ ex, d }) => {
    const sb = d.sb;
    const total = counts[ex.id];
    const ans = sb && sb.status === 'draft' ? (answered[sb.id] || 0) : 0;
    const pct = d.state === 'graded' && sb.total_score != null ? Number(sb.total_score) : null;
    const tone = pct === null ? '' : (pct >= 80 ? ' good' : pct >= 50 ? ' mid' : ' bad');
    return (
      <article className={'ex2-row ' + d.state + (next && next.ex.id === ex.id ? ' is-next' : '')} key={ex.id}>
        <span className={'ex2-ico ' + (ex.exam_kind || 'custom')}>{kindIcon(ex)}</span>
        <div className="ex2-main">
          <div className="ex2-tags">
            <span className={'ex2-badge ' + d.state}>{d.badge}</span>
            <span className="ex2-tag">{kindName(ex)}{ex.level ? ' · ' + t('Level') + ' ' + ex.level : ''}</span>
          </div>
          <h3 className="ex2-title" dir="auto">{examTitleFor(ex, lang)}</h3>
          {metaOf(ex, d, true)}
          {(d.state === 'draft' || d.state === 'timeup') && total > 0 && (
            <div className="ex2-prog" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={ans}>
              <div className="ex2-prog-bar"><i style={{ width: Math.min(100, Math.round(ans / total * 100)) + '%' }} /></div>
              <span>{ans} / {total} {t('answered')}</span>
            </div>
          )}
          {d.state === 'graded' && sb.submitted_at && <div className="ex2-when">{fmtDt(sb.submitted_at)}</div>}
        </div>
        <div className="ex2-side">
          {pct !== null && <div className={'ex2-score' + tone}><b>{fmtPts(examPoints(pct, ex.exam_kind))}</b><small>/ {examMax(ex.exam_kind)}</small></div>}
          {actionOf(ex, d, false)}
        </div>
      </article>
    );
  };

  const TABS = [['todo', t('To do'), todoList.length], ['done', t('Done'), doneList.length], ['all', t('All'), all.length]];

  return (
    <>
      {runExam ? (
        <WrittenRunner exam={runExam} existingSub={subs[runExam.id]} userId={userId} onSubChange={onSubChange} onBack={onBack} toast={toast} />
      ) : (
        <div id="weStudentList" className="ex2">
          <PageStyle css={css + css2} />
          {groupData && groupData.name && <div className="we-group-line">{t('Group')}: <b>{groupData.name}</b></div>}
          {isStaff && <p className="exam-empty" style={{ textAlign: 'left' }}>{t('Teachers and admins cannot take exams — this is a student view.')}</p>}
          {error ? (
            <p className="exam-empty">{error}</p>
          ) : exams === null ? (
            <Loader inline label={t('Loading…')} />
          ) : (
            <>
              {!isStaff && <LevelCard data={levelData} />}

              {exams.length === 0 ? (
                <p className="exam-empty">{t('No written exams for you yet.')}</p>
              ) : (
                <>
                  <div className="ex2-tabs" role="tablist" aria-label={t('Your exams')}>
                    {TABS.map(([k, label, n]) => (
                      <button type="button" role="tab" key={k} aria-selected={activeTab === k} className={'ex2-tab' + (activeTab === k ? ' on' : '')} onClick={() => setTab(k)}>{label}<i>{n}</i></button>
                    ))}
                  </div>
                  {visible.length === 0
                    ? <p className="exam-empty">{activeTab === 'todo' ? t('You have no exams to take right now.') : t('Nothing here.')}</p>
                    : <div className="ex2-list">{visible.map(renderRow)}</div>}
                </>
              )}
            </>
          )}
        </div>
      )}
      <div className={'save-toast' + (toastMsg ? ' show' : '')} id="saveToast">
        {CHECK_ICON}<span>{toastMsg || ''}</span>
      </div>
    </>
  );
}
