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
import '../../styles/exam-paper.css';
import Loader from '../../components/Loader';

import { fmtDateTime as fmtDateTimeL } from '../../lib/dateLocale';
import { LEVEL_LIST, MAX_LEVEL } from '../../lib/levels';
import { examMax, examPoints, fmtPts } from '../../lib/scoring';
/** "Written exams" sub-tab of Exams: per-group exam list (draft/published, question & submission counts),
 *  a paper-style builder (sections, one item per line, ready-made templates), publish gating (needs ≥1 question),
 *  a results table per student, and a grading view that shows the AI score/feedback alongside a teacher-score
 *  override, with a "Re-run AI check" button that calls the `grade-exam` edge function. */
export default function WrittenExamsPanel() {
  const { t, lang, toast, askConfirm, currentGroup: g, myGroups } = usePanel();
  const code = g ? g.code : null;
  const [exams, setExams] = useState(null);
  const [meta, setMeta] = useState({ qCount: {}, subCount: {} });

  // Groups of one series (same letter: A7, A8 ...) share their level exams: the exam rows are stored under whichever group of
  // the series was created first (e.g. Group A8's code) while the students who have not passed yet stay in the old group (A7).
  // So the Level-N midterm / final kept under a sibling group appear in the ordinary list of the group of level N, exactly as if
  // they belonged to it. They stay there after the group is closed: that is when the students who missed the deadline are managed.
  const siblingCodes = useMemo(() => {
    if (!g || g.type === 'individual' || !g.letter) return [];
    return (myGroups || []).filter((x) => x.code !== g.code && x.type !== 'individual' && x.letter === g.letter).map((x) => x.code);
  }, [g, myGroups]);
  const prevKey = siblingCodes.join(',');
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
      const codes = [code, ...(prevKey ? prevKey.split(',') : [])];
      const { data, error } = await supabase.from('written_exams').select('*').in('group_code', codes).order('level', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false });
      if (error) throw error;
      const all = data || [];
      // this group's own exams + the midterm / final of THIS group's level that sit under a sibling group of the series
      const list = all.filter((e) => e.group_code === code || (e.exam_kind && g && e.level === g.level));
      if (list.length === 0) { setExams([]); return; }
      const ids = list.map((e) => e.id);
      const [qs, subs] = await Promise.all([
        supabase.from('written_exam_questions').select('exam_id').in('exam_id', ids),
        supabase.from('written_exam_submissions').select('exam_id, status').in('exam_id', ids),
      ]);
      const qc = {}, sc = {};
      (qs.data || []).forEach((q) => { qc[q.exam_id] = (qc[q.exam_id] || 0) + 1; });
      (subs.data || []).forEach((s) => { if (s.status === 'submitted' || s.status === 'graded') sc[s.exam_id] = (sc[s.exam_id] || 0) + 1; });
      setMeta({ qCount: qc, subCount: sc });
      setExams(list);
    } catch (e) { if (!silent) setExams({ error: e.message || String(e) }); }
  }, [code, prevKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const count = Array.isArray(exams) ? exams.length : 0;

  // Exams grouped by level (0 = no level yet), in level order.
  const byLevel = {};
  (Array.isArray(exams) ? exams : []).forEach((e) => { const k = e.level >= 1 && e.level <= MAX_LEVEL ? e.level : 0; (byLevel[k] = byLevel[k] || []).push(e); });
  const hasNone = (byLevel[0] || []).length > 0;
  const LEVEL_NUMS = LEVEL_LIST;
  const sections = lvl === 'all' ? [...LEVEL_NUMS, ...(hasNone ? [0] : [])].filter((k) => (byLevel[k] || []).length) : [lvl];
  const levelName = (k) => (k === 0 ? t('No level') : t('Level') + ' ' + k);
  const card = (e) => (
    <article className="xl-card" key={e.id}>
      <div>
        <div className="xl-title" dir="auto">{examTitleFor(e, lang)}</div>
        <div className="xl-meta">
          <span className="xl-lvl-tag">{levelName(e.level >= 1 && e.level <= MAX_LEVEL ? e.level : 0)}</span>
          <span><b>{meta.qCount[e.id] || 0}</b> {t('questions')}</span>
          <span><b>{meta.subCount[e.id] || 0}</b> {t('submitted')}</span>
        </div>
      </div>
      <label className="xl-switch" title={t(e.is_published ? 'Unpublish' : 'Publish')}>
        <input type="checkbox" role="switch" checked={!!e.is_published} onChange={() => togglePublish(e)} />
        <i aria-hidden="true" />
        <span className={e.is_published ? 'on' : 'off'}>{t(e.is_published ? 'Published' : 'Draft')}</span>
      </label>
      <div className="xl-actions">
        <button className="btn btn-gold btn-sm" onClick={() => setResults({ open: true, exam: e })}>{t('Results')}</button>
        {e.deadline_at && new Date(e.deadline_at).getTime() < Date.now() && (
          <button className="btn btn-ghost btn-sm" title={t('Students who missed the deadline')} onClick={() => setMissed({ open: true, exam: e })}>{t('Missed the deadline')}</button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={() => setBuilder({ open: true, exam: e, level: null })}>{t('Edit')}</button>
        <button className="btn btn-danger btn-sm" onClick={() => del(e)}>{t('Delete')}</button>
      </div>
    </article>
  );

  return (
    <div className="we-panel active" id="examsWrittenPanel">
      <PageStyle css={listCss} />
      <div className="panel">
        <div className="xl-head">
          <div>
            <h3>{t('Written exams')}{g ? <span className="we-group-pill">{g.name}</span> : null}</h3>
            {code && Array.isArray(exams) ? <div className="xl-count">{count} {t('exams')}</div> : null}
          </div>
          <button className="btn btn-gold" onClick={openNew}>{t('+ New exam')}</button>
        </div>
        {code && Array.isArray(exams) && exams.length > 0 && (
          <div className="xl-levels" role="tablist" aria-label={t('Level')}>
            <button type="button" role="tab" aria-selected={lvl === 'all'} className={'xl-lvl' + (lvl === 'all' ? ' on' : '')} onClick={() => setLvl('all')}>{t('All')}<em>{exams.length}</em></button>
            {LEVEL_NUMS.map((n) => {
              const c = (byLevel[n] || []).length;
              return (
                <button type="button" role="tab" aria-selected={lvl === n} key={n} className={'xl-lvl' + (lvl === n ? ' on' : '') + (c === 0 && lvl !== n ? ' zero' : '')} onClick={() => setLvl(n)}>{t('Level')} {n}<em>{c}</em></button>
              );
            })}
            {hasNone && <button type="button" role="tab" aria-selected={lvl === 0} className={'xl-lvl' + (lvl === 0 ? ' on' : '')} onClick={() => setLvl(0)}>{t('No level')}<em>{byLevel[0].length}</em></button>}
          </div>
        )}
        {!code ? <div className="xl-empty"><p>{t('Select a group')}</p></div>
          : exams === null ? <div className="xl-empty"><p>{t('Loading…')}</p></div>
          : exams.error ? <div className="xl-empty"><p>{exams.error}</p></div>
          : exams.length === 0 ? (
            <div className="xl-empty">
              <p>{t('No written exams yet.')}</p>
              <button className="btn btn-gold" onClick={openNew}>{t('+ New exam')}</button>
            </div>
          ) : sections.length === 0 || (lvl !== 'all' && !(byLevel[lvl] || []).length) ? (
            <div className="xl-empty">
              <p>{t('No exams for this level yet.')}</p>
              <button className="btn btn-gold" onClick={openNew}>{t('+ New exam')}</button>
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
      <ResultsModal state={results} onClose={() => setResults((s) => ({ ...s, open: false }))}
        onManage={(exam) => { setResults((s) => ({ ...s, open: false })); setMissed({ open: true, exam }); }}
        onGrade={(submissionId, name) => setGrade({ open: true, submissionId, name, kind: results.exam ? results.exam.exam_kind : null })} />
      <GradeModal state={grade} onClose={() => setGrade((s) => ({ ...s, open: false }))}
        examTitle={results.exam ? examTitleFor(results.exam, lang) : ''}
        onSaved={() => { if (results.exam) { /* keep results modal fresh */ } load(); }} />
    </div>
  );
}

function ResultsModal({ state, onClose, onGrade, onManage }) {
  const { t, lang, toast, currentGroup: g } = usePanel();
  // (results title below uses the panel language)
  const [rows, setRows] = useState(null);
  const examId = state.exam ? state.exam.id : null;

  const refresh = useCallback(async () => {
    const exam = state.exam;
    if (!examId || !exam) return;
    setRows(null);
    try {
      const subRes = await supabase.from('written_exam_submissions').select('*').eq('exam_id', examId);
      if (subRes.error) throw subRes.error;
      // Roster = the students of the exam's own group + everybody who has a paper for it, even if they have already
      // passed and moved up to the next group (they used to vanish from this table).
      // The exam row may be stored under a sibling group (level exams of Group A7 sit under Group A8's code), so the roster is
      // built around the group that is OPEN in the panel: its students (took it or not) + everybody who has a paper.
      const viewCode = g ? g.code : exam.group_code;
      const ownView = viewCode === exam.group_code;
      const viewRes = await supabase.from('group_members').select('user_id, name').eq('group_code', viewCode);
      const viewMembers = viewRes.data || [];
      const viewSet = new Set(viewMembers.map((m) => m.user_id));
      const submitters = new Set((subRes.data || []).map((s) => s.user_id));
      const byId = new Map();
      const put = (id, name, cg) => { const cur = byId.get(id); if (!cur) byId.set(id, { user_id: id, name: name || '', current_group: cg || null }); else { if (!cur.name && name) cur.name = name; if (!cur.current_group && cg) cur.current_group = cg; } };
      let haveRpc = false;
      try {
        const rr = await supabase.rpc('staff_exam_roster', { p_exam_id: examId });   // migration 20261120 (names + "now in Group A8")
        if (!rr.error && Array.isArray(rr.data)) {
          haveRpc = true;
          // viewed from a sibling group, the exam group's students who did not take it are not part of this table
          rr.data.forEach((r) => { if (ownView || submitters.has(r.user_id) || viewSet.has(r.user_id)) put(r.user_id, r.name, r.current_group); });
        }
      } catch (e) { /* not applied yet: the tables below give the same answer */ }
      if (!haveRpc && ownView) {
        const memRes = await supabase.from('group_members').select('user_id, name').eq('group_code', exam.group_code);
        (memRes.data || []).forEach((m) => put(m.user_id, m.name, null));
      }
      viewMembers.forEach((m) => put(m.user_id, m.name, null));
      const unnamed = [...submitters].filter((id) => !byId.has(id) || !byId.get(id).name);
      if (unnamed.length) {
        const pr = await supabase.from('profiles').select('id, full_name').in('id', unnamed);
        const nm = new Map((pr.data || []).map((p) => [p.id, p.full_name]));
        unnamed.forEach((id) => put(id, nm.get(id) || '', null));
      }
      const members = [...byId.values()]
        .map((m) => ({ ...m, in_group: viewSet.has(m.user_id) }))
        .sort((a, b) => Number(b.in_group) - Number(a.in_group) || String(a.name || '').localeCompare(String(b.name || '')));
      if (members.length === 0) { setRows([]); return; }
      const subMap = {}; (subRes.data || []).forEach((s) => { subMap[s.user_id] = s; });
      const aiDone = {};
      const subIds = (subRes.data || []).map((x) => x.id);
      if (subIds.length) {
        const { data: ai } = await supabase.from('written_exam_answers').select('submission_id').in('submission_id', subIds).not('ai_score', 'is', null);
        (ai || []).forEach((a) => { aiDone[a.submission_id] = true; });
      }
      const viol = {};
      try {
        const { data: vs } = await supabase.rpc('exam_violation_summary', { p_exam_type: 'written', p_exam_id: String(examId) });
        (vs || []).forEach((v) => { viol[v.user_id] = { total: v.total, technical: v.technical || 0 }; });
      } catch (e) { /* migration not applied yet */ }
      setRows(members.map((m) => { const sb = subMap[m.user_id] || null; return { member: m, sub: sb, viol: viol[m.user_id] || { total: 0, technical: 0 }, ai: !!(sb && aiDone[sb.id]) }; }));
    } catch (e) { setRows({ error: e.message || String(e) }); }
  }, [examId, state.exam, g]);

  useEffect(() => { if (state.open) refresh(); }, [state.open, refresh]);

  const labels = { draft: 'Not submitted', submitted: 'Submitted', graded: 'Graded' };
  const [busy, setBusy] = useState(false);
  const pending = Array.isArray(rows) ? rows.filter((r) => r.sub && r.sub.status === 'submitted' && r.ai) : [];

  /** Approves AI-checked papers as they are: item score = teacher score if set, else the AI score; total = average. */
  async function approveMany(list) {
    if (!list.length || !examId) return;
    setBusy(true);
    try {
      const { data: qs, error: qErr } = await supabase.from('written_exam_questions').select('id').eq('exam_id', examId);
      if (qErr) throw qErr;
      const qIds = (qs || []).map((q) => q.id);
      const { data: ans, error: aErr } = await supabase.from('written_exam_answers').select('submission_id, question_id, ai_score, teacher_score').in('submission_id', list.map((r) => r.sub.id));
      if (aErr) throw aErr;
      for (const r of list) {
        const mine = {}; (ans || []).forEach((a) => { if (a.submission_id === r.sub.id) mine[a.question_id] = a; });
        const sum = qIds.reduce((acc, id) => { const a = mine[id]; const v = a ? (a.teacher_score != null ? a.teacher_score : (a.ai_score != null ? a.ai_score : 0)) : 0; return acc + v; }, 0);
        const total = qIds.length ? Math.round(sum / qIds.length) : 0;
        const { error } = await supabase.from('written_exam_submissions').update({ status: 'graded', total_score: total }).eq('id', r.sub.id);
        if (error) throw error;
      }
      toast(t('Grades approved.'), 'ok');
      refresh();
    } catch (e) { toast(e.message || String(e), 'err'); } finally { setBusy(false); }
  }

  /** Gives the student 10 more minutes on a running paper (e.g. after a call or a lost connection). */
  async function restoreTime(sub) {
    const note = window.prompt(t('Reason for the extra time (required):'), '');
    if (!note || !note.trim()) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc('staff_restore_written_time', { p_submission_id: sub.id, p_minutes: 10, p_note: note.trim() });
      if (error) throw error;
      toast(t('10 minutes added.'), 'ok');
      refresh();
    } catch (e) { toast(e.message || String(e), 'err'); } finally { setBusy(false); }
  }

  /** Reopens a handed-in paper for a retake. The student keeps the answers already written; grades are cleared. */
  async function reopen(sub) {
    if (!window.confirm(t('Reopen this paper for a retake? The current grades will be cleared and the student can continue.'))) return;
    const note = window.prompt(t('Reason for the retake (required):'), '');
    if (!note || !note.trim()) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc('staff_reopen_written_exam', { p_submission_id: sub.id, p_keep_answers: true, p_note: note.trim() });
      if (error) throw error;
      toast(t('Paper reopened for a retake.'), 'ok');
      refresh();
    } catch (e) { toast(e.message || String(e), 'err'); } finally { setBusy(false); }
  }

  return (
    <Modal open={state.open} onClose={onClose} wide>
      <h3>{t('Results')} &mdash; <span>{state.exam ? examTitleFor(state.exam, lang) : ''}</span></h3>
      {Array.isArray(rows) && rows.length > 0 && (() => {
        const done = rows.filter((r) => r.sub && r.sub.status !== 'draft').length;
        const open = rows.length - done;
        const passed = rows.filter((r) => r.member.in_group === false && r.sub).length;
        return (
          <div className="pb-addrow" style={{ margin: '0 0 12px', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span className="u-pill gold"><b>{done}</b> {t('submitted')}</span>
            <span className={'u-pill' + (open ? ' amber' : '')}><b>{open}</b> {t('not submitted')}</span>
            {passed > 0 && <span className="u-pill"><b>{passed}</b> {t('moved up')}</span>}
            {open > 0 && onManage && state.exam && (
              <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => onManage(state.exam)}>{t('Manage students who did not submit')}</button>
            )}
          </div>
        );
      })()}
      {pending.length > 0 && (
        <div className="pb-addrow" style={{ margin: '0 0 12px', alignItems: 'center' }}>
          <span className="u-pill gold">{'\u2728'} {pending.length} {t('Needs approval')}</span>
          <button type="button" className="btn btn-gold btn-sm" disabled={busy} onClick={() => approveMany(pending)}>{t('Approve all AI-checked')}</button>
        </div>
      )}
      <table>
        <thead><tr><th>{t('Student')}</th><th>{t('Status')}</th><th>{t('Total score')}</th><th>{t('Integrity')}</th><th></th></tr></thead>
        <tbody>
          {rows === null ? <tr className="empty-row"><td colSpan={5}>{t('Loading…')}</td></tr>
            : rows.error ? <tr className="empty-row"><td colSpan={5}>{rows.error}</td></tr>
            : rows.length === 0 ? <tr className="empty-row"><td colSpan={5}>{t('There are no students in this group yet.')}</td></tr>
            : rows.map(({ member: m, sub: s, viol, ai }) => {
              const status = s ? s.status : 'none';
              const label = s ? (s.status === 'submitted' && ai ? 'AI checked' : labels[s.status]) : 'Not submitted';
              return (
                <tr key={m.user_id}>
                  <td><b>{m.name || t('Student')}</b>
                    {m.in_group === false && <span className="u-pill gold" style={{ marginLeft: 8 }} title={t('Passed and moved up; the result stays here')}>{m.current_group ? t('Moved to') + ' ' + m.current_group : t('Moved up')}</span>}
                  </td>
                  <td><span className={'we-status ' + status}>{t(label)}</span></td>
                  <td>{s && s.total_score !== null && s.total_score !== undefined ? <>{fmtPts(examPoints(s.total_score, state.exam && state.exam.exam_kind))}<small className="muted"> / {examMax(state.exam && state.exam.exam_kind)}</small></> : '\u2014'}</td>
                  <td>{viol.total > 0 ? <span className="u-pill amber" title={t('Times the student left the exam page')}>{'\u26A0'} {viol.total}</span> : <span className="muted">{'\u2713'}</span>}{viol.technical > 0 && <span className="muted" title={t('Interruptions with no internet connection (not counted against the student)')}> {' '}+{viol.technical} {t('technical')}</span>}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {s && s.status === 'draft' && s.clock_started_at && (
                      <button className="btn btn-ghost btn-sm" disabled={busy} title={t('Give the student 10 more minutes')} onClick={() => restoreTime(s)}>{t('+10 min')}</button>
                    )}
                    {s && s.status !== 'draft'
                      ? <button className={'btn btn-sm ' + (s.status === 'submitted' && ai ? 'btn-gold' : 'btn-ghost')} onClick={() => onGrade(s.id, m.name || '')}>{t(s.status === 'submitted' && ai ? 'Approve' : 'Check')}</button>
                      : <span className="muted" style={{ fontSize: 12 }}>{'\u2014'}</span>}
                    {s && s.status !== 'draft' && (
                      <button className="btn btn-ghost btn-sm" disabled={busy} title={t('Allow the student to take the paper again')} onClick={() => reopen(s)} style={{ marginLeft: 6 }}>{t('Retake')}</button>
                    )}
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </Modal>
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
                <div className="we-ans-q" dir="auto">{plainQ(q.question_text)}</div>
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
