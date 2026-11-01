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
import Loader from '../../../components/Loader';
import { LEVEL_LIST, MAX_LEVEL } from '../../../lib/levels';
import { examMax, examPoints, fmtPts } from '../../../lib/scoring';
import LevelResults from './LevelResults';

const CHECK_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
);

/** "Written exams" sub-tab — port of loadWrittenList() and the list markup. Mounted only while the tab is active. */
export default function WrittenExams() {
  const { t, lang } = useCabinetI18n();
  const { user, role, level: myLevel, levelFree, groupCode, groupData } = useDashboardData();
  const userId = user && user.id;
  const isStaff = role === 'teacher';   // teachers only preview the list; admins may take exams (server allows it)

  const [exams, setExams] = useState(null);     // null = loading
  const [subs, setSubs] = useState({});
  const [counts, setCounts] = useState({});
  const [ext, setExt] = useState({});           // exam id -> ISO time the teacher extended MY deadline to
  const [answered, setAnswered] = useState({}); // submission id -> how many questions are already answered (unfinished papers only)
  const [st, setSt] = useState('all');          // status filter: 'all' | 'todo' | 'progress' | 'done'
  const [error, setError] = useState('');
  const [runExam, setRunExam] = useState(null);
  const [lvl, setLvl] = useState('all');          // level filter: 'all' | 1..MAX_LEVEL | 0 (exams without a level)
  const [toastMsg, setToastMsg] = useState(null);
  useScrollTop(runExam ? runExam.id : 'list');
  const toastTimer = useRef(null);
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
      const groupList = await fetchPublishedWrittenExams(groupCode);   // published exams of the group selected at the top
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
  // One place that decides the look of a card: state (css), bucket (status filter), badge text, button.
  const describe = (ex) => {
    const sb = subs[ex.id];
    const extUntil = ext[ex.id] && new Date(ext[ex.id]).getTime() > nowMs ? ext[ex.id] : null;   // teacher gave this student more time
    if (sb && sb.status === 'graded') return { state: 'graded', bucket: 'done', badge: t('Graded'), sb, extUntil };
    if (sb && sb.status === 'submitted') return { state: 'wait', bucket: 'progress', badge: t('Checking…'), sb, extUntil };
    if (sb && sb.status === 'draft') {
      // the exam clock runs on the server: started + duration + paused time. Past it the paper is finished the moment it is opened.
      const dur = ex.duration_minutes ? Number(ex.duration_minutes) * 60000 : 0;
      const t0 = sb.clock_started_at ? new Date(sb.clock_started_at).getTime() : 0;
      const timeUp = !!(dur && t0 && nowMs > t0 + dur + (Number(sb.paused_seconds) || 0) * 1000);
      return { state: timeUp ? 'timeup' : 'draft', bucket: 'progress', badge: timeUp ? t('Time is up') : t('In progress'), sb, extUntil, timeUp };
    }
    if (ex.is_published === false) return { state: 'locked', bucket: 'todo', badge: t('Not open yet'), sb, extUntil };
    if (ex.deadline_at && new Date(ex.deadline_at).getTime() < nowMs && !extUntil) return { state: 'closed', bucket: 'todo', badge: t('Deadline passed'), sb, extUntil };
    return { state: 'new', bucket: 'todo', badge: t('To do'), sb, extUntil };
  };

  const all = (exams || []).map((e) => ({ ex: e, d: describe(e) }));
  const cntBy = { all: all.length, todo: 0, progress: 0, done: 0 };
  all.forEach((r) => { cntBy[r.d.bucket] += 1; });
  const gradedPcts = all.filter((r) => r.d.state === 'graded' && r.d.sb.total_score != null).map((r) => Number(r.d.sb.total_score));
  const avgPct = gradedPcts.length ? Math.round(gradedPcts.reduce((a, b) => a + b, 0) / gradedPcts.length) : null;
  const visible = all.filter((r) => st === 'all' || r.d.bucket === st);

  // Visible exams grouped by level (0 = no level), always shown in level order 1..MAX_LEVEL.
  const LEVEL_NUMS = LEVEL_LIST;
  const byLevel = {};
  visible.forEach((r) => { const k = r.ex.level >= 1 && r.ex.level <= MAX_LEVEL ? r.ex.level : 0; (byLevel[k] = byLevel[k] || []).push(r); });
  const hasOther = (byLevel[0] || []).length > 0;
  const inSection = (k) => all.filter((r) => (r.ex.level >= 1 && r.ex.level <= MAX_LEVEL ? r.ex.level : 0) === k);
  const doneIn = (k) => inSection(k).filter((r) => r.d.bucket === 'done' || r.d.state === 'wait').length;
  const sections = (lvl === 'all' ? [...LEVEL_NUMS, ...(hasOther ? [0] : [])] : [lvl]).filter((k) => (byLevel[k] || []).length);
  const levelName = (k) => (k === 0 ? t('Other exams') : t('Level') + ' ' + k);
  const loc = lang === 'UZ' ? 'uz' : lang === 'RU' ? 'ru' : lang === 'AR' ? 'ar' : 'en';
  const fmtDt = (iso) => new Date(iso).toLocaleString(loc, { dateStyle: 'medium', timeStyle: 'short' });
  const STATUS_TABS = [['all', t('All')], ['todo', t('To do')], ['progress', t('In progress')], ['done', t('Done')]];

  const renderCard = ({ ex, d }) => {
    const sb = d.sb;
    const total = counts[ex.id];
    const ans = sb && sb.status === 'draft' ? (answered[sb.id] || 0) : 0;
    const pct = d.state === 'graded' && sb.total_score != null ? Number(sb.total_score) : null;
    const tone = pct === null ? '' : (pct >= 80 ? ' good' : pct >= 50 ? ' mid' : ' bad');
    const R = 26; const C = 2 * Math.PI * R;
    let action;
    if (d.state === 'graded' || d.state === 'wait') {
      action = <button type="button" className="wl-btn pri" onClick={() => openExam(ex)}>{t('See result')}<span aria-hidden="true">&rarr;</span></button>;
    } else if (d.state === 'timeup') {
      action = <button type="button" className="wl-btn pri" onClick={() => openExam(ex)}>{t('Finish and see result')}<span aria-hidden="true">&rarr;</span></button>;
    } else if (d.state === 'draft') {
      action = <button type="button" className="wl-btn pri" onClick={() => openExam(ex)}>{t('Continue')}<span aria-hidden="true">&rarr;</span></button>;
    } else if (d.state === 'locked') {
      action = <button type="button" className="wl-btn" disabled title={t('Your teacher will open this exam soon.')}>{t('Locked')}</button>;
    } else if (d.state === 'closed') {
      action = <button type="button" className="wl-btn" disabled>{t('Closed')}</button>;
    } else {
      action = <button type="button" className="wl-btn pri" onClick={() => openExam(ex)}>{t('Start')}<span aria-hidden="true">&rarr;</span></button>;
    }
    return (
      <article className={'wl-card ' + d.state} key={ex.id}>
        <div className="wl-top">
          <span className={'wl-badge ' + d.state}>{d.badge}</span>
          {ex.exam_kind && <span className="wl-kind">{ex.exam_kind === 'midterm' ? t('Midterm') : t('Final exam')}</span>}
        </div>
        <div className="wl-body">
          <h3 className="wl-title" dir="auto">{examTitleFor(ex, lang)}</h3>
          {d.state === 'graded' && (
            <div className={'wl-ring' + tone} title={pct + '%'}>
              <svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r={R} className="bg" /><circle cx="32" cy="32" r={R} className="fg" style={{ strokeDasharray: (Math.max(0, Math.min(100, pct)) / 100 * C) + ' ' + C }} /></svg>
              <b>{fmtPts(examPoints(pct, ex.exam_kind))}</b><small>/{examMax(ex.exam_kind)}</small>
            </div>
          )}
        </div>
        <div className="wl-meta">
          <span><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>{total != null ? total : '…'} {t('questions')}</span>
          <span><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9 2h6" /></svg>{ex.duration_minutes ? ex.duration_minutes + ' ' + t('min') : t('No time limit')}</span>
        </div>
        {(d.state === 'draft' || d.state === 'timeup') && total > 0 && (
          <div className="wl-prog" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={ans}>
            <div className="wl-prog-bar"><i style={{ width: Math.min(100, Math.round(ans / total * 100)) + '%' }} /></div>
            <span>{ans} / {total} {t('answered')}</span>
          </div>
        )}
        {d.state === 'graded' && sb.submitted_at && <div className="wl-when">{fmtDt(sb.submitted_at)}</div>}
        {ex.deadline_at && !sb && <div className="wl-when">{t('Deadline')}: {fmtDt(ex.deadline_at)}</div>}
        {d.extUntil && !sb && <div className="wl-when">{t('Extended until')}: {fmtDt(d.extUntil)}</div>}
        <div className="wl-act">{action}</div>
      </article>
    );
  };

  return (
    <>
      {runExam ? (
        <WrittenRunner exam={runExam} existingSub={subs[runExam.id]} userId={userId} onSubChange={onSubChange} onBack={onBack} toast={toast} />
      ) : (
        <div id="weStudentList">
          <PageStyle css={css} />
          {groupData && groupData.name && <div className="we-group-line">{t('Group')}: <b>{groupData.name}</b></div>}
          {!isStaff && <LevelResults userId={userId} />}
          {isStaff && <p className="exam-empty" style={{ textAlign: 'left' }}>{t('Teachers and admins cannot take exams — this is a student view.')}</p>}
          {error ? (
            <p className="exam-empty">{error}</p>
          ) : exams === null ? (
            <Loader inline label={t('Loading…')} />
          ) : exams.length === 0 ? (
            <p className="exam-empty">{t('No written exams for you yet.')}</p>
          ) : (
            <>
              <div className="wl-stats">
                <div className="wl-stat"><span>{t('Exams total')}</span><b>{cntBy.all}</b></div>
                <div className="wl-stat ok"><span>{t('Done')}</span><b>{cntBy.done}</b></div>
                <div className="wl-stat warn"><span>{t('In progress')}</span><b>{cntBy.progress}</b></div>
                <div className="wl-stat"><span>{t('Average score')}</span><b>{avgPct === null ? '\u2014' : avgPct + '%'}</b></div>
              </div>

              <div className="wl-filters">
                <div className="wl-seg" role="tablist" aria-label={t('Your exams')}>
                  {STATUS_TABS.map(([k, label]) => (
                    <button type="button" role="tab" key={k} aria-selected={st === k} className={'wl-segb' + (st === k ? ' on' : '')} onClick={() => setSt(k)}>{label}<em>{cntBy[k]}</em></button>
                  ))}
                </div>
                <div className="wl-levels" role="tablist" aria-label={t('Level')}>
                  <button type="button" role="tab" aria-selected={lvl === 'all'} className={'wl-lvl' + (lvl === 'all' ? ' on' : '')} onClick={() => setLvl('all')}>{t('All')}</button>
                  {LEVEL_NUMS.map((n) => {
                    const total = all.filter((r) => r.ex.level === n).length;
                    const doneN = all.filter((r) => r.ex.level === n && r.d.bucket === 'done').length;
                    return (
                      <button type="button" role="tab" aria-selected={lvl === n} key={n} disabled={total === 0}
                              className={'wl-lvl' + (lvl === n ? ' on' : '') + (total === 0 ? ' zero' : '') + (total > 0 && doneN === total ? ' done' : '')}
                              onClick={() => setLvl(n)}>{t('Level')} {n}<em>{total}</em></button>
                    );
                  })}
                  {all.some((r) => !(r.ex.level >= 1 && r.ex.level <= MAX_LEVEL)) && <button type="button" role="tab" aria-selected={lvl === 0} className={'wl-lvl' + (lvl === 0 ? ' on' : '')} onClick={() => setLvl(0)}>{t('Other exams')}</button>}
                </div>
              </div>

              {sections.length === 0 && <p className="exam-empty">{t('No exams in this filter.')}</p>}
              {sections.map((k) => (
                <section className="wl-sec" key={k}>
                  <div className="wl-sec-head">
                    <span className={'wl-sec-badge' + (k === 0 ? ' none' : '')}>{k === 0 ? '·' : k}</span>
                    <div>
                      <h2 className="wl-sec-title">{levelName(k)}</h2>
                      <div className="wl-sec-sub">{doneIn(k)} / {inSection(k).length} {t('completed')}</div>
                    </div>
                  </div>
                  <div className="wl-grid">
                    {(byLevel[k] || []).map(renderCard)}
                  </div>
                </section>
              ))}
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
