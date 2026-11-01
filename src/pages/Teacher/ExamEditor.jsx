import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabaseClient';
import { usePanel } from '../../components/panel/PanelContext';
import PageStyle from '../../components/PageStyle';
import css from '../../styles/exam-builder.css?inline';
import { Q_TYPES, TEMPLATES, parseQ, buildQ, shuffled } from '../../lib/examPaper';
import { lockScroll, unlockScroll } from '../../lib/scrollLock';
import { LEVEL_LIST, MAX_LEVEL } from '../../lib/levels';
import { MIDTERM_MAX, FINAL_MAX, LEVEL_MAX, PASS_MARK } from '../../lib/scoring';

/**
 * Exam editor for teachers and admins — a full-screen workspace instead of a long pop-up.
 *   • top bar: back, exam title, unsaved marker, Save
 *   • left: who gets the exam, template, outline of the sections (click to jump)
 *   • main: one card per section (heading, kind, items) that can be collapsed, moved or removed
 * Saving writes exactly the same rows as before (written_exams + written_exam_questions); only the screen changed.
 */

let seq = 0;
const uid = (p) => p + (++seq);
const newItem = (it) => ({ key: uid('i'), id: (it && it.id) || null, type: (it && it.type) || null, text: (it && it.text) || '', criteria: (it && it.criteria) || '' });
const newSection = (s) => ({
  key: uid('s'), part: (s && s.part) || '', title: (s && s.title) || '', type: (s && s.type) || 'short_answer',
  items: ((s && s.items) || []).map(newItem),
});

/** Existing questions → sections (a question carrying `@@sec:` starts a new section; exams made before this
 *  feature have no markers and load as one section whose items keep their own types). */
function questionsToSections(list) {
  const secs = []; let cur = null;
  list.forEach((q) => {
    const p = parseQ(q.question_text);
    if (!cur || p.sec) {
      cur = newSection({ part: p.part || '', title: p.sec || '', type: q.type });
      secs.push(cur);
    }
    cur.items.push(newItem({ id: q.id, type: q.type, text: p.body, criteria: q.criteria_text || '' }));
  });
  return secs;
}

const PLACEHOLDER = {
  short_answer: ['Question', 'Model answer (teacher only)'],
  matching: ['First word', 'Its partner word'],
  antonym: ['Word', 'Antonym (teacher only)'],
  grammar: ['Task, e.g. العلم ............ (أكمل بخبر جملة اسمية)', 'Model answer (teacher only)'],
  essay: ['Topic', 'Grading notes (teacher only)'],
};
const SECTION_HINT = {
  short_answer: 'Students write a short answer under each question.',
  matching: 'The partner words are shown to students as a shuffled list; they pick the right one and write a sentence.',
  antonym: 'Students write the antonym and a sentence that uses it.',
  grammar: 'Complete-the-sentence and i’rab tasks: students type the answer under each item.',
  essay: 'A big writing area, like the composition page of the paper.',
};
const isTwoBox = (type) => type === 'matching' || type === 'antonym';
const kindLabel = (type) => { const q = Q_TYPES.find((x) => x[0] === type); return q ? q[1] : Q_TYPES[0][1]; };

/** A textarea that grows with what is typed, so nothing hides behind a scroll bar. */
function Area({ value, className = '', ...rest }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = (el.scrollHeight + 2) + 'px';
  }, [value]);
  return <textarea ref={ref} rows={1} className={'pbx-area ' + className} value={value} {...rest} />;
}

const Chevron = () => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>;

/** ISO timestamp -> value for <input type="datetime-local"> in the browser's own time zone. */
function toLocalInput(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
}

