import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import useLiveRefresh from '../../lib/liveRefresh';
import { usePanel } from '../../components/panel/PanelContext';
import { Modal } from '../../components/panel/ui';
import { TYPE_LABEL, plainQ } from '../../lib/examPaper';
import { examTitleFor } from '../../lib/examTitle';
import { pickFeedback, needsFeedbackTranslation } from '../../lib/aiFeedback';
import PageStyle from '../../components/PageStyle';
import listCss from '../../styles/exam-builder.css?inline';
import ExamEditor from './ExamEditor';
import MissedStudentsModal from './MissedStudentsModal';
import ExamResultsModal from './ExamResultsModal';
import '../../styles/exam-paper.css';
import Loader from '../../components/Loader';
import RichQ from '../../components/RichQ';

import { fmtDateTime as fmtDateTimeL } from '../../lib/dateLocale';
import { LEVEL_LIST, MAX_LEVEL } from '../../lib/levels';
import { examMax, examPoints, fmtPts } from '../../lib/scoring';
/** "Written exams" sub-tab of Exams: per-group exam list (draft/published, question & submission counts),
 *  a paper-style builder (sections, one item per line, ready-made templates), publish gating (needs ≥1 question),
 *  a results table per student, and a grading view that shows the AI score/feedback alongside a teacher-score
 *  override, with a "Re-run AI check" button that calls the `grade-exam` edge function. */
