import { useCallback, useEffect, useRef, useState } from 'react';
import { useCabinetI18n } from '../../../context/CabinetI18nContext';
import {
  startExam, fetchAnswers, fetchRunnerQuestions, fetchQuestionCounts, fetchSubmission,
  gradeExam, submitExam, saveAnswers as saveAnswersRpc, friendlyExamError, beginExam, fetchRemaining, translateFeedback,
} from './writtenData';
import { pickFeedback, needsFeedbackTranslation } from '../../../lib/aiFeedback';
import useExamGuard, { GUARD_IS_MOBILE } from '../../../hooks/useExamGuard';
import ExamGuardOverlay from '../../../components/ExamGuardOverlay';
import ExamShell from '../../../components/ExamShell';
import { logViolation } from './integrity';
import { stashRead, stashWrite, stashClear, reportOfflineSeconds } from '../../../lib/examOffline';
import { useDashboardData } from '../../../context/DashboardDataContext';
import { layoutQuestions, splitAnswer, joinAnswer } from '../../../lib/examPaper';
import '../../../styles/exam-paper.css';
import Loader from '../../../components/Loader';
import { FS_STEPS, OFFLINE_BANNER, Grow, isAnswered, wordCount, fmtClock } from './runner/runnerShared';
import ResultReview from './runner/ResultReview';
import ExamIntro from './runner/ExamIntro';
import ConfirmFinish from './runner/ConfirmFinish';
import QuestionCard from './runner/QuestionCard';
import ListeningField, { clearListenPlays } from './runner/ListeningField';

const AUTOSAVE_MS = 15000;   // safety net; typing also saves ~2.5 s after the last keystroke
const DEBOUNCE_MS = 2500;


/**
 * Written-exam runner — port of openExam() / renderRunner() / saveAnswers() / finishExam().
 * Autosaves (2.5 s after typing + every 15 s) while the submission is a draft; read-only once submitted or graded.
 * All writes go through RPCs, so no raw row-level-security error can reach the student.
 */
