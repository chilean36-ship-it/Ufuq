import { safeHttpUrl } from '../../lib/safeUrl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import useLiveRefresh from '../../lib/liveRefresh';
import { usePanel } from '../../components/panel/PanelContext';
import { Modal } from '../../components/panel/ui';
import { fmtDate, groupLetterFor, todayStr, uploadToAudioWorker } from '../../lib/panelUtils';

/** Uploads into <bucket>/<group_code>/<file> and returns its public URL — used for board photos
 *  (audio still goes through the R2 worker via uploadToAudioWorker). */
async function uploadToBucket(bucket, groupCode, file) {
  try {
    const clean = file.name.replace(/[^\w.-]+/g, '-').slice(-80);
    const path = groupCode + '/' + Date.now() + '-' + clean;
    const { error } = await supabase.storage.from(bucket).upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type || undefined });
    if (error) throw error;
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    if (!data || !data.publicUrl) throw new Error('public URL');
    return { ok: true, url: data.publicUrl };
  } catch (err) { return { ok: false, error: (err && err.message) || String(err) }; }
}

const IcoAudio = <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>;
const IcoImage = <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>;
const IcoPlus = <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>;
const IcoOpen = <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" /></svg>;
const IcoEdit = <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>;
const IcoTrash = <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" /></svg>;
const IcoChevron = <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>;

function IconBtn({ title, danger, onClick, href, children }) {
  const cls = 'mt-ib' + (danger ? ' danger' : '');
  if (href) return <a className={cls} href={href} target="_blank" rel="noopener noreferrer" title={title} aria-label={title}>{children}</a>;
  return <button type="button" className={cls} onClick={onClick} title={title} aria-label={title}>{children}</button>;
}

const noopCount = () => {};

/** Ordinary admin: audio lessons for the group(s) linked to them only (no board photos, no all-students publishing). */
export function AudioLessonsPage() {
  const { t } = usePanel();
  return (
    <section className="page active" id="page-materials">
      <div className="page-head">
        <h2>{t('Audio lessons')}</h2>
        <p>{t('Audio lessons for your own group. Only the students of that group see them.')}</p>
      </div>
      <AudioLessons restricted onCount={noopCount} />
    </section>
  );
}

export default function MaterialsPage() {
  const { t } = usePanel();
  const [tab, setTab] = useState('audio');
  const [counts, setCounts] = useState({ audio: null, board: null });
  const setAudio = useCallback((n) => setCounts((c) => (c.audio === n ? c : { ...c, audio: n })), []);
  const setBoard = useCallback((n) => setCounts((c) => (c.board === n ? c : { ...c, board: n })), []);
  return (
    <section className="page active" id="page-materials">
      <div className="page-head">
        <h2>{t('Materials')}</h2>
        <p>{t('Audio lessons and board photos published to the selected group.')}</p>
      </div>
      <div className="mt-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'audio'} className={'mt-tab' + (tab === 'audio' ? ' on' : '')} onClick={() => setTab('audio')}>
          {IcoAudio}<span>{t('Audio lessons')}</span>{counts.audio != null && <em>{counts.audio}</em>}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'board'} className={'mt-tab' + (tab === 'board' ? ' on' : '')} onClick={() => setTab('board')}>
          {IcoImage}<span>{t('Board photos')}</span>{counts.board != null && <em>{counts.board}</em>}
        </button>
      </div>
      <AudioLessons hidden={tab !== 'audio'} onCount={setAudio} />
      <BoardPhotos hidden={tab !== 'board'} onCount={setBoard} />
    </section>
  );
}