export default function WrittenExamsPanel() {
  const { t, lang, toast, askConfirm, currentGroup: g } = usePanel();
  const code = g ? g.code : null;
  const [exams, setExams] = useState(null);
  const [meta, setMeta] = useState({ qCount: {}, subCount: {}, pendCount: {} });
  const [st, setSt] = useState('all');             // status filter: 'all' | 'pub' | 'draft'
  const [search, setSearch] = useState('');

  const [builder, setBuilder] = useState({ open: false, exam: null, level: null });
  const [lvl, setLvl] = useState('all');           // level filter: 'all' | 1..MAX_LEVEL | 0 (exams without a level)
  const [results, setResults] = useState({ open: false, exam: null });
  const [grade, setGrade] = useState({ open: false, submissionId: null, name: '' });
  const [missed, setMissed] = useState({ open: false, exam: null });

  const load = useCallback(async (opts) => {
    const silent = !!(opts && opts.silent);
    if (!code) { setExams(null); return; }
    if (!silent) setExams(null);
    try {
      // Level exams (midterm / final) belong to a LEVEL, not to one group: the rows sit under whichever group of the series was
      // created first (the level-7 final is stored under Group A8's code) while the students who have not passed yet stay in
      // Group A7. So besides the group's own exams, every group also lists the midterm / final of ITS OWN level wherever the
      // row is stored; when several copies exist (every group keeps an empty draft copy) the real one is shown: the one with
      // papers, then the published one, then this group's own copy.
      const orderBy = (q) => q.order('level', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false });
      const [own, lvlRes] = await Promise.all([
        orderBy(supabase.from('written_exams').select('*').eq('group_code', code)),
        g && g.type !== 'individual' && g.level != null
          ? orderBy(supabase.from('written_exams').select('*').not('exam_kind', 'is', null).eq('level', g.level).neq('group_code', code))
          : Promise.resolve({ data: [] }),
      ]);
      if (own.error) throw own.error;
      const ownList = own.data || [];
      const cand = [...ownList, ...((lvlRes && lvlRes.data) || [])];
      if (cand.length === 0) { setExams([]); return; }
      const ids = cand.map((e) => e.id);
      const [qs, subs] = await Promise.all([
        supabase.from('written_exam_questions').select('exam_id').in('exam_id', ids),
        supabase.from('written_exam_submissions').select('exam_id, status').in('exam_id', ids),
      ]);
      const qc = {}, sc = {}, pc = {}, anyN = {};
      (qs.data || []).forEach((q) => { qc[q.exam_id] = (qc[q.exam_id] || 0) + 1; });
      (subs.data || []).forEach((s) => { anyN[s.exam_id] = (anyN[s.exam_id] || 0) + 1; if (s.status === 'submitted' || s.status === 'graded') sc[s.exam_id] = (sc[s.exam_id] || 0) + 1; if (s.status === 'submitted') pc[s.exam_id] = (pc[s.exam_id] || 0) + 1; });
      // one copy per (level, kind) for this group's level; everything else of the group stays as it is
      const best = new Map();
      const rank = (e) => (anyN[e.id] ? 4 : 0) + (e.is_published ? 2 : 0) + (e.group_code === code ? 1 : 0);
      cand.forEach((e) => {
        if (!(e.exam_kind && g && e.level === g.level)) return;
        const k = e.level + '|' + e.exam_kind;
        if (!best.has(k) || rank(e) > rank(best.get(k))) best.set(k, e);
      });
      const picked = new Set([...best.values()].map((e) => e.id));
      const list = cand.filter((e) => (e.group_code === code && !(e.exam_kind && g && e.level === g.level)) || picked.has(e.id));
      setMeta({ qCount: qc, subCount: sc, pendCount: pc });
      setExams(list);
    } catch (e) { if (!silent) setExams({ error: e.message || String(e) }); }
  }, [code, g && g.level, g && g.type]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load);

  async function togglePublish(exam) {
    try {
      if (!exam.is_published) {
        if (!(exam.level >= 1 && exam.level <= MAX_LEVEL)) {
          toast(t('Choose a level before publishing.'), 'err');
          setBuilder({ open: true, exam, level: null });
          return;
        }
        // The server (guard_exam_publish trigger) is the single source of truth for level and questions;
        // a client-side count can be wrong under row-level security, so it is not used to block publishing.
      }
      const { error } = await supabase.from('written_exams').update({ is_published: !exam.is_published }).eq('id', exam.id);
      if (error) throw error;
      toast(t(exam.is_published ? 'Exam unpublished.' : 'Exam published.'), 'ok');
      load();
    } catch (e) {
      const m = String((e && e.message) || e);
      toast(/EXAM_LEVEL_REQUIRED/.test(m) ? t('Choose a level before publishing.') : /EXAM_NEEDS_QUESTIONS/.test(m) ? t('Add at least one question before publishing.') : m, 'err');
      load();
    }
  }

  function del(exam) {
    askConfirm(t('Delete exam'), t('This exam, its questions and all student answers will be deleted. Continue?'), async () => {
      const { error } = await supabase.from('written_exams').delete().eq('id', exam.id);
      if (error) { toast(error.message, 'err'); return; }
      toast(t('Exam deleted.'), 'ok');
      load();
    });
  }

  const openNew = () => { if (!code) { toast(t('Select a group first.'), 'err'); return; } setBuilder({ open: true, exam: null, level: typeof lvl === 'number' && lvl > 0 ? lvl : null }); };
  const all = Array.isArray(exams) ? exams : [];
  const count = all.length;

  // header numbers + filters (status + search)
  const pubCount = all.filter((e) => e.is_published).length;
  const toGrade = all.reduce((n, e) => n + (meta.pendCount[e.id] || 0), 0);
  const needle = search.trim().toLowerCase();
  const shown = all.filter((e) => (st === 'all' || (st === 'pub' ? e.is_published : !e.is_published))
    && (!needle || (String(e.title || '') + ' ' + examTitleFor(e, lang)).toLowerCase().includes(needle)));

  // Exams grouped by level (0 = no level yet), in level order.
  const byLevel = {};
  shown.forEach((e) => { const k = e.level >= 1 && e.level <= MAX_LEVEL ? e.level : 0; (byLevel[k] = byLevel[k] || []).push(e); });
  const hasNone = (byLevel[0] || []).length > 0;
  const LEVEL_NUMS = LEVEL_LIST;
  const sections = lvl === 'all' ? [...LEVEL_NUMS, ...(hasNone ? [0] : [])].filter((k) => (byLevel[k] || []).length) : [lvl];
  const levelName = (k) => (k === 0 ? t('No level') : t('Level') + ' ' + k);
  const nowMs = Date.now();
  const kindOf = (e) => (e.exam_kind === 'midterm' ? 'midterm' : e.exam_kind === 'final' ? 'final' : 'other');
  const kindText = (e) => (e.exam_kind === 'midterm' ? t('Midterm') : e.exam_kind === 'final' ? t('Final exam') : t('Exam'));
  const KIND_ICO = {
    midterm: <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></svg>,
    final: <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="9" r="6" /><path d="M8.5 14L7 22l5-3 5 3-1.5-8" /></svg>,
    other: <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>,
  };
  const card = (e) => {
    const k = kindOf(e);
    const q = meta.qCount[e.id] || 0;
    const s = meta.subCount[e.id] || 0;
    const pend = meta.pendCount[e.id] || 0;
    const opensAt = e.open_at ? new Date(e.open_at).getTime() : 0;
    const dlAt = e.deadline_at ? new Date(e.deadline_at).getTime() : 0;
    const waiting = !!(opensAt && opensAt > nowMs);
    const closed = !!(dlAt && dlAt < nowMs);
    return (
      <article className={'xc ' + k + (e.is_published ? ' pub' : ' draft')} key={e.id}>
        <div className="xc-top">
          <span className={'xc-kind ' + k}>{KIND_ICO[k]}{kindText(e)}</span>
          <span className="xc-lvl">{levelName(e.level >= 1 && e.level <= MAX_LEVEL ? e.level : 0)}</span>
          <label className="xl-switch xc-sw" title={t(e.is_published ? 'Unpublish' : 'Publish')}>
            <input type="checkbox" role="switch" checked={!!e.is_published} onChange={() => togglePublish(e)} />
            <i aria-hidden="true" />
            <span className={e.is_published ? 'on' : 'off'}>{t(e.is_published ? 'Published' : 'Draft')}</span>
          </label>
        </div>
        <button type="button" className="xc-title" dir="auto" onClick={() => setBuilder({ open: true, exam: e, level: null })} title={t('Edit')}>{examTitleFor(e, lang)}</button>
        <div className="xc-stats">
          <span><b>{q}</b> {t('questions')}</span>
          <span><b>{s}</b> {t('submitted')}</span>
          {e.duration_minutes ? <span><b>{e.duration_minutes}</b> {t('min')}</span> : null}
          {pend > 0 && <span className="xc-pend">{pend} {t('To grade')}</span>}
        </div>
        {(e.open_at || e.deadline_at) && (
          <div className="xc-when">
            {e.open_at && <span className={'xc-chip ' + (waiting ? 'wait' : 'ok')} title={t('Opens at')}><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 3l14 9-14 9z" /></svg>{fmtDateTimeL(e.open_at, lang)}</span>}
            {e.deadline_at && <span className={'xc-chip ' + (closed ? 'bad' : '')} title={t('Deadline')}><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9 2h6" /></svg>{fmtDateTimeL(e.deadline_at, lang)}</span>}
          </div>
        )}
        <div className="xc-actions">
          <button type="button" className="xc-btn pri" onClick={() => setResults({ open: true, exam: e })}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>{t('Results')}
          </button>
          <button type="button" className="xc-btn" onClick={() => setBuilder({ open: true, exam: e, level: null })}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" /></svg>{t('Edit')}
          </button>
          {(closed || e.exam_kind) && (
            <button type="button" className="xc-btn icon" title={t('Students who missed the deadline')} aria-label={t('Missed the deadline')} onClick={() => setMissed({ open: true, exam: e })}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M18 8l5 5M23 8l-5 5" /></svg>
            </button>
          )}
          <button type="button" className="xc-btn icon danger" title={t('Delete')} aria-label={t('Delete')} onClick={() => del(e)}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" /></svg>
          </button>
        </div>
      </article>
    );
  };

  return (
    <div className="we-panel active" id="examsWrittenPanel">
      <PageStyle css={listCss} />
      <div className="panel xh-panel">
        <div className="xh">
          <div className="xh-main">
            <h3>{t('Written exams')}{g ? <span className="we-group-pill">{g.name}</span> : null}</h3>
            {code && Array.isArray(exams) && (
              <div className="xh-stats">
                <span className="xh-stat"><b>{count}</b>{t('exams')}</span>
                <span className="xh-stat ok"><b>{pubCount}</b>{t('Published')}</span>
                <span className="xh-stat"><b>{count - pubCount}</b>{t('Draft')}</span>
                {toGrade > 0 && <span className="xh-stat warn"><b>{toGrade}</b>{t('To grade')}</span>}
              </div>
            )}
          </div>
          <button type="button" className="xh-new" onClick={openNew}>
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>{t('New exam')}
          </button>
        </div>
        {code && Array.isArray(exams) && exams.length > 0 && (
          <>
            <div className="xh-tools">
              <label className="xh-search">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
                <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Search exams…')} aria-label={t('Search exams…')} />
              </label>
              <div className="xh-seg" role="group" aria-label={t('Status')}>
                {[['all', t('All')], ['pub', t('Published')], ['draft', t('Draft')]].map(([k, label]) => (
                  <button type="button" key={k} aria-pressed={st === k} className={st === k ? 'on' : ''} onClick={() => setSt(k)}>{label}</button>
                ))}
              </div>
            </div>
            <div className="xl-levels" role="tablist" aria-label={t('Level')}>
              <button type="button" role="tab" aria-selected={lvl === 'all'} className={'xl-lvl' + (lvl === 'all' ? ' on' : '')} onClick={() => setLvl('all')}>{t('All')}<em>{shown.length}</em></button>
              {LEVEL_NUMS.map((n) => {
                const c = (byLevel[n] || []).length;
                return (
                  <button type="button" role="tab" aria-selected={lvl === n} key={n} className={'xl-lvl' + (lvl === n ? ' on' : '') + (c === 0 && lvl !== n ? ' zero' : '')} onClick={() => setLvl(n)}>{t('Level')} {n}<em>{c}</em></button>
                );
              })}
              {hasNone && <button type="button" role="tab" aria-selected={lvl === 0} className={'xl-lvl' + (lvl === 0 ? ' on' : '')} onClick={() => setLvl(0)}>{t('No level')}<em>{byLevel[0].length}</em></button>}
            </div>
          </>
        )}
        {!code ? <div className="xl-empty"><p>{t('Select a group')}</p></div>
          : exams === null ? <div className="xl-empty"><p>{t('Loading…')}</p></div>
          : exams.error ? <div className="xl-empty"><p>{exams.error}</p></div>
          : exams.length === 0 ? (
            <div className="xl-empty">
              <p>{t('No written exams yet.')}</p>
              <button type="button" className="xh-new" onClick={openNew}>{t('New exam')}</button>
            </div>
          ) : sections.length === 0 || (lvl !== 'all' && !(byLevel[lvl] || []).length) ? (
            <div className="xl-empty">
              <p>{needle || st !== 'all' ? t('Nothing matches your filters.') : t('No exams for this level yet.')}</p>
              {(needle || st !== 'all') && <button type="button" className="xc-btn" onClick={() => { setSearch(''); setSt('all'); setLvl('all'); }}>{t('Clear filters')}</button>}
            </div>
          ) : (
            <div>
              {sections.map((k) => {
                const list = byLevel[k] || [];
                const pub = list.filter((e) => e.is_published).length;
                return (
                  <section className="xl-sec" key={k}>
                    <div className="xl-sec-head">
                      <span className={'xl-sec-badge' + (k === 0 ? ' none' : '')}>{k === 0 ? '?' : k}</span>
                      <div>
                        <h4 className="xl-sec-title">{levelName(k)}</h4>
                        <div className="xl-sec-sub">{list.length} {t('exams')} · {pub} {t('Published').toLowerCase()}{k === 0 ? ' · ' + t('Assign a level to these exams so students can find them.') : ''}</div>
                      </div>
                    </div>
                    <div className="xl-list">{list.map(card)}</div>
                  </section>
                );
              })}
            </div>
          )}
      </div>

      <ExamEditor state={builder} onClose={() => setBuilder((s) => ({ ...s, open: false }))} onSaved={load} />
      <MissedStudentsModal state={missed} onClose={() => setMissed((s) => ({ ...s, open: false }))} onChanged={load} />
      <ExamResultsModal state={results} onClose={() => setResults((s) => ({ ...s, open: false }))}
        onManage={(exam) => { setResults((s) => ({ ...s, open: false })); setMissed({ open: true, exam }); }}
        onGrade={(submissionId, name) => setGrade({ open: true, submissionId, name, kind: results.exam ? results.exam.exam_kind : null })} />
      <GradeModal state={grade} onClose={() => setGrade((s) => ({ ...s, open: false }))}
        examTitle={results.exam ? examTitleFor(results.exam, lang) : ''}
        onSaved={() => { if (results.exam) { /* keep results modal fresh */ } load(); }} />
    </div>
  );
}

function GradeModal({ state, onClose, examTitle, onSaved }) {
  const { t, lang, toast } = usePanel();
  const [sub, setSub] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [scores, setScores] = useState({});
  const [saving, setSaving] = useState(false);
  const [regrading, setRegrading] = useState(false);
  const autoRan = useRef(null);
  const triedTranslate = useRef(new Set());   // 'submissionId|lang' already asked for: one try each

  const load = useCallback(async () => {
    if (!state.submissionId) return;
    setSub(null);
    try {
      const { data: s, error: subErr } = await supabase.from('written_exam_submissions').select('*').eq('id', state.submissionId).single();
      if (subErr) throw subErr;
      const [qRes, aRes, cRes] = await Promise.all([
        supabase.from('written_exam_questions').select('*').eq('exam_id', s.exam_id).order('order_num'),
        supabase.from('written_exam_answers').select('*').eq('submission_id', state.submissionId),
        supabase.rpc('staff_written_exam_criteria', { p_exam_id: s.exam_id }),
      ]);
      if (qRes.error) throw qRes.error;
      if (aRes.error) throw aRes.error;
      const critMap = Object.fromEntries((cRes.data || []).map((c) => [c.question_id, c.criteria_text]));
      if (qRes.data) qRes.data = qRes.data.map((q) => ({ ...q, criteria_text: critMap[q.id] || '' }));
      const ansMap = {}; (aRes.data || []).forEach((a) => { ansMap[a.question_id] = a; });
      const initScores = {};
      (qRes.data || []).forEach((q) => {
        const a = ansMap[q.id];
        initScores[q.id] = a && a.teacher_score !== null && a.teacher_score !== undefined ? String(a.teacher_score)
          : a && a.ai_score !== null && a.ai_score !== undefined ? String(a.ai_score) : '';
      });
      setSub(s); setQuestions(qRes.data || []); setAnswers(ansMap); setScores(initScores);
    } catch (e) { setSub({ error: e.message || String(e) }); }
  }, [state.submissionId]);

  useEffect(() => { if (state.open) load(); }, [state.open, load]);

  const hasAi = Object.values(answers).some((a) => a && a.ai_score !== null && a.ai_score !== undefined);

  // If the student's browser closed before the AI finished, run the check now (once per opened paper).
  useEffect(() => {
    if (!sub || sub.error || sub.status !== 'submitted' || hasAi || !state.open) return;
    if (autoRan.current === sub.id) return;
    autoRan.current = sub.id;
    regrade();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub, hasAi, state.open]);

  // Older AI comments exist only in Uzbek: translate them once into the teacher's language (scores are never touched).
  useEffect(() => {
    if (!state.open || !sub || sub.error || !hasAi) return;
    if (!needsFeedbackTranslation(answers, lang)) return;
    const key = sub.id + '|' + lang;
    if (triedTranslate.current.has(key)) return;
    triedTranslate.current.add(key);
    (async () => {
      try {
        const res = await supabase.functions.invoke('grade-exam', { body: { submission_id: sub.id, translate_only: true } });
        if (res.error || !res.data || !res.data.ok || !(Number(res.data.translated) > 0)) return;
        const { data } = await supabase.from('written_exam_answers').select('*').eq('submission_id', sub.id);
        if (!data) return;
        const map = {}; data.forEach((a) => { map[a.question_id] = a; });
        setAnswers(map);
      } catch (e) { /* the Uzbek text stays */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub, answers, lang, hasAi, state.open]);

  async function save() {
    if (!sub || sub.error) return;
    setSaving(true);
    try {
      const vals = [];
      for (const q of questions) {
        const a = answers[q.id];
        const raw = (scores[q.id] || '').trim();
        const val = raw === '' ? null : Math.max(0, Math.min(100, parseInt(raw, 10) || 0));
        vals.push(val === null ? 0 : val);
        if (!a) continue;
        const { error } = await supabase.from('written_exam_answers').update({ teacher_score: val }).eq('id', a.id);
        if (error) throw error;
      }
      const total = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
      const { error } = await supabase.from('written_exam_submissions').update({ status: 'graded', total_score: total }).eq('id', sub.id);
      if (error) throw error;
      toast(t('Grades approved.') + ' \u2014 ' + fmtPts(examPoints(total, state.kind)) + ' / ' + examMax(state.kind), 'ok');
      onClose();
      onSaved();
    } catch (e) { toast(e.message || String(e), 'err'); } finally { setSaving(false); }
  }

  async function regrade() {
    setRegrading(true);
    try {
      const { data, error } = await supabase.functions.invoke('grade-exam', { body: { submission_id: state.submissionId } });
      if (error) throw error;
      if (data && data.ok && data.busy) { toast(t('AI check is already running — try again in a moment.'), 'ok'); }
      else if (data && data.ok) { toast(t('AI check finished.') + ' \u2014 ' + fmtPts(examPoints(data.total_score, state.kind)) + ' / ' + examMax(state.kind), 'ok'); load(); }
      else { toast((data && data.error) || t('AI check failed — grade it manually.'), 'err'); }
    } catch (e) { toast(e.message || String(e), 'err'); } finally { setRegrading(false); }
  }

  const meta = sub && !sub.error ? (examTitle ? examTitle + ' \u00b7 ' : '') + t(sub.status === 'graded' ? 'Graded' : 'Submitted') + (sub.submitted_at ? ' \u00b7 ' + fmtDateTimeL(sub.submitted_at, lang) : '') : '';

  return (
    <Modal open={state.open} onClose={onClose} wide>
      <h3>{state.name || t('Student')}</h3>
      <p className="hint" style={{ marginBottom: 14 }}>{meta}</p>
      {sub && !sub.error && sub.status === 'graded' && (
        <div className="we-ai" style={{ marginBottom: 14, padding: '10px 14px', border: '1px solid rgba(201,162,75,.4)', borderRadius: 10 }}>
          {t('Graded by AI. The student already sees this result; change a score only if you disagree.')}
        </div>
      )}
      {sub && !sub.error && sub.status === 'submitted' && (
        <div className="we-ai" style={{ marginBottom: 14, padding: '10px 14px', border: '1px solid rgba(201,162,75,.4)', borderRadius: 10 }}>
          {regrading ? t('Waiting for AI…') : hasAi ? t('The AI has checked this paper. Review the scores, change any you disagree with, then approve.') : t('Not checked by AI.')}
        </div>
      )}
      <div>
        {sub === null ? <Loader inline label={t('Loading…')} />
          : sub.error ? <div className="empty-block">{sub.error}</div>
          : questions.length === 0 ? <div className="empty-block">{t('No questions yet.')}</div>
          : questions.map((q, i) => {
            const a = answers[q.id];
            const text = a && a.answer_text && a.answer_text.trim();
            return (
              <div className="we-ans" key={q.id}>
                <div className="we-ans-type">{t('Question')} {i + 1} {'\u00b7'} {t(TYPE_LABEL[q.type] || q.type)}</div>
                <div className="we-ans-q" dir="auto"><RichQ text={plainQ(q.question_text)} /></div>
                {q.criteria_text && <div className="we-ai"><b>{t('Criteria')}:</b> {q.criteria_text}</div>}
                <div className={'we-ans-text' + (text ? '' : ' we-ans-empty')} dir="auto">{text ? a.answer_text : t('No answer.')}</div>
                <div className="we-ai">
                  {a && a.ai_score !== null && a.ai_score !== undefined
                    ? <><b>{t('AI score')}: {a.ai_score}</b>{pickFeedback(a, lang, t) ? <span dir="auto">{' \u2014 ' + pickFeedback(a, lang, t)}</span> : ''}</>
                    : t('Not checked by AI.')}
                </div>
                <div className="we-score-row">
                  <label>{t('Teacher score (0-100)')}</label>
                  <input type="number" min="0" max="100" className="we-score-in" disabled={!a}
                         value={scores[q.id] || ''} onChange={(e) => setScores((cur) => ({ ...cur, [q.id]: e.target.value }))} />
                </div>
              </div>
            );
          })}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" disabled={regrading} onClick={regrade}>{t('Re-run AI check')}</button>
        <button type="button" className="btn btn-gold" disabled={saving || regrading} onClick={save}>{t('Save')}</button>
      </div>
    </Modal>
  );
}
