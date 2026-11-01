import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { usePanel } from '../../components/panel/PanelContext';
import { askUfuqAi, TEACHER_SYSTEM_PROMPT } from '../Dashboard/AiChat/aiClient';

const KINDS = ['system', 'group', 'task', 'lesson', 'exam'];
const KIND_LABEL = { system: 'System', group: 'Group', task: 'Tasks', lesson: 'Lesson', exam: 'Exam' };
// Where a tap on the notification should take the student (these are the student-dashboard views).
const LINKS = [['', 'No link'], ['dashboard', 'Home'], ['myGroup', 'My group'], ['tasks', 'Tasks'], ['exam', 'Exams'], ['library', 'Library']];
const TEMPLATES = [
  { id: 'lesson', kind: 'lesson', title: 'Class reminder', body: 'Our class starts soon. Please be ready on time and have your notebook with you.' },
  { id: 'task', kind: 'task', title: 'New homework', body: 'A new task has been added. Please check the Tasks page and submit before the deadline.' },
  { id: 'exam', kind: 'exam', title: 'Upcoming exam', body: 'An exam is coming up. Revise the latest lessons and be ready — good luck!' },
  { id: 'cancel', kind: 'group', title: 'Class update', body: 'There is a change to the class schedule. Please read the details below.' },
];
const TITLE_MAX = 120;
const BODY_MAX = 600;

/** Send a notification to a whole group or a single student. The "sent" list is kept for this visit only
 *  (the notifications table is per-recipient, so there's no single sent-log to read back). */
