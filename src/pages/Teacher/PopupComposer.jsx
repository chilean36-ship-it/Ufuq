import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { usePanel } from '../../components/panel/PanelContext';
import PopupCard from '../../components/PopupCard';

const BUCKET = 'landing-media';   // public bucket the super admin can already write to
const MAX_IMG = 5 * 1024 * 1024;
const TARGETS = [['', 'Just close'], ['library', 'Library'], ['myGroup', 'My group'], ['tasks', 'Tasks'], ['exam', 'Exams'], ['progress', 'Progress'], ['attendance', 'Attendance'], ['billing', 'Plans & payments'], ['__url__', 'A web link']];

/** Super admin: publish a "what's new" pop-up that every student (or one group) sees once when the app opens. */
export default function PopupComposer() {
  const { t, toast, askConfirm, allGroups } = usePanel();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [image, setImage] = useState('');
  const [btn, setBtn] = useState('');
  const [target, setTarget] = useState('');
  const [url, setUrl] = useState('');
  const [audience, setAudience] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [list, setList] = useState(null);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    const { data, error: e1 } = await supabase.from('app_popups').select('id, title, image_url, group_code, is_active, created_at').order('created_at', { ascending: false }).limit(30);
    if (e1) { setList(e1.message || 'error'); return; }
    let seen = {};
    try {
      const r = await supabase.from('app_popup_seen').select('popup_id');
      (r.data || []).forEach((x) => { seen[x.popup_id] = (seen[x.popup_id] || 0) + 1; });
    } catch (e) { seen = {}; }
    setList((data || []).map((p) => ({ ...p, seen: seen[p.id] || 0 })));
  }, []);
  useEffect(() => { load(); }, [load]);

  const pickImage = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\//.test(file.type)) { setError(t('Please choose a picture.')); return; }
    if (file.size > MAX_IMG) { setError(t('The picture is larger than 5 MB.')); return; }
    setError(''); setUploading(true);
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';
    const path = 'popups/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
    const { error: up } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false, cacheControl: '31536000' });
    setUploading(false);
    if (up) { setError(up.message); return; }
    setImage(supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
  };

  const link = target === '__url__' ? url.trim() : target;
  const ctaLabel = btn.trim() || (link ? t('View') : '');

  const publish = async (e) => {
    e.preventDefault();
    setError('');
    if (!title.trim()) { setError(t('Title is required.')); return; }
    if (target === '__url__' && !/^https:\/\//i.test(url.trim())) { setError(t('A web link must start with https://')); return; }
    setBusy(true);
    const { error: err } = await supabase.from('app_popups').insert({
      title: title.trim(), body: body.trim() || null, image_url: image || null,
      cta_label: btn.trim() || null, cta_link: link || null, group_code: audience || null, is_active: true,
    });
    setBusy(false);
    if (err) { setError(err.message); return; }
    toast(t('Published. Students will see it when they open the app.'), 'ok');
    setTitle(''); setBody(''); setImage(''); setBtn(''); setTarget(''); setUrl(''); setAudience('');
    load();
  };

  const toggle = async (p) => {
    const { error: err } = await supabase.from('app_popups').update({ is_active: !p.is_active }).eq('id', p.id);
    if (err) { toast(err.message, 'err'); return; }
    load();
  };
  const remove = (p) => {
    askConfirm(t('Delete this pop-up?'), p.title, async () => {
      const { error: err } = await supabase.from('app_popups').delete().eq('id', p.id);
      if (err) { toast(err.message, 'err'); return; }
      load();
    });
  };

  const groupName = (code) => { const g = (allGroups || []).find((x) => x.code === code); return g ? g.name : code; };

  return (
    <div className="two-col">
      <div className="panel">
        <div className="panel-head"><h3>{t('New app pop-up')}</h3></div>
        <p className="hint" style={{ marginTop: 0 }}>{t('Shown once to each student when they open the app: a picture, a title, a text and one button.')}</p>
        <form onSubmit={publish}>
          <div className="field">
            <label>{t('Picture')}</label>
            <div className="u-toolbar">
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={pickImage} />
              <button type="button" className="btn btn-sm" onClick={() => fileRef.current && fileRef.current.click()} disabled={uploading}>{uploading ? t('Uploading…') : image ? t('Change picture') : t('Choose picture')}</button>
              {image && <button type="button" className="btn btn-sm" onClick={() => setImage('')}>{t('Remove')}</button>}
              <span className="hint" style={{ margin: 0 }}>{t('Wide pictures look best (16:10), up to 5 MB.')}</span>
            </div>
          </div>
          <div className="field">
            <label htmlFor="pp-title">{t('Title')}</label>
            <input id="pp-title" type="text" style={{ width: '100%' }} maxLength={140} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="pp-body">{t('Text')}</label>
            <textarea id="pp-body" rows={4} maxLength={1200} value={body} onChange={(e) => setBody(e.target.value)}></textarea>
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="pp-target">{t('Button opens')}</label>
              <select id="pp-target" style={{ width: '100%' }} value={target} onChange={(e) => setTarget(e.target.value)}>
                {TARGETS.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="pp-btn">{t('Button text')}</label>
              <input id="pp-btn" type="text" style={{ width: '100%' }} maxLength={40} value={btn} placeholder={link ? t('View') : t('No button')} onChange={(e) => setBtn(e.target.value)} />
            </div>
          </div>
          {target === '__url__' && (
            <div className="field">
              <label htmlFor="pp-url">{t('Web link')}</label>
              <input id="pp-url" type="url" style={{ width: '100%' }} placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
            </div>
          )}
          <div className="field">
            <label htmlFor="pp-aud">{t('Who sees it')}</label>
            <select id="pp-aud" style={{ width: '100%' }} value={audience} onChange={(e) => setAudience(e.target.value)}>
              <option value="">{t('Every student')}</option>
              {(allGroups || []).filter((g) => g.is_active !== false).map((g) => <option key={g.code} value={g.code}>{g.name}</option>)}
            </select>
          </div>
          <p className="hint" role="alert" style={{ display: error ? 'block' : 'none', color: 'var(--danger-bright)' }}>{error}</p>
          <div className="modal-actions">
            <button type="submit" className="btn btn-gold" disabled={busy || uploading}>{busy ? t('Publishing…') : t('Publish')}</button>
          </div>
        </form>
      </div>

      <div>
        <div className="panel">
          <div className="panel-head"><h3>{t('Preview')}</h3></div>
          <div style={{ padding: '4px 0 2px' }}>
            <PopupCard imageUrl={image} title={title.trim() || t('Title')} body={body.trim() || t('Your text appears here.')} ctaLabel={ctaLabel} placeholder={t('Picture')} />
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><h3>{t('Published pop-ups')}</h3></div>
          <div className="u-list">
            {list === null ? <div className="empty-block">{t('Loading…')}</div>
              : typeof list === 'string' ? <div className="empty-block">{t('The pop-up tables are not installed yet. Run supabase/migrations/20261209_app_popups.sql first.')}</div>
                : list.length === 0 ? <div className="empty-block">{t('Nothing published yet.')}</div>
                  : list.map((p) => (
                    <div className="u-item" key={p.id}>
                      <div className="u-item-main">
                        <div className="u-item-title">{p.title}</div>
                        <div className="u-item-sub">{p.group_code ? groupName(p.group_code) : t('Every student')} {'·'} {new Date(p.created_at).toLocaleDateString()} {'·'} {t('Seen by')} {p.seen}</div>
                      </div>
                      <button type="button" className={'btn btn-sm' + (p.is_active ? ' btn-gold' : '')} onClick={() => toggle(p)}>{p.is_active ? t('On') : t('Off')}</button>
                      <button type="button" className="btn btn-sm" onClick={() => remove(p)} aria-label={t('Delete')}>{'✕'}</button>
                    </div>
                  ))}
          </div>
        </div>
      </div>
    </div>
  );
}