export default function ExamEditor({ state, onClose, onSaved }) {
  const { t, toast, currentGroup: g, user, myGroups } = usePanel();
  const open = state.open;
  const [title, setTitle] = useState('');
  const [level, setLevel] = useState('');       // exam level 1..MAX_LEVEL ('' = not chosen yet)
  const [kind, setKind] = useState('');         // '' = other exam (100 points) | 'midterm' (50) | 'final' (100)
  const [deadline, setDeadline] = useState('');   // 'YYYY-MM-DDTHH:mm' in the teacher's local time ('' = no deadline)
  const [dur, setDur] = useState('');           // time limit in minutes ('' = no limit)
  const [targets, setTargets] = useState([]);   // group codes a NEW exam is sent to (default: the group selected at the top)
  const [secs, setSecs] = useState([]);
  const [originalIds, setOriginalIds] = useState([]);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [closed, setClosed] = useState({});       // section key → collapsed
  const [partOpen, setPartOpen] = useState({});   // section key → part-title box shown
  const [pasteFor, setPasteFor] = useState(null);
  const [pasteText, setPasteText] = useState('');
  const [ask, setAsk] = useState(null);           // { title, msg, ok, okLabel, danger } — our own small dialog
  const focusKey = useRef(null);
  const [baseSig, setBaseSig] = useState(null);  // what the form looked like when it finished loading

  // ---- open: load the questions of the exam being edited (or start empty) ----
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setReady(false); setBaseSig(null); setAttempted(false); setLoadError(''); setClosed({}); setPartOpen({}); setPasteFor(null); setPasteText(''); setAsk(null);
    setTitle(state.exam ? state.exam.title : '');
    setDur(state.exam && state.exam.duration_minutes ? String(state.exam.duration_minutes) : '');
    setDeadline(state.exam && state.exam.deadline_at ? toLocalInput(state.exam.deadline_at) : '');
    setLevel(state.exam ? (state.exam.level ? String(state.exam.level) : '') : (state.level ? String(state.level) : ''));
    setKind(state.exam && state.exam.exam_kind ? state.exam.exam_kind : '');
    setTargets(g ? [g.code] : []);
    (async () => {
      if (!state.exam) {
        setSecs([newSection({ items: [{}] })]); setOriginalIds([]); setReady(true); return;
      }
      const { data, error: err } = await supabase.from('written_exam_questions').select('*').eq('exam_id', state.exam.id).order('order_num');
      if (cancelled) return;
      if (err) { setLoadError(err.message); setSecs([newSection({ items: [{}] })]); setOriginalIds([]); setReady(true); return; }
      const rows = data || [];
      // Answer keys live in a staff-only table; attach them to the questions for the editor.
      const { data: crit } = rows.length
        ? await supabase.rpc('staff_written_exam_criteria', { p_exam_id: state.exam.id })
        : { data: [] };
      if (cancelled) return;
      const critMap = Object.fromEntries((crit || []).map((c) => [c.question_id, c.criteria_text]));
      const list = rows.map((q) => ({ ...q, criteria_text: critMap[q.id] || '' }));
      setOriginalIds(list.map((q) => q.id));
      setSecs(list.length ? questionsToSections(list) : [newSection({ title: t('Question 1'), items: [{}] })]);
      setReady(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, state.exam]);

  useEffect(() => { if (!open) return undefined; lockScroll(); return () => unlockScroll(); }, [open]);

  // ---- unsaved-changes tracking ----
  const sig = useMemo(() => JSON.stringify([title, level, dur, targets, secs.map((s) => [s.part, s.title, s.type, s.items.map((i) => [i.id, i.type, i.text, i.criteria])])]), [title, level, dur, targets, secs]);
  useEffect(() => { if (ready) setBaseSig(sig); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [ready]);
  const dirty = ready && baseSig !== null && sig !== baseSig;

  // ---- editing helpers ----
  const patchSec = (si, patch) => setSecs((cur) => cur.map((s, i) => (i === si ? { ...s, ...patch } : s)));
  const moveSec = (si, dir) => setSecs((cur) => {
    const j = si + dir; if (j < 0 || j >= cur.length) return cur;
    const c = cur.slice(); const tmp = c[si]; c[si] = c[j]; c[j] = tmp; return c;
  });
  const removeSecNow = (si) => setSecs((cur) => cur.filter((_, i) => i !== si));
  const patchItem = (si, ii, patch) => setSecs((cur) => cur.map((s, i) => (i !== si ? s : { ...s, items: s.items.map((it, j) => (j === ii ? { ...it, ...patch } : it)) })));
  const removeItem = (si, ii) => setSecs((cur) => cur.map((s, i) => (i !== si ? s : { ...s, items: s.items.filter((_, j) => j !== ii) })));
  const addItem = (si) => {
    const it = newItem();
    focusKey.current = 'i:' + it.key;
    setSecs((cur) => cur.map((s, i) => (i !== si ? s : { ...s, items: [...s.items, it] })));
  };
  const addSection = (type) => {
    const s = newSection({ type, items: [{}] });
    focusKey.current = 's:' + s.key;
    setSecs((cur) => [...cur, s]);
  };
  const changeType = (si, type) => setSecs((cur) => cur.map((s, i) => (i !== si ? s : { ...s, type, items: s.items.map((it) => ({ ...it, type: null })) })));

  // after something new is added: scroll to it and put the cursor in it
  useEffect(() => {
    const k = focusKey.current;
    if (!k) return;
    focusKey.current = null;
    const el = document.querySelector('[data-fk="' + k + '"]');
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const f = el.matches('input,textarea') ? el : el.querySelector('input,textarea');
    if (f) setTimeout(() => f.focus({ preventScroll: true }), 120);
  }, [secs]);

  const removeSec = (si) => {
    const s = secs[si];
    const has = s.items.some((it) => it.text.trim() || it.criteria.trim());
    if (!has) { removeSecNow(si); return; }
    setAsk({ title: t('Remove this section?'), msg: t('The section and the questions in it will be removed when you save.'), okLabel: t('Remove'), danger: true, ok: () => removeSecNow(si) });
  };

  function applyPaste(si) {
    // one item per line; "word + partner" / "word | answer" fills the second box too
    const lines = pasteText.replace(/\r\n/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) { toast(t('Nothing could be read from that text.'), 'err'); return; }
    const items = lines.map((l) => {
      const m = l.replace(/^\d+\s*[.)\-]\s*/, '').split(/\s*[|+=]\s*/);
      return { text: m[0], criteria: m.slice(1).join(' ') };
    });
    setSecs((cur) => cur.map((s, i) => {
      if (i !== si) return s;
      const kept = s.items.length === 1 && !s.items[0].id && !s.items[0].text.trim() ? [] : s.items;
      return { ...s, items: [...kept, ...items.map(newItem)] };
    }));
    toast(items.length + ' ' + t('questions added.'), 'ok');
    setPasteFor(null); setPasteText('');
  }

  function loadTemplate(id) {
    const tpl = TEMPLATES.find((x) => x.id === id);
    if (!tpl) return;
    const apply = () => {
      if (!title.trim()) setTitle(tpl.title);
      setSecs(tpl.sections.map(newSection));
      setClosed({}); setPartOpen({});
    };
    const hasWork = secs.some((s) => s.items.some((it) => it.text.trim()));
    if (hasWork) setAsk({ title: t('Use template'), msg: t('The questions you have now will be replaced by the template. Continue?'), okLabel: t('Use template'), ok: apply });
    else apply();
  }

  // ---- what is still missing (shown after the first Save attempt, and as red boxes) ----
  const problems = useMemo(() => {
    const out = [];
    if (!title.trim()) out.push(t('Title is required.'));
    if (!(Number(level) >= 1 && Number(level) <= MAX_LEVEL)) out.push(t('Choose a level') + ' (1–' + MAX_LEVEL + ').');
    if (dur !== '' && !(Number(dur) >= 1 && Number(dur) <= 600 && Number.isInteger(Number(dur)))) out.push(t('Exam duration (minutes)') + ': 1–600');
    if (deadline && !(new Date(deadline).getTime() > 0)) out.push(t('Deadline'));
    else if (deadline && new Date(deadline).getTime() <= Date.now() && deadline !== (state.exam && state.exam.deadline_at ? toLocalInput(state.exam.deadline_at) : '')) out.push(t('The deadline must be in the future.'));   // an unchanged, already-passed deadline may stay
    if (!state.exam && targets.length === 0) out.push(t('Choose at least one group.'));
    const filled = secs.filter((s) => s.items.some((it) => it.text.trim()));
    if (filled.length === 0) out.push(t('Add at least one question.'));
    secs.forEach((s, si) => {
      if (s.type !== 'matching') return;
      const n = s.items.filter((it) => it.text.trim() && !it.criteria.trim()).length;
      if (n) out.push(t('Section') + ' ' + (si + 1) + ': ' + t('Every matching item needs its partner word.'));
    });
    return out;
  }, [title, level, dur, targets, secs, state.exam, t]);

  const totalQ = secs.reduce((n, s) => n + s.items.filter((it) => it.text.trim()).length, 0);

  async function save() {
    if (saving || !ready) return;
    setAttempted(true);
    if (!g) { toast(t('Select a group first.'), 'err'); return; }
    if (problems.length) {
      const body = document.getElementById('pbxBody');
      if (body) body.scrollTo({ top: 0, behavior: 'smooth' });
      const m = document.querySelector('.pbx-main'); if (m) m.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const sendTo = state.exam ? [state.exam.group_code || g.code] : (targets.length ? targets : [g.code]);
    const trimmedTitle = title.trim();
    const durValue = dur === '' ? null : Math.round(Number(dur));
    const deadlineValue = deadline ? new Date(deadline).toISOString() : null;
    const levelValue = Math.round(Number(level));
    const filled = secs.map((s) => ({ ...s, items: s.items.filter((it) => it.text.trim()) })).filter((s) => s.items.length);

    // flatten sections into question rows; the first row of a section carries the markers
    const rows = [];
    filled.forEach((s, si) => {
      const bank = s.type === 'matching' ? shuffled(s.items.map((it) => it.criteria.trim())) : null;
      s.items.forEach((it, ii) => {
        rows.push({
          id: it.id, type: it.type || s.type,
          text: buildQ({ part: ii === 0 ? s.part : '', sec: ii === 0 ? (s.title.trim() || t('Question') + ' ' + (si + 1)) : '', bank: ii === 0 ? bank : null, body: it.text }),
          criteria: it.criteria.trim(),
        });
      });
    });

    setSaving(true);
    try {
      const writeQuestions = async (examId, existing) => {
        const keptIds = existing ? rows.filter((r) => r.id).map((r) => r.id) : [];
        const removed = existing ? originalIds.filter((id) => !keptIds.includes(id)) : [];
        if (removed.length) {
          const { error: err } = await supabase.from('written_exam_questions').delete().in('id', removed);
          if (err) throw err;
        }
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          const payload = { exam_id: examId, order_num: i, type: r.type, question_text: r.text };
          let qid = r.id;
          if (existing && r.id) {
            const result = await supabase.from('written_exam_questions').update(payload).eq('id', r.id);
            if (result.error) throw result.error;
          } else {
            const { data: ins, error: insErr } = await supabase.from('written_exam_questions').insert(payload).select('id').single();
            if (insErr) throw insErr;
            qid = ins.id;
          }
          const { error: critErr } = await supabase.from('written_exam_criteria')
            .upsert({ question_id: qid, criteria_text: r.criteria || '', updated_at: new Date().toISOString() }, { onConflict: 'question_id' });
          if (critErr) throw critErr;
        }
      };
      if (state.exam) {
        const { error: err } = await supabase.from('written_exams').update({ title: trimmedTitle, duration_minutes: durValue, deadline_at: deadlineValue, level: levelValue, exam_kind: kind || null }).eq('id', state.exam.id);
        if (err) throw err;
        await writeQuestions(state.exam.id, true);
      } else {
        // One separate exam per chosen group: every group gets its own copy, so results and publishing never mix.
        // If any group fails midway, the copies already created are removed so no half-built exam is left behind.
        const created = [];
        try {
          for (const gc of sendTo) {
            const { data, error: err } = await supabase.from('written_exams').insert({ group_code: gc, title: trimmedTitle, duration_minutes: durValue, deadline_at: deadlineValue, level: levelValue, exam_kind: kind || null, created_by: user.id }).select('id').single();
            if (err) throw err;
            created.push(data.id);
            await writeQuestions(data.id, false);
          }
        } catch (inner) {
          if (created.length) await supabase.from('written_exams').delete().in('id', created);
          throw inner;
        }
      }
      toast(t('Exam saved.'), 'ok');
      setBaseSig(sig);
      onClose();
      onSaved();
    } catch (e2) { const m2 = (e2 && e2.message) || String(e2); toast(/EXAM_LOCKED_HAS_SUBMISSIONS/.test(m2) ? t('This exam already has submissions, so its level, type and group can no longer be changed.') : m2, 'err'); } finally { setSaving(false); }
  }

  const requestClose = useCallback(() => {
    if (!dirty) { onClose(); return; }
    setAsk({ title: t('Discard changes?'), msg: t('Your changes to this exam have not been saved.'), okLabel: t('Discard'), danger: true, ok: onClose });
  }, [dirty, onClose, t]);

  // Ctrl/Cmd + S saves, Escape closes our little dialog
  const saveRef = useRef(save); saveRef.current = save;
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); saveRef.current(); }
      else if (e.key === 'Escape') setAsk((a) => (a ? null : a));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Enter in the last box adds the next item (Ctrl + Enter inside the big boxes)
  const onItemKey = (e, si, ii, last) => {
    if (e.key !== 'Enter' || e.shiftKey || !last) return;
    const big = e.target.tagName === 'TEXTAREA';
    if (big && !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    if (e.target.value.trim() || secs[si].items[ii].text.trim()) addItem(si);
  };

  if (!open) return null;

  const jump = (key) => { const el = document.getElementById('pbx-s-' + key); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const groupName = state.exam ? ((myGroups.find((x) => x.code === state.exam.group_code) || g || {}).name || '—') : '';

  return createPortal(
    <div className="pbx" role="dialog" aria-modal="true" aria-label={t(state.exam ? 'Edit exam' : 'New exam')}>
      <PageStyle css={css} />
      <header className="pbx-top">
        <button type="button" className="pbx-back" onClick={requestClose} aria-label={t('Cancel')} title={t('Cancel')}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div className="pbx-titlewrap">
          <input type="text" dir="auto" className={'pbx-title' + (attempted && !title.trim() ? ' bad' : '')} value={title} placeholder={t('Exam title')} aria-label={t('Title')} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <span className="pbx-stat"><b>{totalQ}</b> {t('questions')} &middot; <b>{secs.length}</b> {t('sections')}</span>
        {dirty && <span className="pbx-dirty">{t('Unsaved changes')}</span>}
        <button type="button" className="pbx-btn" onClick={requestClose}>{t('Cancel')}</button>
        <button type="button" className="pbx-btn pri" onClick={save} disabled={saving || !ready}>{saving ? t('Saving…') : t('Save')}</button>
      </header>

      <div className="pbx-main">
        <aside className="pbx-side">
          <section className="pbx-box">
            <h4>{t(state.exam ? 'Group' : 'Send to group')}</h4>
            {state.exam ? (
              <div className="pbx-fixed">{groupName}</div>
            ) : (
              <div className="pbx-group" role="group" aria-label={t('Send to group')}>
                {myGroups.map((x) => {
                  const on = targets.includes(x.code);
                  return (
                    <label key={x.code} className={'pbx-chip' + (on ? ' on' : '')}>
                      <input type="checkbox" checked={on} onChange={() => setTargets((cur) => (cur.includes(x.code) ? cur.filter((c) => c !== x.code) : [...cur, x.code]))} />
                      <span>{x.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
            {!state.exam && <p className="pbx-note">{targets.length > 1 ? t('A separate copy of this exam is created for each selected group.') : t('Only the selected group will see this exam.')}</p>}
          </section>

          <section className="pbx-box">
            <h4>{t('Level')}</h4>
            <div className="pbx-levels" role="group" aria-label={t('Level')}>
              {LEVEL_LIST.map(String).map((n) => (
                <button key={n} type="button" aria-pressed={level === n} className={'pbx-lvl' + (level === n ? ' on' : '') + (attempted && !level ? ' bad' : '')} onClick={() => setLevel(n)}>{n}</button>
              ))}
            </div>
            <p className="pbx-note">{level ? t('Level') + ' ' + level : t('Choose a level') + ' (1–' + MAX_LEVEL + ').'}</p>
          </section>

          <section className="pbx-box">
            <h4>{t('Exam type')}</h4>
            <div className="pbx-kinds" role="group" aria-label={t('Exam type')}>
              {[['midterm', t('Midterm') + ' · ' + MIDTERM_MAX], ['final', t('Final exam') + ' · ' + FINAL_MAX], ['', t('Other exam') + ' · ' + FINAL_MAX]].map(([k, label]) => (
                <button key={k || 'other'} type="button" aria-pressed={kind === k} className={'pbx-lvl' + (kind === k ? ' on' : '')} onClick={() => setKind(k)}>{label}</button>
              ))}
            </div>
            <p className="pbx-note">{t('Level total')}: {MIDTERM_MAX} + {FINAL_MAX} = {LEVEL_MAX} · {t('Pass mark')}: {PASS_MARK}</p>
          </section>

          <section className="pbx-box">
            <h4>{t('Deadline')}</h4>
            <div className="pbx-dur">
              <input type="datetime-local" className="pbx-select" value={deadline} aria-label={t('Deadline')} onChange={(e) => setDeadline(e.target.value)} />
              {deadline && <button type="button" className="pbx-chip" onClick={() => setDeadline('')}><span>{t('No deadline')}</span></button>}
            </div>
            <p className="pbx-note">{t('Students cannot start this exam after the deadline. Papers already started can still be finished.')}</p>
          </section>

          <section className="pbx-box">
            <h4>{t('Time limit')}</h4>
            <div className="pbx-dur">
              <input type="number" inputMode="numeric" min="1" max="600" step="1" className={'pbx-select pbx-dur-in' + (attempted && dur !== '' && !(Number(dur) >= 1 && Number(dur) <= 600) ? ' bad' : '')} value={dur} placeholder="—"
                     aria-label={t('Exam duration (minutes)')} onChange={(e) => setDur(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))} />
              <span>{t('min')}</span>
            </div>
            <div className="pbx-chips" role="group" aria-label={t('Time limit')}>
              {['30', '45', '60', '90', '120'].map((m) => <button key={m} type="button" className={'pbx-chip' + (dur === m ? ' on' : '')} onClick={() => setDur(m)}><span>{m}</span></button>)}
              <button type="button" className={'pbx-chip' + (dur === '' ? ' on' : '')} onClick={() => setDur('')}><span>{t('No time limit')}</span></button>
            </div>
            <p className="pbx-note">{t('The timer starts when you press Start and cannot be paused.')} {t('Leave empty for no time limit')}.</p>
          </section>

          <section className="pbx-box">
            <h4>{t('Template')}</h4>
            <select className="pbx-select" value="" onChange={(e) => { loadTemplate(e.target.value); e.target.value = ''; }}>
              <option value="">{t('Start from a template…')}</option>
              {TEMPLATES.map((x) => <option key={x.id} value={x.id}>{t(x.label)}</option>)}
            </select>
          </section>

          <section className="pbx-box pbx-outline-box">
            <h4>{t('Sections')}</h4>
            <div className="pbx-outline">
              {secs.map((s, si) => (
                <button type="button" className="pbx-ol" key={s.key} onClick={() => jump(s.key)}>
                  <span className="pbx-ol-n">{si + 1}</span>
                  <span className="pbx-ol-t" dir="auto">{s.title.trim() || t(kindLabel(s.type))}</span>
                  <span className="pbx-ol-c">{s.items.filter((it) => it.text.trim()).length}</span>
                </button>
              ))}
            </div>
          </section>

          <p className="pbx-tip">{t('Tip: press Enter in the last box to add the next item (Ctrl + Enter in the big boxes). Ctrl + S saves.')}</p>
        </aside>

        <main className="pbx-body" id="pbxBody">
          <div className="pbx-col">
            {attempted && problems.length > 0 && (
              <div className="pbx-alert" role="alert">
                <b>{t('Fix these before saving:')}</b>
                <ul>{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
              </div>
            )}
            {loadError && <div className="pbx-alert" role="alert">{loadError}</div>}
            {!ready && <div className="pbx-empty">{t('Loading…')}</div>}

            {ready && secs.map((s, si) => {
              const ph = PLACEHOLDER[s.type] || PLACEHOLDER.short_answer;
              const two = isTwoBox(s.type);
              const isClosed = !!closed[s.key];
              const count = s.items.filter((it) => it.text.trim()).length;
              return (
                <section className={'pbx-sec' + (isClosed ? ' closed' : '')} key={s.key} id={'pbx-s-' + s.key}>
                  <div className="pbx-sec-head">
                    <span className="pbx-sec-n">{si + 1}</span>
                    <input type="text" dir="auto" className="pbx-sec-title" data-fk={'s:' + s.key} placeholder="السؤال الأول: أجب عن الأسئلة التالية" aria-label={t('Section heading')}
                           value={s.title} onChange={(e) => patchSec(si, { title: e.target.value })} />
                    <select className="pbx-select pbx-kind" value={s.type} aria-label={t('Kind of exercise')} onChange={(e) => changeType(si, e.target.value)}>
                      {Q_TYPES.map(([val, label]) => <option key={val} value={val}>{t(label)}</option>)}
                    </select>
                    <span className="pbx-tools" style={{ display: 'inline-flex' }}>
                      <button type="button" className="pbx-ico" title={t('Move up')} aria-label={t('Move up')} disabled={si === 0} onClick={() => moveSec(si, -1)}>&uarr;</button>
                      <button type="button" className="pbx-ico" title={t('Move down')} aria-label={t('Move down')} disabled={si === secs.length - 1} onClick={() => moveSec(si, 1)}>&darr;</button>
                      <button type="button" className="pbx-ico del" title={t('Remove')} aria-label={t('Remove')} disabled={secs.length === 1} onClick={() => removeSec(si)}>&times;</button>
                    </span>
                    <button type="button" className="pbx-ico chev" aria-expanded={!isClosed} title={t('Section')} aria-label={t('Section')} onClick={() => setClosed((c) => ({ ...c, [s.key]: !c[s.key] }))}><Chevron /></button>
                  </div>
                  <div className="pbx-sec-sum">{t(kindLabel(s.type))} &middot; {count} {t('questions')}</div>

                  <div className="pbx-sec-body">
                    <p className="pbx-hint">{t(SECTION_HINT[s.type])}</p>
                    {(s.part || partOpen[s.key]) ? (
                      <div className="pbx-part">
                        <label>{t('Part title (optional, e.g. النحو)')}</label>
                        <input type="text" dir="auto" className="pbx-input" value={s.part} onChange={(e) => patchSec(si, { part: e.target.value })} />
                      </div>
                    ) : (
                      <button type="button" className="pbx-linkbtn" onClick={() => setPartOpen((p) => ({ ...p, [s.key]: true }))}>+ {t('Part title (optional, e.g. النحو)')}</button>
                    )}

                    <div className="pbx-cols"><span /><span>{t(ph[0])}</span><span>{t(ph[1])}</span><span /></div>
                    {s.items.map((it, ii) => {
                      const last = ii === s.items.length - 1;
                      const missing = attempted && s.type === 'matching' && it.text.trim() && !it.criteria.trim();
                      return (
                        <div className="pbx-item" key={it.key} data-fk={'i:' + it.key}>
                          <span className="pbx-in">{ii + 1}</span>
                          <div className="pbx-f1">
                            <div className="pbx-itemlab">{t(ph[0])}</div>
                            {two
                              ? <input type="text" dir="auto" className="pbx-input" value={it.text} placeholder={t(ph[0])} onChange={(e) => patchItem(si, ii, { text: e.target.value })} />
                              : <Area dir="auto" value={it.text} placeholder={t(ph[0])} onChange={(e) => patchItem(si, ii, { text: e.target.value })} />}
                          </div>
                          <div className="pbx-f2">
                            <div className="pbx-itemlab">{t(ph[1])}</div>
                            {two
                              ? <input type="text" dir="auto" className={'pbx-input' + (missing ? ' bad' : '')} value={it.criteria} placeholder={t(ph[1])}
                                       onChange={(e) => patchItem(si, ii, { criteria: e.target.value })} onKeyDown={(e) => onItemKey(e, si, ii, last)} />
                              : <Area dir="auto" value={it.criteria} placeholder={t(ph[1])} onChange={(e) => patchItem(si, ii, { criteria: e.target.value })} onKeyDown={(e) => onItemKey(e, si, ii, last)} />}
                          </div>
                          <button type="button" className="pbx-x" title={t('Remove')} aria-label={t('Remove')} onClick={() => removeItem(si, ii)}>&times;</button>
                        </div>
                      );
                    })}

                    {pasteFor === s.key ? (
                      <div className="pbx-paste">
                        <p className="pbx-note" style={{ marginTop: 0, marginBottom: 8 }}>{t('One item per line. For two boxes write both on the line separated by + or |  (e.g. إفشاء + السلام).')}</p>
                        <textarea className="pbx-area" dir="auto" value={pasteText} onChange={(e) => setPasteText(e.target.value)} autoFocus />
                        <div className="pbx-add">
                          <button type="button" className="pbx-btn pri sm" onClick={() => applyPaste(si)}>{t('Add')}</button>
                          <button type="button" className="pbx-btn sm" onClick={() => { setPasteFor(null); setPasteText(''); }}>{t('Cancel')}</button>
                        </div>
                      </div>
                    ) : (
                      <div className="pbx-add">
                        <button type="button" className="pbx-btn sm" onClick={() => addItem(si)}>{t('+ Add item')}</button>
                        <button type="button" className="pbx-btn sm ghost" onClick={() => { setPasteFor(s.key); setPasteText(''); }}>{t('Paste many at once')}</button>
                      </div>
                    )}
                  </div>
                </section>
              );
            })}

            {ready && (
              <div className="pbx-newsec">
                <h4>{t('Add section')}</h4>
                <div className="pbx-kinds">
                  {Q_TYPES.map(([val, label]) => <button type="button" key={val} className="pbx-btn sm" onClick={() => addSection(val)}>+ {t(label)}</button>)}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      <footer className="pbx-bar">
        {dirty && <span className="pbx-dirty">{t('Unsaved changes')}</span>}
        <button type="button" className="pbx-btn" onClick={requestClose}>{t('Cancel')}</button>
        <button type="button" className="pbx-btn pri" onClick={save} disabled={saving || !ready}>{saving ? t('Saving…') : t('Save')}</button>
      </footer>

      {ask && (
        <div className="pbx-modal" role="alertdialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) setAsk(null); }}>
          <div className="pbx-modal-box">
            <h3>{ask.title}</h3>
            <p>{ask.msg}</p>
            <div className="pbx-modal-act">
              <button type="button" className="pbx-btn" onClick={() => setAsk(null)}>{t('Keep editing')}</button>
              <button type="button" className={'pbx-btn ' + (ask.danger ? 'danger' : 'pri')} onClick={() => { const fn = ask.ok; setAsk(null); if (fn) fn(); }}>{ask.okLabel}</button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