function AudioLessons({ hidden, onCount, restricted }) {
  const { t, toast, askConfirm, currentGroup: g } = usePanel();
  const code = g ? g.code : null;
  const [list, setList] = useState(null);
  const [modal, setModal] = useState({ open: false, item: null });
  const [openId, setOpenId] = useState(null);
  useEffect(() => { onCount(Array.isArray(list) ? list.length : null); }, [list, onCount]);

  const load = useCallback(async (opts) => {
    const silent = !!(opts && opts.silent);
    if (!code) { setList(null); return; }
    if (!silent) setList(null);
    const { data, error } = await supabase.from('audio_lessons').select('*').or('group_code.eq.' + code + ',group_code.is.null').order('published_at', { ascending: false });
    if (error) { setList({ error: error.message }); return; }
    setList(data || []);
  }, [code]);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load);

  function del(a) {
    askConfirm(t('Delete'), t('This audio lesson will be deleted. Continue?'), async () => {
      const { error } = await supabase.from('audio_lessons').delete().eq('id', a.id);
      if (error) { toast(error.message, 'err'); return; }
      toast(t('Audio lesson deleted.'), 'ok');
      load();
    });
  }

  return (
    <div className="mt-pane" hidden={hidden}>
      <div className="mt-bar">
        <span className="mt-bar-title">{t('Audio lessons')}</span>
        <button className="btn btn-gold btn-sm mt-add" onClick={() => { if (!g) { toast(t('Select a group first.'), 'err'); return; } setModal({ open: true, item: null }); }}>{IcoPlus}{t('+ New audio lesson').replace(/^\+\s*/, '')}</button>
      </div>
      <div className="mt-list">
        {!g ? <div className="empty-block">{t('Select a group')}</div>
          : list === null ? <div className="empty-block">{t('Loading…')}</div>
          : list.error ? <div className="empty-block">{list.error}</div>
          : list.length === 0 ? <div className="empty-block">{t('No audio lessons yet.')}</div>
          : list.map((a) => {
            const mins = Math.round((a.duration_seconds || 0) / 60);
            const mine = a.group_code === code;
            const open = openId === a.id;
            const url = safeHttpUrl(a.drive_url);
            return (
              <div className={'mt-row' + (open ? ' open' : '')} key={a.id}>
                <div className="mt-row-head">
                  <button type="button" className="mt-row-main" onClick={() => setOpenId(open ? null : a.id)} aria-expanded={open}>
                    <span className="mt-row-ico">{IcoAudio}</span>
                    <span className="mt-row-txt">
                      <span className="mt-row-title">{a.title}</span>
                      <span className="mt-row-meta">
                        <span className={'u-pill' + (mine ? ' gold' : '')}>{t(mine ? 'This group only' : 'All students')}</span>
                        {mins > 0 && <span className="u-pill">{mins} {t('min')}</span>}
                        <span className="u-pill">{fmtDate(a.published_at)}</span>
                      </span>
                    </span>
                    {a.description && <span className="mt-chev">{IcoChevron}</span>}
                  </button>
                  <div className="mt-row-actions">
                    {url && <IconBtn title={t('Open')} href={url}>{IcoOpen}</IconBtn>}
                    {mine && <>
                      <IconBtn title={t('Edit')} onClick={() => setModal({ open: true, item: a })}>{IcoEdit}</IconBtn>
                      <IconBtn title={t('Delete')} danger onClick={() => del(a)}>{IcoTrash}</IconBtn>
                    </>}
                  </div>
                </div>
                {open && a.description && <div className="mt-row-body">{a.description}</div>}
              </div>
            );
          })}
      </div>
      <AudioModal state={modal} restricted={!!restricted} onClose={() => setModal((m) => ({ ...m, open: false }))} onSaved={load} />
    </div>
  );
}

