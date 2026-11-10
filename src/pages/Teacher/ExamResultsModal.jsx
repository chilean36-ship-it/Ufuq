import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { usePanel } from '../../components/panel/PanelContext';
import { Modal } from '../../components/panel/ui';
import { examTitleFor } from '../../lib/examTitle';
import { examMax, examPoints, fmtPts } from '../../lib/scoring';
import PageStyle from '../../components/PageStyle';
import css from '../../styles/exam-results.css?inline';
import RowMenu from './RowMenu';

/**
 * Results of ONE exam, in one list: everybody of the open group (took it or not) + everybody who has a paper, also the students
 * who already passed and moved up. The exam row can be stored under a sibling group (the level-7 final sits under Group A8's
 * code), so the roster is built around the group that is open in the panel.
 *
 * Actions that belong HERE: check / approve a paper, approve all AI-checked papers, reopen a handed-in paper for a retake, +10 minutes
 * on a running paper. Everything about students who never handed in (extend the deadline, lower group, remove) lives in the
 * "Manage students who did not submit" window, so no action is offered in two places.
 */
export default function ExamResultsModal({ state, onClose, onGrade, onManage }) {
  const { t, lang, toast, currentGroup: g } = usePanel();
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const exam = state.exam;
  const examId = exam ? exam.id : null;
  const kind = exam ? exam.exam_kind : null;

  const refresh = useCallback(async () => {
    if (!examId || !exam) return;
    setRows(null);
    try {
      const subRes = await supabase.from('written_exam_submissions').select('*').eq('exam_id', examId);
      if (subRes.error) throw subRes.error;
      const viewCode = g ? g.code : exam.group_code;
      const ownView = viewCode === exam.group_code;
      // A midterm / final belongs to a LEVEL: only the students on that level are expected to take it, wherever the row is stored.
      const levelExam = !!(exam.exam_kind && exam.level);
      const onLevel = (lv) => Number(lv) === Number(exam.level);
      const viewRes = await supabase.from('group_members').select('user_id, name').eq('group_code', viewCode);
      const viewMembers = viewRes.data || [];
      const viewSet = new Set(viewMembers.map((m) => m.user_id));
      const submitters = new Set((subRes.data || []).map((s) => s.user_id));
      const byId = new Map();
      const put = (id, name, cg) => { const cur = byId.get(id); if (!cur) byId.set(id, { user_id: id, name: name || '', current_group: cg || null }); else { if (!cur.name && name) cur.name = name; if (!cur.current_group && cg) cur.current_group = cg; } };
      let haveRpc = false;
      try {
        const rr = await supabase.rpc('staff_exam_roster', { p_exam_id: examId });   // names + "now in Group A8"
        if (!rr.error && Array.isArray(rr.data)) {
          haveRpc = true;
          // viewed from a sibling group, the exam group's students who did not take it are not part of this list
          rr.data.forEach((r) => {
            if (levelExam && !submitters.has(r.user_id) && !onLevel(r.level)) return;   // e.g. a level-8 member of the group that stores the level-7 final
            if (ownView || submitters.has(r.user_id) || viewSet.has(r.user_id)) put(r.user_id, r.name, r.current_group);
          });
        }
      } catch (e) { /* function missing: the tables below give the same answer */ }
      if (!haveRpc && ownView) {
        const memRes = await supabase.from('group_members').select('user_id, name').eq('group_code', exam.group_code);
        (memRes.data || []).forEach((m) => put(m.user_id, m.name, null));
      }
      if (levelExam && haveRpc) {
        // members of the open group the server did not list: keep only real students who are on the exam's level
        const rest = viewMembers.filter((m) => !byId.has(m.user_id));
        if (rest.length) {
          const pr = await supabase.from('profiles').select('id, role, level, level_free').in('id', rest.map((m) => m.user_id));
          const keep = new Set((pr.data || []).filter((p) => p.role === 'student' && !p.level_free && onLevel(p.level)).map((p) => p.id));
          rest.forEach((m) => { if (keep.has(m.user_id)) put(m.user_id, m.name, null); });
        }
      } else {
        viewMembers.forEach((m) => put(m.user_id, m.name, null));
      }
      const unnamed = [...submitters].filter((id) => !byId.has(id) || !byId.get(id).name);
      if (unnamed.length) {
        const pr = await supabase.from('profiles').select('id, full_name').in('id', unnamed);
        const nm = new Map((pr.data || []).map((p) => [p.id, p.full_name]));
        unnamed.forEach((id) => put(id, nm.get(id) || '', null));
      }
      const members = [...byId.values()].map((m) => ({ ...m, in_group: viewSet.has(m.user_id) }));
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
      } catch (e) { /* function missing */ }
      const list = members.map((m) => {
        const sub = subMap[m.user_id] || null;
        const handedIn = !!sub && sub.status !== 'draft';
        const state2 = !sub ? 'missing' : sub.status === 'draft' ? (sub.clock_started_at ? 'running' : 'missing') : sub.status === 'graded' ? 'graded' : (aiDone[sub.id] ? 'pending' : 'waiting');
        return { member: m, sub, handedIn, st: state2, viol: viol[m.user_id] || { total: 0, technical: 0 }, ai: !!(sub && aiDone[sub.id]) };
      });
      // handed-in first (graded last among them), then the ones still missing; the name inside each block
      const order = { pending: 0, waiting: 1, graded: 2, running: 3, missing: 4 };
      list.sort((a, b) => (order[a.st] - order[b.st]) || String(a.member.name || '').localeCompare(String(b.member.name || '')));
      setRows(list);
    } catch (e) { setRows({ error: e.message || String(e) }); }
  }, [examId, exam, g]);

  useEffect(() => { if (state.open) { setFilter('all'); setQ(''); refresh(); } }, [state.open, refresh]);

  const stats = useMemo(() => {
    const l = Array.isArray(rows) ? rows : [];
    return {
      all: l.length,
      submitted: l.filter((r) => r.handedIn).length,
      pending: l.filter((r) => r.st === 'pending').length,
      graded: l.filter((r) => r.st === 'graded').length,
      missing: l.filter((r) => !r.handedIn).length,
      moved: l.filter((r) => r.member.in_group === false).length,
    };
  }, [rows]);

  const shown = useMemo(() => {
    const l = Array.isArray(rows) ? rows : [];
    const needle = q.trim().toLowerCase();
    return l.filter((r) => {
      if (needle && !String(r.member.name || '').toLowerCase().includes(needle)) return false;
      if (filter === 'submitted') return r.handedIn;
      if (filter === 'pending') return r.st === 'pending';
      if (filter === 'missing') return !r.handedIn;
      if (filter === 'moved') return r.member.in_group === false;
      return true;
    });
  }, [rows, filter, q]);

  const pendingRows = Array.isArray(rows) ? rows.filter((r) => r.st === 'pending') : [];

  /** Approves AI-checked papers as they are: item score = teacher score if set, else the AI score; total = average. */
  async function approveMany(list) {
    if (!list.length || !examId) return;
    setBusy(true);
    try {
      const { data: qs, error: qErr } = await supabase.from('written_exam_questions').select('id').eq('exam_id', examId);
      if (qErr) throw qErr;
      const qIds = (qs || []).map((x) => x.id);
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

  const STATUS = {
    graded: [t('Graded'), 'ok'], pending: [t('Needs approval'), 'gold'], waiting: [t('Checking…'), 'wait'],
    running: [t('Writing now'), 'run'], missing: [t('Not submitted'), 'miss'],
  };
  const kindLabel = kind === 'midterm' ? t('Midterm') : kind === 'final' ? t('Final exam') : t('Exam');
  const FILTERS = [['all', t('All'), stats.all], ['submitted', t('Submitted'), stats.submitted], ['pending', t('Needs approval'), stats.pending], ['missing', t('Not submitted'), stats.missing], ...(stats.moved ? [['moved', t('Moved up'), stats.moved]] : [])];

  return (
    <Modal open={state.open} onClose={onClose} wide>
      <PageStyle css={css} />
      <div className="er">
        <header className="er-head">
          <div>
            <div className="er-kicker">{t('Results')}{exam ? <span className="er-chip">{kindLabel}{exam.level ? ' · ' + t('Level') + ' ' + exam.level : ''}</span> : null}</div>
            <h3 className="er-title" dir="auto">{exam ? examTitleFor(exam, lang) : ''}</h3>
          </div>
        </header>

        {Array.isArray(rows) && rows.length > 0 && (
          <>
            <div className="er-stats">
              <div className="er-stat"><b>{stats.submitted}</b><span>{t('Submitted')}</span></div>
              <div className="er-stat ok"><b>{stats.graded}</b><span>{t('Graded')}</span></div>
              <div className={'er-stat' + (stats.pending ? ' gold' : '')}><b>{stats.pending}</b><span>{t('Needs approval')}</span></div>
              <div className={'er-stat' + (stats.missing ? ' warn' : '')}><b>{stats.missing}</b><span>{t('Not submitted')}</span></div>
            </div>

            <div className="er-bar">
              <div className="er-tabs" role="tablist">
                {FILTERS.map(([k, label, n]) => (
                  <button key={k} type="button" role="tab" aria-selected={filter === k} className={'er-tab' + (filter === k ? ' on' : '')} onClick={() => setFilter(k)}>{label}<i>{n}</i></button>
                ))}
              </div>
              <input type="search" className="er-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search student')} aria-label={t('Search student')} />
            </div>

            {(pendingRows.length > 0 || (stats.missing > 0 && onManage)) && (
              <div className="er-actions">
                {pendingRows.length > 0 && <button type="button" className="btn btn-gold btn-sm" disabled={busy} onClick={() => approveMany(pendingRows)}>{'✓'} {t('Approve all AI-checked')} ({pendingRows.length})</button>}
                {stats.missing > 0 && onManage && (
                  <button type="button" className="er-btn" onClick={() => onManage(exam)} title={t('Students who did not submit')}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2" /><path d="M3 19c0-3.2 2.7-5.5 6-5.5s6 2.3 6 5.5" /><path d="M19 8v6M16 11h6" /></svg>
                    {t('Manage')}<i>{stats.missing}</i>
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {rows === null ? <p className="er-note">{t('Loading…')}</p>
          : rows.error ? <p className="er-note">{rows.error}</p>
          : rows.length === 0 ? <p className="er-note">{t('There are no students in this group yet.')}</p>
          : shown.length === 0 ? <p className="er-note">{t('Nothing here.')}</p>
          : (
            <div className="er-table" role="table">
              <div className="er-row er-th" role="row">
                <span role="columnheader">{t('Student')}</span><span role="columnheader">{t('Status')}</span><span role="columnheader">{t('Score')}</span><span role="columnheader">{t('Integrity')}</span><span role="columnheader" />
              </div>
              {shown.map((r) => {
                const { member: m, sub: s, viol } = r;
                const [stLabel, stCls] = STATUS[r.st];
                const hasScore = s && s.total_score !== null && s.total_score !== undefined;
                const pct = hasScore ? Number(s.total_score) : null;
                return (
                  <div className={'er-row' + (r.handedIn ? '' : ' dim')} role="row" key={m.user_id}>
                    <span className="er-name" role="cell">
                      <i className="er-av" aria-hidden="true">{(m.name || '?').trim().charAt(0).toUpperCase()}</i>
                      <b dir="auto">{m.name || t('Student')}</b>
                      {m.in_group === false && <em className="er-moved" title={t('Passed and moved up; the result stays here')}>{m.current_group ? t('Moved to') + ' ' + m.current_group : t('Moved up')}</em>}
                    </span>
                    <span role="cell"><span className={'er-st ' + stCls}>{stLabel}</span></span>
                    <span className={'er-score' + (pct === null ? '' : pct >= 80 ? ' good' : pct >= 50 ? ' mid' : ' bad')} role="cell">
                      {hasScore ? <><b>{fmtPts(examPoints(pct, kind))}</b><small> / {examMax(kind)}</small></> : '—'}
                    </span>
                    <span role="cell">
                      {viol.total > 0 ? <span className="er-viol" title={t('Times the student left the exam page')}>{'⚠'} {viol.total}</span> : (r.sub ? <span className="er-ok">{'✓'}</span> : <span className="muted">{'—'}</span>)}
                      {viol.technical > 0 && <span className="muted" title={t('Interruptions with no internet connection (not counted against the student)')}> +{viol.technical} {t('technical')}</span>}
                    </span>
                    <span className="er-acts" role="cell">
                      {r.handedIn && (
                        <button type="button" className={'btn btn-sm ' + (r.st === 'pending' ? 'btn-gold' : 'btn-ghost')} onClick={() => onGrade(s.id, m.name || '')}>{r.st === 'pending' ? t('Approve') : r.st === 'graded' ? t('Review') : t('Check')}</button>
                      )}
                      {r.st === 'running' && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} title={t('Give the student 10 more minutes')} onClick={() => restoreTime(s)}>{t('+10 min')}</button>}
                      <RowMenu label={t('More')} disabled={busy} items={[
                        r.handedIn && { key: 'retake', label: t('Allow retake of this paper'), title: t('Allow the student to take the paper again'), onClick: () => reopen(s) },
                      ]} />
                    </span>
                  </div>
                );
              })}
            </div>
          )}
      </div>
    </Modal>
  );
}