export default function AnnouncementsPage() {
  const { t, toast, currentGroup: g, announcePrefill, clearAnnouncePrefill } = usePanel();
  const code = g ? g.code : null;
  const [members, setMembers] = useState([]);
  const [target, setTarget] = useState('__all__');
  const [kind, setKind] = useState('system');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState([]);
  const [aiTopic, setAiTopic] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setMembers([]);
    setTarget('__all__');
    if (!code) return undefined;
    (async () => {
      const { data } = await supabase.from('group_members').select('user_id, name').eq('group_code', code).order('name');
      if (!cancelled) setMembers(data || []);
    })();
    return () => { cancelled = true; };
  }, [code]);

  // Jump here from a student profile's "Send a message" with that student preselected.
  useEffect(() => {
    if (announcePrefill && members.some((m) => m.user_id === announcePrefill.userId)) {
      setTarget(announcePrefill.userId);
      clearAnnouncePrefill();
    }
  }, [announcePrefill, members, clearAnnouncePrefill]);

  const targetLabel = useMemo(() => {
    if (target === '__all__') return g ? t('Whole group') + ' \u2014 ' + g.name : '';
    const m = members.find((mm) => mm.user_id === target);
    return m ? (m.name || t('Student')) : '';
  }, [target, members, g, t]);
  const recipientCount = target === '__all__' ? members.length : (target ? 1 : 0);

  function applyTemplate(tp) {
    setKind(tp.kind); setTitle(t(tp.title)); setBody(t(tp.body)); setError('');
  }

  async function draftWithAi() {
    const topic = aiTopic.trim();
    if (!topic) { setError(t('Tell Ufuq AI what the message is about first.')); return; }
    setError(''); setAiBusy(true);
    const ask = 'Write one short announcement for students of my Arabic group about: ' + topic +
      '. Reply in exactly this format and nothing else:\nTITLE: <max 8 words>\nBODY: <2-3 friendly sentences>';
    const { reply, offline } = await askUfuqAi({ text: ask, history: [{ role: 'user', content: ask }], systemPrompt: TEACHER_SYSTEM_PROMPT });
    setAiBusy(false);
    if (offline) { setError(t('Ufuq AI is not reachable right now. Write the message yourself or try again.')); return; }
    const tm = /TITLE:\s*(.+)/i.exec(reply);
    const bm = /BODY:\s*([\s\S]+)/i.exec(reply);
    if (tm) setTitle(tm[1].trim().replace(/^\*+|\*+$/g, '').slice(0, TITLE_MAX));
    if (bm) setBody(bm[1].trim().slice(0, BODY_MAX));
    if (!tm && !bm) setBody(reply.trim().slice(0, BODY_MAX));
    toast(t('Draft ready — review it before sending.'), 'ok');
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!g) { setError(t('Select a group first.')); return; }
    const trimmedTitle = title.trim();
    if (!trimmedTitle) { setError(t('Title is required.')); return; }
    let recipients = [];
    if (target === '__all__') recipients = members.map((m) => m.user_id);
    else if (target) recipients = [target];
    if (recipients.length === 0) { setError(t('There are no students in this group yet.')); return; }

    setSending(true);
    const rows = recipients.map((uid) => ({ user_id: uid, kind, title: trimmedTitle, body: body.trim(), link: link || null }));
    const { error: err } = await supabase.from('notifications').insert(rows);
    setSending(false);
    if (err) { setError(err.message); return; }
    toast(t('Message sent to {n} student(s).').replace('{n}', rows.length), 'ok');
    setSent((cur) => [{ title: trimmedTitle, to: targetLabel, count: rows.length, at: new Date().toLocaleTimeString() }, ...cur]);
    setTitle(''); setBody(''); setLink(''); setAiTopic('');
  }

  return (
    <section className="page active" id="page-announcements">
      <div className="page-head">
        <h2>{t('Messages to students')}</h2>
        <p>{t('Send a notification to the whole group or to a single student. They see it in their notification bell.')}</p>
      </div>
      <div className="two-col">
        <div className="panel">
          <div className="panel-head"><h3>{t('New message')}</h3></div>
          <div className="tpl-row" aria-label={t('Quick templates')}>
            {TEMPLATES.map((tp) => <button type="button" key={tp.id} className="tpl-chip" onClick={() => applyTemplate(tp)}>{t(tp.title)}</button>)}
          </div>
          <form onSubmit={submit}>
            <div className="field-row">
              <div className="field">
                <label htmlFor="ann-target">{t('Recipient')}</label>
                <select id="ann-target" style={{ width: '100%' }} value={target} onChange={(e) => setTarget(e.target.value)}>
                  {!g ? <option value="">{t('Select a group')}</option> : (
                    <>
                      <option value="__all__">{t('Whole group')} {'\u2014'} {g.name}</option>
                      {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name || t('Student')}</option>)}
                    </>
                  )}
                </select>
              </div>
              <div className="field">
                <label htmlFor="ann-kind">{t('Type')}</label>
                <select id="ann-kind" style={{ width: '100%' }} value={kind} onChange={(e) => setKind(e.target.value)}>
                  {KINDS.map((k) => <option key={k} value={k}>{t(KIND_LABEL[k])}</option>)}
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="ann-ai">{t('Draft with Ufuq AI')}</label>
              <div className="u-toolbar">
                <input id="ann-ai" className="u-input" style={{ flex: 1, minWidth: 180 }} type="text" value={aiTopic} onChange={(e) => setAiTopic(e.target.value)}
                       placeholder={t('e.g. tomorrow\u2019s class moves to 19:00')} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); draftWithAi(); } }} />
                <button type="button" className="btn btn-ai btn-sm" onClick={draftWithAi} disabled={aiBusy}>{aiBusy ? t('Writing\u2026') : t('Write for me')}</button>
              </div>
            </div>
            <div className="field">
              <label htmlFor="ann-title">{t('Title')}</label>
              <input id="ann-title" type="text" style={{ width: '100%' }} required maxLength={TITLE_MAX} value={title} onChange={(e) => setTitle(e.target.value)} />
              <div className="counter">{title.length}/{TITLE_MAX}</div>
            </div>
            <div className="field">
              <label htmlFor="ann-body">{t('Message')}</label>
              <textarea id="ann-body" rows={4} maxLength={BODY_MAX} value={body} onChange={(e) => setBody(e.target.value)}></textarea>
              <div className="counter">{body.length}/{BODY_MAX}</div>
            </div>
            <div className="field">
              <label htmlFor="ann-link">{t('Opens when tapped')}</label>
              <select id="ann-link" style={{ width: '100%' }} value={link} onChange={(e) => setLink(e.target.value)}>
                {LINKS.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
              </select>
            </div>
            <p className="hint" role="alert" style={{ display: error ? 'block' : 'none', color: 'var(--danger-bright)' }}>{error}</p>
            <div className="modal-actions">
              <button type="submit" className="btn btn-gold" disabled={sending || !g || recipientCount === 0}>
                {sending ? t('Sending\u2026') : t('Send to {n}').replace('{n}', recipientCount)}
              </button>
            </div>
          </form>
        </div>

        <div>
          <div className="panel">
            <div className="panel-head"><h3>{t('Preview')}</h3></div>
            <div className="ann-preview">
              <div className="ap-label">{targetLabel || t('Select a group')}</div>
              <div className="ap-card">
                <div className="ap-title">{title.trim() || t('Title')}</div>
                <div className="ap-body">{body.trim() || t('Your message appears here.')}</div>
              </div>
            </div>
          </div>
          <div className="panel">
            <div className="panel-head"><h3>{t('Sent in this session')}</h3></div>
            <div className="u-list">
              {sent.length === 0 ? <div className="empty-block">{t('Nothing sent yet.')}</div>
                : sent.map((a, i) => (
                  <div className="u-item" key={i}>
                    <div className="u-item-main">
                      <div className="u-item-title">{a.title}</div>
                      <div className="u-item-sub">{a.to} {'\u00b7'} {a.at}</div>
                    </div>
                    <span className="u-pill gold">{a.count}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