export default function WrittenRunner({ exam, existingSub, userId, onSubChange, onBack, toast }) {
  const { t, lang } = useCabinetI18n();
  const { name: studentName } = useDashboardData();
  const [sub, setSub] = useState(existingSub || null);
  const [questions, setQuestions] = useState([]);
  const [qCount, setQCount] = useState(null);   // how many questions the exam has (known before the clock starts)
  const [answers, setAnswers] = useState({});   // question_id → saved answer row (scores/feedback live here)
  const [texts, setTexts] = useState({});       // question_id → text currently in the input
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [note, setNote] = useState(null);       // { text, on } — overrides the default status line
  const [finishing, setFinishing] = useState(false);
  const [phase, setPhase] = useState('intro');    // intro → exam → done (only for drafts); read-only papers skip it
  const [aiState, setAiState] = useState('idle'); // idle | checking | done | failed
  const [confirming, setConfirming] = useState(false);
  const [showResult, setShowResult] = useState(false);   // the score window that opens as soon as the AI has finished
  const [idx, setIdx] = useState(0);               // the question on screen (exam room shows one at a time)
  const [flags, setFlags] = useState({});         // question_id → true when marked for review (kept in this browser only)
  const [secLeft, setSecLeft] = useState(null);       // seconds left on the exam clock (null = no time limit)
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');
  const [fs, setFs] = useState(() => { try { const v = parseInt(localStorage.getItem('ufuq-xr-fs'), 10); return v >= 0 && v < FS_STEPS.length ? v : 1; } catch (e) { return 1; } });

  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  const mounted = useRef(true);
  const started = useRef(false);
  const subRef = useRef(existingSub || null);
  const questionsRef = useRef([]);
  const textsRef = useRef({});
  const dirty = useRef(false);
  const saving = useRef(false);
  const deadline = useRef(null);   // performance.now() value at which time runs out (immune to changing the system clock)
  const autoDone = useRef(false);
  const finishRef = useRef(null);
  const aiBusy = useRef(false);       // one AI check at a time per screen (no double runs from Finish + auto-heal + a click)
  const finishing_ = useRef(false);
  const verRef = useRef(0);           // bumps on every edit; a save clears the device copy only if nothing changed meanwhile
  const pausedAt = useRef(null);      // performance.now() when the connection dropped (exam clock frozen while set)
  const offlineSince = useRef(null);  // wall-clock start of the current outage
  const pendingOffline = useRef(0);   // outage seconds the server has not confirmed yet
  const resyncRef = useRef(null);     // the exam clock's server re-check
  const triedTranslate = useRef(new Set());   // 'submissionId|lang' already asked for: one try each, never a loop

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const setSubBoth = useCallback((next) => { subRef.current = next; setSub(next); onSubChange(next); }, [onSubChange]);

  // ---- open: draft → questions → previous answers ----
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const current = await startExam(exam.id);   // resumes the draft / returns the result; server checks group + published
        // Listens are counted per attempt. A paper that is handed in, or a draft whose clock has not started yet (first start, or
        // reopened for a retake), begins with all its listens again; a draft that is already running keeps its count.
        if (current.status !== 'draft' || !current.clock_started_at) clearListenPlays(current.id);
        const [qs, ans, cnt] = await Promise.all([
          fetchRunnerQuestions(exam.id), fetchAnswers(current.id), fetchQuestionCounts([exam.id]).catch(() => ({})),
        ]);
        if (!mounted.current) return;
        setQCount(cnt[exam.id] == null ? null : cnt[exam.id]);
        const byQ = {}; const tx = {};
        ans.forEach((a) => { byQ[a.question_id] = a; tx[a.question_id] = a.answer_text || ''; });
        // A copy kept on this device is newer than the server while a save is pending (e.g. the connection dropped).
        const kept = stashRead(current.id);
        if (current.status === 'draft' && kept) {
          Object.keys(kept).forEach((qid) => { if (typeof kept[qid] === 'string') tx[qid] = kept[qid]; });
          dirty.current = true;
        } else if (current.status !== 'draft') {
          stashClear(current.id);
        }
        subRef.current = current; questionsRef.current = qs; textsRef.current = tx;
        setSubBoth(current); setQuestions(qs); setAnswers(byQ); setTexts(tx);
        setLoading(false);
      } catch (err) {
        if (mounted.current) { setError(t(friendlyExamError(err))); setLoading(false); }
      }
    })();
  }, [exam, userId, setSubBoth]);

  // ---- saving ----
  const saveAnswers = useCallback(async () => {
    const current = subRef.current;
    if (!current || current.status !== 'draft') return;
    const rows = questionsRef.current.map((q) => ({
      submission_id: current.id, question_id: q.id, answer_text: textsRef.current[q.id] || '',
    }));
    if (rows.length === 0) return;
    saving.current = true;
    const ver = verRef.current;
    if (mounted.current) setNote({ text: t('Saving…'), on: false });
    try {
      const stored = await saveAnswersRpc(current.id, rows);
      if (stored === false) {
        // the server refused (the time is over, or the paper is no longer a draft): never show "Saved" and keep the device copy
        if (mounted.current) setNote({ text: t('Time is up — your exam is being submitted.'), on: false });
        return;
      }
      if (verRef.current === ver) { dirty.current = false; stashClear(current.id); }   // nothing typed meanwhile: the device copy is no longer needed
      if (mounted.current) {
        setAnswers((prev) => {
          const next = { ...prev };
          rows.forEach((r) => { next[r.question_id] = { ...(next[r.question_id] || {}), ...r }; });
          return next;
        });
        setNote({ text: t('Saved'), on: true });
      }
    } catch (err) {
      if (mounted.current) setNote({ text: t('Could not save — check your connection.'), on: false });
      throw err;
    } finally {
      saving.current = false;
    }
  }, [t]);

  // Autosave every 15 s while in draft (typing also schedules a save, see onType).
  useEffect(() => {
    if (!sub || sub.status !== 'draft') return undefined;
    const id = setInterval(() => { if (dirty.current && !saving.current) saveAnswers().catch(() => {}); }, AUTOSAVE_MS);
    return () => clearInterval(id);
  }, [sub, saveAnswers]);

  // Leaving mid-exam (tab close, or switching dashboard tabs) shouldn't cost the student their last edits.
  useEffect(() => {
    const flush = () => {
      const s = subRef.current;
      if (dirty.current && s && s.status === 'draft') saveAnswers().catch(() => {});
    };
    window.addEventListener('beforeunload', flush);
    return () => { window.removeEventListener('beforeunload', flush); flush(); };
  }, [saveAnswers]);

  const debounce = useRef(null);
  useEffect(() => () => clearTimeout(debounce.current), []);
  const onType = (qid, value) => {
    textsRef.current = { ...textsRef.current, [qid]: value };
    dirty.current = true;
    verRef.current += 1;
    if (subRef.current) stashWrite(subRef.current.id, textsRef.current);   // kept on this device at once
    setTexts(textsRef.current);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => { if (dirty.current && !saving.current) saveAnswers().catch(() => {}); }, DEBOUNCE_MS);
  };

  const unanswered = () => questionsRef.current.filter((q) => !isAnswered(textsRef.current[q.id])).length;

  // One round: ask the server to grade, wait until the paper really is 'graded', then load the scores.
  // The server grades a student's paper only once: for a paper that is already graded it just answers "already",
  // and when another run holds the paper it answers "busy" and we wait for that run to finish.
  const gradeRound = async (submissionId) => {
    const res = await gradeExam(submissionId, { attempts: 2, jitter: 1500 });
    if (!res || !res.ok) throw new Error((res && res.error) || 'AI check failed');
    // poll for 'graded' for up to ~100 s, slowing down gently so a full group does not hammer the database
    let fresh = await fetchSubmission(submissionId);
    const until = Date.now() + 100000;
    for (let i = 0; fresh && fresh.status !== 'graded' && Date.now() < until; i++) {
      await new Promise((r) => setTimeout(r, Math.min(3000, 1500 + i * 150) + Math.random() * 400));
      if (!mounted.current) return false;
      fresh = await fetchSubmission(submissionId);
    }
    if (!fresh || fresh.status !== 'graded') throw new Error('not graded yet');
    const ans = await fetchAnswers(submissionId);
    if (!mounted.current) return false;
    const byQ = {}; ans.forEach((a) => { byQ[a.question_id] = a; });
    setAnswers(byQ);
    setSubBoth(fresh);
    return true;
  };

  // The AI is the examiner: it grades the paper right after "Finish" and the score window opens at once.
  // If the AI is overloaded (a whole group finishing together) it quietly tries again twice before showing "Check again".
  const runAi = async (submissionId) => {
    if (aiBusy.current) return;
    if (subRef.current && subRef.current.status === 'graded') return;   // already checked once: never checked again
    aiBusy.current = true;
    if (mounted.current) setAiState('checking');
    try {
      let ok = false;
      for (let round = 0; round < 3 && !ok; round++) {
        if (round > 0) {
          await new Promise((r) => setTimeout(r, 5000 * round + Math.random() * 2000));
          if (!mounted.current) return;
        }
        try { ok = await gradeRound(submissionId); } catch (aiErr) { console.error('grade-exam (round ' + (round + 1) + '):', aiErr); }
        if (!mounted.current) return;
      }
      if (ok) { setAiState('done'); setShowResult(true); } else setAiState('failed');
    } finally {
      aiBusy.current = false;
    }
  };

  const finish = async (auto) => {
    const s = subRef.current;
    if (!s || s.status !== 'draft' || finishing_.current) return;
    finishing_.current = true;
    setConfirming(false);
    setFinishing(true);
    let submitted = null;
    try {
      clearTimeout(debounce.current);
      // answers must be safe before the status flips; when the time is up we submit even if this last save fails
      try { await saveAnswers(); } catch (e) { if (!auto) throw e; }
      submitted = await submitExam(s.id);
      // A handed-in paper is never refilled from this device (a teacher retake must start clean).
      stashClear(s.id);
      // The "checking" state is set before the paper is shown as submitted, so no buttons flash in between.
      setAiState('checking');
      setSubBoth(submitted);
      setPhase('done');
    } catch (err) {
      toast(t(friendlyExamError(err)));
      if (auto) autoDone.current = false;   // the clock keeps trying until the paper is handed in
    } finally {
      finishing_.current = false;
      if (mounted.current) setFinishing(false);
    }
    if (submitted) await runAi(submitted.id);
  };
  finishRef.current = finish;

  // Sends the outage time to the server; keeps it for a later try if the server does not confirm.
  const syncOffline = useCallback(async () => {
    const s = subRef.current;
    if (!s || s.status !== 'draft' || pendingOffline.current < 1) return;
    const credited = await reportOfflineSeconds(s.id, Math.round(pendingOffline.current));
    if (credited === null) return;
    pendingOffline.current = 0;
    if (resyncRef.current) resyncRef.current();   // the server clock is the truth again
  }, []);

  // The exam clock. The server owns the time: we get "seconds left" once and count down with the monotonic clock,
  // then re-check with the server every 30 s and whenever the tab comes back, so nothing drifts.
  const timed = secLeft !== null;
  useEffect(() => {
    if (!timed || phase !== 'exam' || !sub || sub.status !== 'draft') return undefined;
    const tick = () => {
      if (deadline.current == null || pausedAt.current !== null) return;   // frozen while the connection is down
      const sec = Math.max(0, Math.ceil((deadline.current - performance.now()) / 1000));
      setSecLeft(sec);
      if (sec <= 0 && !autoDone.current) {
        autoDone.current = true;
        toast(t('Time is up — your exam is being submitted.'));
        if (finishRef.current) finishRef.current(true);
      }
    };
    const resync = async () => {
      if (pendingOffline.current > 0) { syncOffline(); return; }   // the server must first learn about the outage
      try {
        const r = await fetchRemaining(subRef.current.id);
        if (r !== null && r !== undefined) deadline.current = performance.now() + r * 1000;
        tick();
      } catch (e) { /* offline: keep counting locally */ }
    };
    resyncRef.current = resync;
    tick();
    const id = setInterval(tick, 1000);
    const rid = setInterval(resync, 30000);
    const onVis = () => { if (document.visibilityState === 'visible') resync(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); clearInterval(rid); document.removeEventListener('visibilitychange', onVis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timed, phase, sub && sub.status]);

  // Connection drops: the exam clock freezes, answers stay on this device, and everything is sent when it returns.
  useEffect(() => {
    const goOffline = () => {
      setOnline(false);
      if (offlineSince.current === null) offlineSince.current = Date.now();
      if (pausedAt.current === null) pausedAt.current = performance.now();
    };
    const goOnline = () => {
      setOnline(true);
      if (pausedAt.current !== null && deadline.current != null) deadline.current += performance.now() - pausedAt.current;
      pausedAt.current = null;
      if (offlineSince.current !== null) {
        pendingOffline.current += (Date.now() - offlineSince.current) / 1000;
        offlineSince.current = null;
      }
      const s = subRef.current;
      if (s && s.status === 'draft' && (dirty.current || stashRead(s.id))) saveAnswers().catch(() => {});
      syncOffline();
    };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) goOffline();
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, [saveAnswers, syncOffline]);

  // Opening a handed-in paper that was never checked (tab closed, AI was busy) checks it now.
  const healed = useRef(false);
  useEffect(() => {
    if (loading || error || !sub || healed.current) return;
    if (sub.status === 'submitted' && phase !== 'done') { healed.current = true; runAi(sub.id); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, error, sub, phase]);

  // A teacher can reopen a handed-in paper for a retake while the student is looking at the result.
  // Check every 15 s (only while the page is visible and no AI check is running); when the paper is a draft again, reload it.
  useEffect(() => {
    if (!sub || sub.status === 'draft' || aiState === 'checking') return undefined;
    const iv = setInterval(async () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      try {
        const fresh = await fetchSubmission(sub.id);
        if (fresh && fresh.status === 'draft' && mounted.current && typeof window !== 'undefined') window.location.reload();
      } catch (e) { /* offline or a dropped request: try again next time */ }
    }, 15000);
    return () => clearInterval(iv);
  }, [sub && sub.id, sub && sub.status, aiState]);

  // Leaving the exam: warning 1 at once; back within 20 s → warning 2 automatically; away 20 s or more → submitted.
  const guard = useExamGuard({
    active: !loading && !error && !!sub && sub.status === 'draft' && phase === 'exam', wantFullscreen: true,
    onViolation: (kind, count) => logViolation('written', exam.id, kind, count),
    onLimit: () => {
      // submit now, and keep trying (a dropped connection must not let the student off) until the paper is handed in
      let tries = 0;
      const go = () => {
        const cur = subRef.current;
        if (!mounted.current || !cur || cur.status !== 'draft' || tries >= 20) return;
        tries += 1;
        Promise.resolve(finishRef.current && finishRef.current(true)).finally(() => setTimeout(go, 4000));
      };
      setTimeout(go, 1500);
    },
  });

  // text size is remembered; marks for review survive a reload of the same paper
  useEffect(() => { try { localStorage.setItem('ufuq-xr-fs', String(fs)); } catch (e) { /* storage blocked */ } }, [fs]);
  const subId = sub && sub.id;
  useEffect(() => {
    if (!subId) return;
    try { setFlags(JSON.parse(localStorage.getItem('ufuq-xr-flags:' + subId) || '{}') || {}); } catch (e) { /* ignore */ }
  }, [subId]);
  useEffect(() => {
    if (!subId) return;
    try { localStorage.setItem('ufuq-xr-flags:' + subId, JSON.stringify(flags)); } catch (e) { /* ignore */ }
  }, [flags, subId]);

  const goIdx = useCallback((i) => setIdx((cur) => Math.max(0, Math.min(questionsRef.current.length - 1, typeof i === 'function' ? i(cur) : i))), []);
  const goTo = useCallback((id) => { const i = questionsRef.current.findIndex((q) => q.id === id); if (i >= 0) setIdx(i); }, []);

  // a new question: back to the top of the card, and (on a computer) straight into the answer box
  useEffect(() => {
    if (phase !== 'exam') return undefined;
    const body = document.getElementById('xrBody');
    if (body) body.scrollTo({ top: 0 });
    if (window.innerWidth <= 860) return undefined;
    const tm = setTimeout(() => { const f = document.querySelector('.xq textarea, .xq input, .xq select'); if (f) f.focus({ preventScroll: true }); }, 60);
    return () => clearTimeout(tm);
  }, [idx, phase]);

  // Alt + ← / → moves between questions without leaving the keyboard
  useEffect(() => {
    if (phase !== 'exam') return undefined;
    const onKey = (e) => {
      if (!e.altKey) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); goIdx((c) => c + 1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); goIdx((c) => c - 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, goIdx]);

  // Phones: swipe sideways to move between questions, and an answer box you tap is scrolled above the keyboard.
  useEffect(() => {
    if (phase !== 'exam') return undefined;
    const body = document.getElementById('xrBody');
    if (!body) return undefined;
    const buzz = () => { try { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(8); } catch (e) { /* ignore */ } };
    let x0 = 0; let y0 = 0; let t0 = 0; let ok = false;
    const start = (e) => {
      if (!e.touches || e.touches.length !== 1) { ok = false; return; }
      const tg = e.target;
      ok = !(tg && tg.closest && tg.closest('textarea, input, select, [contenteditable]'));
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now();
    };
    const end = (e) => {
      if (!ok) return;
      ok = false;
      const p = e.changedTouches && e.changedTouches[0];
      if (!p) return;
      const dx = p.clientX - x0; const dy = p.clientY - y0;
      if (Math.abs(dx) > 70 && Math.abs(dy) < 45 && Date.now() - t0 < 600) {
        const next = document.documentElement.dir === 'rtl' ? dx > 0 : dx < 0;
        goIdx((c) => c + (next ? 1 : -1));
        buzz();
      }
    };
    const onFocusIn = (e) => {
      if (window.innerWidth > 860) return;
      const el = e.target;
      if (el && /^(TEXTAREA|INPUT|SELECT)$/.test(el.tagName)) setTimeout(() => { try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (x) { /* ignore */ } }, 350);
    };
    body.addEventListener('touchstart', start, { passive: true });
    body.addEventListener('touchend', end, { passive: true });
    body.addEventListener('focusin', onFocusIn);
    return () => { body.removeEventListener('touchstart', start); body.removeEventListener('touchend', end); body.removeEventListener('focusin', onFocusIn); };
  }, [phase, goIdx]);

  // AI comments are written in all four languages. A result saved before that (Uzbek only) is translated once,
  // the first time it is opened in another language; until it arrives the Uzbek text is shown.
  useEffect(() => {
    if (!sub || sub.status !== 'graded') return undefined;
    if (!needsFeedbackTranslation(answers, lang)) return undefined;
    const key = sub.id + '|' + lang;
    if (triedTranslate.current.has(key)) return undefined;
    triedTranslate.current.add(key);
    (async () => {
      const changed = await translateFeedback(sub.id);
      if (!changed || !mounted.current) return;
      try {
        const ans = await fetchAnswers(sub.id);
        if (!mounted.current) return;
        const byQ = {}; ans.forEach((a) => { byQ[a.question_id] = a; });
        setAnswers(byQ);
      } catch (e) { /* the Uzbek text stays */ }
    })();
    return undefined;
  }, [sub, answers, lang]);

  if (loading) return <div id="weRunner"><Loader inline label={t('Loading…')} /></div>;
  if (error) return <div id="weRunner"><p className="exam-empty">{error}</p></div>;

  const readOnly = sub.status !== 'draft';
  const approved = sub.status === 'graded';
  const laid = layoutQuestions(questions);
  const doneCount = questions.filter((q) => isAnswered(texts[q.id])).length;
  const total = questions.length;
  const saveChip = note
    ? <span className={'xr-chip save' + (note.on ? ' ok' : '')}><i className={'xr-dotlive' + (note.on ? '' : ' busy')} /><span className="t">{note.text}</span></span>
    : <span className="xr-chip save ok"><i className="xr-dotlive" /><span className="t">{t('Saved')}</span></span>;

  // ---- one answer box, shared by the exam room and the read-only paper ----
  const buildField = (q, bank, val, item) => {
    if (item && item.audio && item.opts && item.opts.length > 1) {
      return <ListeningField subId={sub.id} qid={q.id} audio={item.audio} opts={item.opts} value={val || ''} readOnly={readOnly} onPick={(o) => onType(q.id, o)} />;
    }
    const ph = readOnly ? undefined : t('Write your answer here');
    let field;
        if (q.type === 'matching' || q.type === 'antonym') {
          const { word, sentence } = splitAnswer(val);
          const setWord = (w) => onType(q.id, joinAnswer(w, sentence));
          const setSentence = (x) => onType(q.id, joinAnswer(word, x));
          field = (
            <div className="pp-fields">
              {q.type === 'matching' && bank && bank.length
                ? (
                  <select className="pp-select" dir="auto" value={word} disabled={readOnly} onChange={(e) => setWord(e.target.value)}>
                    <option value="">{t('Choose the partner word…')}</option>
                    {bank.map((w) => <option key={w} value={w}>{w}</option>)}
                  </select>
                ) : (
                  <input type="text" className="pp-line" dir="auto" data-we-answer={q.id} value={word} readOnly={readOnly} autoComplete="off" spellCheck={false}
                         placeholder={ph && t(q.type === 'antonym' ? 'Antonym' : 'Partner word')} onChange={(e) => setWord(e.target.value)} />
                )}
              <input type="text" className="pp-line" dir="auto" value={sentence} readOnly={readOnly} autoComplete="off" spellCheck={false}
                     placeholder={ph && t('Write a sentence')} onChange={(e) => setSentence(e.target.value)} />
            </div>
          );
        } else if (q.type === 'essay') {
          field = (<>
            <Grow className="pp-lines pp-essay" dir="auto" data-we-answer={q.id} value={val} readOnly={readOnly} placeholder={ph} spellCheck={false} onChange={(e) => onType(q.id, e.target.value)} />
            {!readOnly && <div className="xr-count">{t('Words')}: {wordCount(val)}</div>}
          </>);
        } else if (q.type === 'grammar') {
          field = <Grow className="pp-lines" dir="auto" data-we-answer={q.id} value={val} readOnly={readOnly} placeholder={ph} spellCheck={false} onChange={(e) => onType(q.id, e.target.value)} />;
        } else {
          field = <Grow className="pp-line" dir="auto" rows={1} data-we-answer={q.id} value={val} readOnly={readOnly} placeholder={ph} spellCheck={false} onChange={(e) => onType(q.id, e.target.value)} />;
        }
    return field;
  };

  // =============== handed in: result review (graded) or "checking" card (not graded yet) ===============
  const checkIcon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>;
  const backBtn = <button type="button" className="xr-btn" onClick={onBack}>{t('Back to exams')}</button>;

  if (readOnly) {
    if (!approved) {
      // While the AI works: a spinner only. If it could not finish: one "check again" that checks just the missing answers.
      const failed = aiState === 'failed';
      return (
        <ExamShell title={exam.title} subtitle={t('Review your answers')} right={failed ? backBtn : null}>
          {failed ? (
            <div className="xr-done">
              <div className="xr-check">{checkIcon}</div>
              <h2>{t('Your exam is submitted')}</h2>
              <p>{t('The AI could not check it just now. Your answers are safe — try again.')}</p>
              <div className="xr-done-actions">
                {backBtn}
                <button type="button" className="xr-btn pri" onClick={() => runAi(sub.id)}>{t('Check again')}</button>
              </div>
            </div>
          ) : (
            <div className="xr-done">
              <Loader inline size="lg" />
              <h2>{t('AI is checking your answers')}</h2>
              <p>{t('Your result will appear in a moment.')}</p>
            </div>
          )}
        </ExamShell>
      );
    }

    return <ResultReview t={t} lang={lang} exam={exam} sub={sub} laid={laid} answers={answers} texts={texts}
                         showResult={showResult} onCloseResult={() => setShowResult(false)} onBack={onBack} backBtn={backBtn} />;
  }

  if (phase === 'intro') {
    const mins = exam.duration_minutes;
    // before the clock starts the server withholds the question text, so the count comes from qCount
    // (null = count unavailable: let the student press Start; the questions are loaded right after)
    const introTotal = total > 0 ? total : (qCount && qCount > 0 ? qCount : null);
    const startErr = startError;
    const resumed = Object.values(texts).some((v) => isAnswered(v));
    const rules = [
      ...(GUARD_IS_MOBILE ? [] : [['\u26F6', t('The exam opens in full screen.')]]),
      ['\u2298', t('Copying, pasting, cutting, right-click, printing and text selection are disabled.')],
      ['\u26A0', t('Leaving the page, switching tabs or windows, or exiting full screen is recorded and shown to your teacher.')],
      ...(mins ? [['\u23F1', t('Time limit') + ': ' + mins + ' ' + t('min') + '. ' + t('The timer starts when you press Start and cannot be paused.')]] : []),
      ['\u2691', t('If you leave the exam you get a warning at once. After 20 seconds away you get the second warning; after 20 more seconds the exam is submitted automatically.')],
      ['\u2713', t('Your answers are saved automatically. The AI checks them as soon as you finish.')],
    ];
    const begin = async () => {
      if (starting) return;
      setStarting(true);
      try {
        const rem = await beginExam(sub.id);   // the server starts (or resumes) the clock
        if (questionsRef.current.length === 0) {
          // questions are released by the server only once the clock runs, so load them now
          // a short retry: the server may need a moment right after the clock starts
          let qs = await fetchRunnerQuestions(exam.id);
          for (let k = 0; k < 2 && qs.length === 0; k++) {
            await new Promise((r) => setTimeout(r, 700));
            qs = await fetchRunnerQuestions(exam.id);
          }
          if (qs.length === 0) throw new Error(t('No questions yet.'));
          questionsRef.current = qs; setQuestions(qs); setQCount(qs.length);
        }
        setStartError('');
        if (rem !== null) { deadline.current = performance.now() + rem * 1000; setSecLeft(rem); }
        const el = document.documentElement;
        if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {});
        setPhase('exam');
      } catch (err) {
        const msg = t(friendlyExamError(err));
        setStartError(msg);
        toast(msg);
      } finally {
        if (mounted.current) setStarting(false);
      }
    };
    return (
      <ExamIntro t={t} exam={exam} mins={mins} introTotal={introTotal} resumed={resumed} doneCount={doneCount} total={total} rules={rules}
                 startErr={startErr} starting={starting} onBack={onBack} onBegin={begin} />
    );
  }

  const left = unanswered();

  // every question carries its part / section heading, so the context is never lost when one question is shown at a time
  const ctxs = [];
  { let part = ''; let sec = ''; laid.forEach((l, i) => { if (l.partHead) part = l.partHead; if (l.secHead) sec = l.secHead; ctxs[i] = { part, sec }; }); }
  // the question list shows short group names (Section 1, Section 2 …); the full instruction stays on the question card
  const secNo = [];
  { let n = 0; let key = '|'; laid.forEach((l, i) => { const k = (ctxs[i].part || '') + '|' + (ctxs[i].sec || ''); if (k !== '|' && k !== key) { n += 1; key = k; } secNo[i] = k === '|' ? 0 : n; }); }
  const cur = Math.min(idx, Math.max(0, total - 1));
  const item = laid[cur];
  const q = item ? item.q : null;
  const qval = q ? (texts[q.id] || '') : '';
  const flagged = !!(q && flags[q.id]);
  const flagCount = laid.filter((l) => flags[l.q.id]).length;
  const unansweredIdx = laid.map((l, i) => (isAnswered(texts[l.q.id]) ? -1 : i)).filter((i) => i >= 0);
  const flaggedIdx = laid.map((l, i) => (flags[l.q.id] ? i : -1)).filter((i) => i >= 0);
  const toggleFlag = () => { if (q) setFlags((f) => ({ ...f, [q.id]: !f[q.id] })); };
  const isLast = cur >= total - 1;

  const ICON_PREV = <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>;
  const ICON_NEXT = <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>;

  const finishBtn = <button type="button" className="xr-btn ok" disabled={finishing} onClick={() => setConfirming(true)}>{t('Finish and submit')}</button>;

  return (
    <>
    <ExamShell
      title={exam.title} subtitle={doneCount + ' / ' + total + ' ' + t('answered')}
      progress={{ done: doneCount, total }}
      current={{ n: cur + 1, total }}
      navTitle={t('Question list')}
      navLegend={{ done: t('Answered'), todo: t('Not answered'), flag: t('Marked'), current: t('Current') }}
      right={<>
        {timed && <span className={'xr-chip timer' + (secLeft <= 60 ? ' crit' : secLeft <= 300 ? ' warn' : '')} role="timer" aria-label={t('Time left')} title={t('Time left')}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9 2h6" /></svg>
          <b>{fmtClock(secLeft)}</b>{!online ? ' ⏸' : ''}</span>}
        <div className="xr-tools" role="group" aria-label={t('Text size')}>
          <button type="button" className="xr-tool s" disabled={fs <= 0} onClick={() => setFs((v) => Math.max(0, v - 1))} aria-label={t('Smaller text')} title={t('Smaller text')}>A</button>
          <button type="button" className="xr-tool l" disabled={fs >= FS_STEPS.length - 1} onClick={() => setFs((v) => Math.min(FS_STEPS.length - 1, v + 1))} aria-label={t('Larger text')} title={t('Larger text')}>A</button>
        </div>
        {guard.warnings > 0 && <span className="xr-chip warn">{'\u26A0'} {t('Warnings')}: {guard.warnings}</span>}
        {saveChip}
      </>}
      nav={laid.map((l, i) => ({ id: l.q.id, label: String(i + 1), done: isAnswered(texts[l.q.id]), current: i === cur, flag: !!flags[l.q.id], group: secNo[i] ? t('Section') + ' ' + secNo[i] : '' }))}
      onNav={goTo}
      navActions={finishBtn}
      footerCenter={<>
        <button type="button" className="xr-btn" disabled={cur <= 0} onClick={() => goIdx(cur - 1)}>{ICON_PREV}{t('Previous')}</button>
        {isLast
          ? <button type="button" className="xr-btn pri" disabled={finishing} onClick={() => setConfirming(true)}>{t('Review and finish')}</button>
          : <button type="button" className="xr-btn pri" onClick={() => goIdx(cur + 1)}>{t('Next')}{ICON_NEXT}</button>}
      </>}
      footerRight={<><span className="xr-foot-l">{doneCount}/{total} {t('answered')}</span>{finishBtn}</>}
      overlay={confirming ? (
        <ConfirmFinish t={t} left={left} total={total} flagCount={flagCount} unansweredIdx={unansweredIdx} flaggedIdx={flaggedIdx}
                       onClose={() => setConfirming(false)} onJump={(i) => { setConfirming(false); setIdx(i); }} onFinish={() => finish()} />
      ) : null}
    >
      {!q ? <p className="xq-empty">{t('No questions yet.')}</p> : (
        <QuestionCard t={t} q={q} item={item} cur={cur} total={total} qval={qval} flagged={flagged} ctx={ctxs[cur]} scale={FS_STEPS[fs]}
                      field={buildField(q, item.bank, qval, item)} onToggleFlag={toggleFlag} />
      )}
    </ExamShell>
    {!online && phase === 'exam' && !readOnly && (
      <div role="status" style={OFFLINE_BANNER}>
        <b>{t('No internet connection.')}</b> {t('Your answers are kept on this device and the exam timer is paused. Everything is sent automatically when the connection returns.')}
      </div>
    )}
    <ExamGuardOverlay t={t} warning={guard.warning} max={guard.maxWarnings} onContinue={guard.dismiss} />
    </>
  );
}