function AudioModal({ state, onClose, onSaved, restricted }) {
  const { t, currentGroup: g } = usePanel();
  const fileRef = useRef(null);
  const [f, setF] = useState({ title: '', desc: '', url: '', minutes: 0, scope: 'group' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const item = state.item;

  useEffect(() => {
    if (!state.open) return;
    setF({
      title: item ? item.title : '', desc: item ? (item.description || '') : '', url: item ? (item.drive_url || '') : '',
      minutes: item ? Math.round((item.duration_seconds || 0) / 60) : 0, scope: !restricted && item && !item.group_code ? 'global' : 'group',
    });
    setError('');
    if (fileRef.current) fileRef.current.value = '';
  }, [state.open, item, restricted]);

  async function submit(e) {
    e.preventDefault();
    if (!g) { setError(t('Select a group first.')); return; }
    setSaving(true); setError('');
    let url = f.url.trim();
    const file = fileRef.current && fileRef.current.files[0];
    if (file) {
      const letter = groupLetterFor(g);
      if (!letter) { setError(t('This group name is not in the A\u2013G naming scheme \u2014 paste a link instead.')); setSaving(false); return; }
      setError(t('Uploading…'));
      const up = await uploadToAudioWorker(letter, file);
      if (!up.ok) { setError(up.error); setSaving(false); return; }
      url = up.url;
      setError('');
    }
    if (!url) { setError(t('Pick a file or paste a link.')); setSaving(false); return; }
    const global = !restricted && f.scope === 'global';
    const payload = { group_code: global ? null : g.code, title: f.title.trim(), description: f.desc.trim(), drive_url: url, duration_seconds: (parseInt(f.minutes, 10) || 0) * 60 };
    const result = item ? await supabase.from('audio_lessons').update(payload).eq('id', item.id) : await supabase.from('audio_lessons').insert(payload);
    setSaving(false);
    if (result.error) { setError(global ? t('Only an admin can publish to all students.') + ' ' + result.error.message : result.error.message); return; }
    onClose(); onSaved();
  }

  return (
    <Modal open={state.open} onClose={onClose}>
      <h3>{t(item ? 'Edit audio lesson' : 'New audio lesson')}</h3>
      <form onSubmit={submit}>
        <div className="field"><label>{t('Title')}</label><input type="text" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div className="field"><label>{t('Description')}</label><textarea rows={2} value={f.desc} onChange={(e) => setF({ ...f, desc: e.target.value })}></textarea></div>
        <div className="field">
          <label>{t('Audio file')}</label>
          <input type="file" accept="audio/*" className="file-input" ref={fileRef} />
          <p className="hint">{t('Pick a file from your phone or computer \u2014 it is uploaded and linked automatically.')}</p>
        </div>
        <div className="field">
          <label>{t('\u2026or paste a link')}</label>
          <input type="text" placeholder="https://drive.google.com/file/d/..." value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} />
          <p className="hint">{t('Share the file as \u201cAnyone with the link\u201d.')}</p>
        </div>
        <div className="field-row">
          <div className="field"><label>{t('Duration (minutes)')}</label><input type="number" min="0" max="600" value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value })} /></div>
          <div className="field">
            <label>{t('Visibility')}</label>
            <select value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })}>
              <option value="group">{t('This group only')}</option>
              {!restricted && <option value="global">{t('All students')}</option>}
            </select>
          </div>
        </div>
        <p className="hint" style={{ display: error ? 'block' : 'none', color: 'var(--danger-bright)' }}>{error}</p>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t('Cancel')}</button>
          <button type="submit" className="btn btn-gold" disabled={saving}>{t('Save')}</button>
        </div>
      </form>
    </Modal>
  );
}

function BoardPhotos({ hidden, onCount }) {
  const { t, toast, askConfirm, currentGroup: g } = usePanel();
  const code = g ? g.code : null;
  const [list, setList] = useState(null);
  const [modal, setModal] = useState({ open: false, item: null });
  useEffect(() => { onCount(Array.isArray(list) ? list.length : null); }, [list, onCount]);

  const load = useCallback(async (opts) => {
    const silent = !!(opts && opts.silent);
    if (!code) { setList(null); return; }
    if (!silent) setList(null);
    const { data, error } = await supabase.from('board_photos').select('*').eq('group_code', code).order('taken_at', { ascending: false });
    if (error) { setList({ error: error.message }); return; }
    setList(data || []);
  }, [code]);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load);

  function del(p) {
    askConfirm(t('Delete'), t('This board photo will be deleted. Continue?'), async () => {
      const { error } = await supabase.from('board_photos').delete().eq('id', p.id);
      if (error) { toast(error.message, 'err'); return; }
      toast(t('Board photo deleted.'), 'ok');
      load();
    });
  }

  return (
    <div className="mt-pane" hidden={hidden}>
      <div className="mt-bar">
        <span className="mt-bar-title">{t('Board photos')}</span>
        <button className="btn btn-gold btn-sm mt-add" onClick={() => { if (!g) { toast(t('Select a group first.'), 'err'); return; } setModal({ open: true, item: null }); }}>{IcoPlus}{t('+ New board photo').replace(/^\+\s*/, '')}</button>
      </div>
      {!g ? <div className="empty-block">{t('Select a group')}</div>
        : list === null ? <div className="empty-block">{t('Loading…')}</div>
        : list.error ? <div className="empty-block">{list.error}</div>
        : list.length === 0 ? <div className="empty-block">{t('No board photos yet.')}</div>
        : <div className="mt-grid">
          {list.map((p) => {
            const url = safeHttpUrl(p.storage_path);
            return (
              <div className="mt-photo" key={p.id}>
                <a className="mt-photo-thumb" href={url || '#'} target="_blank" rel="noopener noreferrer" title={t('Open')}>
                  {IcoImage}
                  {url && <img src={url} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
                </a>
                <div className="mt-photo-foot">
                  <div className="mt-photo-txt">
                    <span className="mt-photo-cap">{p.caption || t('Board photo')}</span>
                    <span className="mt-photo-date">{fmtDate(p.taken_at)}</span>
                  </div>
                  <div className="mt-row-actions">
                    <IconBtn title={t('Edit')} onClick={() => setModal({ open: true, item: p })}>{IcoEdit}</IconBtn>
                    <IconBtn title={t('Delete')} danger onClick={() => del(p)}>{IcoTrash}</IconBtn>
                  </div>
                </div>
              </div>
            );
          })}
        </div>}
      <BoardModal state={modal} onClose={() => setModal((m) => ({ ...m, open: false }))} onSaved={load} />
    </div>
  );
}

