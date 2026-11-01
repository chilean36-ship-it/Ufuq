import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import useLiveRefresh from '../../lib/liveRefresh';
import { usePanel } from '../../components/panel/PanelContext';
import { SURAH_NAMES, surahLabel } from '../../lib/surahNames';
import '../Dashboard/Hifz/hifz.css';

import { fmtDateTime as fmtDateTimeL, currentLang } from '../../lib/dateLocale';
function fmtDate(iso) { try { return fmtDateTimeL(iso, currentLang(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }

/**
 * Teacher "Hifz" page (individual groups): assign a surah/ayah range to a student, read the AI's word-by-word
 * result of every attempt, and give the final verdict (approved / recite again) with a note.
 * Students cannot write attempts themselves (only the ufuq-hifz-check function can), so scores cannot be forged;
 * a teacher may only change teacher_verdict / teacher_note (column grant + trigger in the database).
 */
export default function HifzPage() {
  const { t, toast, askConfirm, currentGroup: g } = usePanel();
  const code = g ? g.code : null;
  const [members, setMembers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);
  const [form, setForm] = useState({ student: '', surah: 112, from: 1, to: 4, due: '', note: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (opts) => {
    const silent = !!(opts && opts.silent);
    if (!code || !g || g.type !== 'individual') { setLoading(false); return; }
    if (!silent) setLoading(true);
    const [m, a] = await Promise.all([
      supabase.from('group_members').select('user_id, name').eq('group_code', code),
      supabase.from('hifz_assignments').select('*').eq('group_code', code).order('created_at', { ascending: false }).limit(100),
    ]);
    if (m.error || a.error) { if (!silent) toast((m.error || a.error).message, 'err'); setLoading(false); return; }
    setMembers(m.data || []);
    const rows = a.data || [];
    setAssignments(rows);
    if (rows.length) {
      const at = await supabase.from('hifz_attempts').select('*').in('assignment_id', rows.map((r) => r.id)).order('created_at', { ascending: false }).limit(300);
      if (!at.error) setAttempts(at.data || []);
    } else setAttempts([]);
    setLoading(false);
  }, [code, g, toast]);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load);

  const nameOf = useMemo(() => { const o = {}; for (const m of members) o[m.user_id] = m.name; return o; }, [members]);
  const byAssignment = useMemo(() => {
    const o = {};
    for (const x of attempts) (o[x.assignment_id] = o[x.assignment_id] || []).push(x);
    return o;
  }, [attempts]);

  async function assign() {
    const from = Number(form.from), to = Number(form.to);
    if (!form.student) { toast(t('Choose a student.'), 'err'); return; }
    if (!(from >= 1) || !(to >= from) || to - from >= 60) { toast(t('Ayah range must be valid and at most 60 ayahs.'), 'err'); return; }
    setSaving(true);
    const { error } = await supabase.from('hifz_assignments').insert({
      group_code: code, student_id: form.student, surah: Number(form.surah), from_ayah: from, to_ayah: to,
      due_date: form.due || null, note: form.note.trim(),
    });
    setSaving(false);
    if (error) { toast(error.message, 'err'); return; }
    toast(t('Hifz task assigned.'), 'ok');
    setForm((f) => ({ ...f, note: '' }));
    load({ silent: true });
  }

  function remove(a) {
    askConfirm(t('Delete'), t('This hifz task and all its attempts will be deleted. Continue?'), async () => {
      const { error } = await supabase.from('hifz_assignments').delete().eq('id', a.id);
      if (error) { toast(error.message, 'err'); return; }
      toast(t('Deleted.'), 'ok');
      load({ silent: true });
    });
  }

  async function verdict(att, v, note) {
    const { error } = await supabase.from('hifz_attempts').update({ teacher_verdict: v, teacher_note: note.trim() || null }).eq('id', att.id);
    if (error) { toast(error.message, 'err'); return; }
    toast(t('Saved.'), 'ok');
    load({ silent: true });
  }

  const head = <div className="page-head"><h2>{t('Hifz')}</h2></div>;
  if (!g) return <section className="page active">{head}<div className="empty-block">{t('Select a group')}</div></section>;
  if (g.type !== 'individual') return <section className="page active">{head}<div className="empty-block">{t('This group is not an individual group.')}</div></section>;

  return (
    <section className="page active" id="page-hifz">
      {head}
      <div className="panel">
        <div className="panel-head"><h3>{t('Assign a task')}</h3></div>
        <div className="hifz-t-form">
          <div className="field"><label>{t('Student')}</label>
            <select value={form.student} onChange={(e) => setForm({ ...form, student: e.target.value })}>
              <option value="">{'\u2014'}</option>
              {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
            </select></div>
          <div className="field"><label>{t('Surah')}</label>
            <select value={form.surah} onChange={(e) => setForm({ ...form, surah: e.target.value })}>
              {SURAH_NAMES.map((_, i) => <option key={i + 1} value={i + 1}>{surahLabel(i + 1)}</option>)}
            </select></div>
          <div className="field"><label>{t('From ayah')}</label><input type="number" min="1" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} /></div>
          <div className="field"><label>{t('To ayah')}</label><input type="number" min="1" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} /></div>
          <div className="field"><label>{t('Due date')}</label><input type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} /></div>
          <div className="field wide"><label>{t('Note (optional)')}</label><input type="text" maxLength={200} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
          <div className="field"><button type="button" className="btn btn-gold" disabled={saving} onClick={assign}>{t('Assign')}</button></div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>{t('Tasks and attempts')}</h3></div>
        {loading ? <div className="empty-block">{t('Loading…')}</div> : assignments.length === 0 ? <div className="empty-block">{t('No hifz tasks yet.')}</div> : assignments.map((a) => {
          const list = byAssignment[a.id] || [];
          const last = list[0];
          const isOpen = open === a.id;
          return (
            <div className="hifz-t-row" key={a.id}>
              <div className="hifz-t-head">
                <div>
                  <div className="hifz-t-title">{nameOf[a.student_id] || '\u2014'} {'\u00B7'} {surahLabel(a.surah)} {'\u00B7'} {a.from_ayah}{'\u2013'}{a.to_ayah}</div>
                  <div className="hifz-t-meta">
                    {a.due_date ? `${t('Due')}: ${a.due_date} \u00B7 ` : ''}{list.length} {t('attempt(s)')}{last ? ` \u00B7 ${t('Last')}: ${last.score}%` : ''}
                    {last && last.teacher_verdict ? ` \u00B7 ${last.teacher_verdict === 'approved' ? t('Approved') : t('Recite again')}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(isOpen ? null : a.id)}>{isOpen ? t('Hide') : t('Open')}</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(a)}>{t('Delete')}</button>
                </div>
              </div>
              {isOpen && (
                <div className="hifz-t-body">
                  {list.length === 0 ? <div className="hifz-empty">{t('No attempts yet.')}</div> : list.map((x) => <Attempt key={x.id} att={x} t={t} onVerdict={verdict} />)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Attempt({ att, t, onVerdict }) {
  const [note, setNote] = useState(att.teacher_note || '');
  const byAyah = [];
  for (const w of att.word_results || []) {
    let gr = byAyah[byAyah.length - 1];
    if (!gr || gr.ayah !== w.ayah) { gr = { ayah: w.ayah, words: [] }; byAyah.push(gr); }
    gr.words.push(w);
  }
  return (
    <div className="hifz-t-attempt">
      <div className="hifz-t-head">
        <strong>{att.score}%</strong>
        <span className="hifz-t-meta">{fmtDate(att.created_at)} {'\u00B7'} {t('Correct')} {att.correct_count} {'\u00B7'} {t('Doubtful')} {att.near_count} {'\u00B7'} {t('Wrong')} {att.wrong_count} {'\u00B7'} {t('Missed')} {att.missing_count}</span>
      </div>
      <div className="hifz-text" dir="rtl" lang="ar" style={{ fontSize: '1.35rem', lineHeight: 2.1 }}>
        {byAyah.map((gr) => (
          <p key={gr.ayah}>
            {gr.words.map((w, i) => <span key={i} className={`hw hw-${w.status}`} title={w.heard ? `${t('Heard')}: ${w.heard}` : t('Missed')}>{w.text} </span>)}
            <span className="hw-num">{'\uFD3F'}{gr.ayah}{'\uFD3E'}</span>
          </p>
        ))}
      </div>
      {att.transcript && <div className="hifz-t-heard" lang="ar">{att.transcript}</div>}
      <div className="hifz-t-actions">
        <input type="text" maxLength={300} value={note} placeholder={t('Note for the student (optional)')} onChange={(e) => setNote(e.target.value)} />
        <button type="button" className="btn btn-gold btn-sm" onClick={() => onVerdict(att, 'approved', note)}>{t('Approve')}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onVerdict(att, 'repeat', note)}>{t('Recite again')}</button>
      </div>
      {att.teacher_verdict && <div className="hifz-t-meta" style={{ marginTop: 6 }}>{att.teacher_verdict === 'approved' ? t('Approved') : t('Recite again')}</div>}
    </div>
  );
}