function BoardModal({ state, onClose, onSaved }) {
  const { t, currentGroup: g } = usePanel();
  const fileRef = useRef(null);
  const [f, setF] = useState({ caption: '', url: '', date: todayStr() });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const item = state.item;

  useEffect(() => {
    if (!state.open) return;
    setF({ caption: item ? (item.caption || '') : '', url: item ? (item.storage_path || '') : '', date: item ? item.taken_at : todayStr() });
    setError('');
    if (fileRef.current) fileRef.current.value = '';
  }, [state.open, item]);

  async function submit(e) {
    e.preventDefault();
    if (!g) { setError(t('Select a group first.')); return; }
    setSaving(true); setError('');
    let url = f.url.trim();
    const file = fileRef.current && fileRef.current.files[0];
    if (file) {
      setError(t('Uploading…'));
      const up = await uploadToBucket('board-images', g.code, file);
      if (!up.ok) { setError(up.error); setSaving(false); return; }
      url = up.url;
      setError('');
    }
    if (!url) { setError(t('Pick a file or paste a link.')); setSaving(false); return; }
    const payload = { group_code: g.code, caption: f.caption.trim(), storage_path: url, taken_at: f.date };
    const result = item ? await supabase.from('board_photos').update(payload).eq('id', item.id) : await supabase.from('board_photos').insert(payload);
    setSaving(false);
    if (result.error) { setError(result.error.message); return; }
    onClose(); onSaved();
  }

  return (
    <Modal open={state.open} onClose={onClose}>
      <h3>{t(item ? 'Edit board photo' : 'New board photo')}</h3>
      <form onSubmit={submit}>
        <div className="field"><label>{t('Caption')}</label><input type="text" value={f.caption} onChange={(e) => setF({ ...f, caption: e.target.value })} /></div>
        <div className="field">
          <label>{t('Image file')}</label>
          <input type="file" accept="image/*" className="file-input" ref={fileRef} />
          <p className="hint">{t('Pick a file from your phone or computer \u2014 it is uploaded and linked automatically.')}</p>
        </div>
        <div className="field">
          <label>{t('\u2026or paste a link')}</label>
          <input type="text" placeholder="https://drive.google.com/file/d/..." value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} />
          <p className="hint">{t('Share the file as \u201cAnyone with the link\u201d.')}</p>
        </div>
        <div className="field"><label>{t('Lesson date')}</label><input type="date" required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
        <p className="hint" style={{ display: error ? 'block' : 'none', color: 'var(--danger-bright)' }}>{error}</p>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t('Cancel')}</button>
          <button type="submit" className="btn btn-gold" disabled={saving}>{t('Save')}</button>
        </div>
      </form>
    </Modal>
  );
}
