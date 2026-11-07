import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { usePanel } from '../../components/panel/PanelContext';
import { Ico, PageHeader, Skeleton, StatCard } from './ui';
import CardVideo from '../Landing/CardVideo';
import {
  LANDING_BUCKET, LANDING_GROUPS, LANDING_LINKS, LANDING_SLOTS, IMAGE_MAX_MB, VIDEO_MAX_MB, fetchLandingMedia,
} from '../../lib/landingMedia';

const CSS = `
.lm-group{ margin-bottom:26px; }
.lm-group h3{ margin:0 0 12px; font-size:15px; display:flex; align-items:center; gap:8px; }
.lm-grid{ display:grid; grid-template-columns:repeat(auto-fill,minmax(250px,1fr)); gap:14px; }
.lm-card{ background:var(--bg-2); border:1px solid var(--line); border-radius:16px; overflow:hidden; display:flex; flex-direction:column; transition:border-color .15s ease, transform .15s ease; }
.lm-card:hover{ border-color:var(--a-ring,rgba(201,162,75,.4)); transform:translateY(-3px); box-shadow:var(--a-shadow-lg); }
.lm-card{ border-radius:20px !important; box-shadow:var(--a-shadow); }
.lm-thumb img{ transition:transform .5s ease; } .lm-card:hover .lm-thumb img{ transform:scale(1.04); }
.lm-thumb{ position:relative; aspect-ratio:16/10; background:var(--bg-3); overflow:hidden; }
.lm-thumb img{ width:100%; height:100%; object-fit:cover; display:block; }
.lm-thumb .lm-badge{ position:absolute; top:8px; left:8px; padding:3px 9px; border-radius:99px; font-size:11px; font-weight:700; background:rgba(0,0,0,.6); color:#fff; backdrop-filter:blur(4px); }
.lm-thumb .lm-badge.custom{ background:var(--gold); color:#1A1405; }
.lm-thumb .lm-vid{ position:absolute; right:8px; bottom:8px; padding:3px 9px; border-radius:99px; font-size:11px; font-weight:700; background:rgba(0,0,0,.6); color:#fff; }
.lm-body{ padding:12px 14px 14px; display:flex; flex-direction:column; gap:10px; flex:1; }
.lm-title{ font-size:13px; font-weight:600; line-height:1.35; }
.lm-actions{ display:flex; flex-wrap:wrap; gap:6px; margin-top:auto; }
.lm-busy{ position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,.55); color:#fff; font-size:13px; font-weight:600; }
.lm-url{ display:flex; gap:6px; } .lm-url input{ flex:1; min-width:0; }
`;

const ext = (f) => ((f.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin');
const mb = (n) => Math.round((n / 1048576) * 10) / 10;

/** Opens the picked video locally: resolves { w, h } if this browser can play it, or null if it cannot (e.g. HEVC .mov). */
function probeVideo(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    let done = false;
    const end = (r) => { if (done) return; done = true; clearTimeout(timer); URL.revokeObjectURL(url); v.removeAttribute('src'); v.load(); resolve(r); };
    const timer = setTimeout(() => end(null), 8000);
    v.preload = 'metadata'; v.muted = true;
    v.onloadedmetadata = () => end(v.videoWidth > 0 ? { w: v.videoWidth, h: v.videoHeight } : null);
    v.onerror = () => end(null);
    v.src = url;
  });
}

/** Main admin: replace the images / videos shown on the public landing page. */
export default function LandingMediaPage() {
  const { t, toast, askConfirm, user } = usePanel();
  const [rows, setRows] = useState(null);       // { slot: row }
  const [busy, setBusy] = useState({});         // slot → true
  const [urlOpen, setUrlOpen] = useState(null); // slot with the "paste video link" box open
  const [urlVal, setUrlVal] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const pending = useRef(null);                 // { slot, kind }

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.from('landing_media').select('*');
    if (err) { setError(err.message); setRows({}); return; }
    const m = {}; (data || []).forEach((r) => { m[r.slot] = r; });
    setRows(m);
  }, []);
  useEffect(() => { load(); }, [load]);

  const setB = (slot, v) => setBusy((b) => ({ ...b, [slot]: v }));

  async function save(slot, patch) {
    const cur = (rows && rows[slot]) || {};
    const next = { slot, image_url: cur.image_url || null, video_url: cur.video_url || null, image_path: cur.image_path || null, video_path: cur.video_path || null,
                   ...patch, updated_at: new Date().toISOString(), updated_by: user ? user.id : null };
    if (!next.image_url && !next.video_url) {
      const { error: e1 } = await supabase.from('landing_media').delete().eq('slot', slot);
      if (e1) throw e1;
    } else {
      const { error: e2 } = await supabase.from('landing_media').upsert(next, { onConflict: 'slot' });
      if (e2) throw e2;
    }
  }
  const removeObject = (path) => { if (path) supabase.storage.from(LANDING_BUCKET).remove([path]).catch(() => {}); };

  function pick(slot, kind) {
    pending.current = { slot, kind };
    if (fileRef.current) { fileRef.current.accept = kind === 'video' ? 'video/mp4,video/webm' : 'image/jpeg,image/png,image/webp,image/avif,image/gif'; fileRef.current.value = ''; fileRef.current.click(); }
  }

  async function onFile(e) {
    const file = e.target.files && e.target.files[0];
    const job = pending.current;
    if (!file || !job) return;
    const { slot, kind } = job;
    const limit = kind === 'video' ? VIDEO_MAX_MB : IMAGE_MAX_MB;
    if (!file.type.startsWith(kind + '/')) { toast(t('Wrong file type.'), 'err'); return; }
    if (kind === 'video') {
      if (file.type === 'video/quicktime' || /.mov$/i.test(file.name)) { toast(t('MOV videos do not play on every phone. Please convert it to MP4 (H.264) and upload again.'), 'err'); return; }
      const info = await probeVideo(file);
      if (!info) { toast(t('This video cannot be played in the browser. Please export it as MP4 (H.264 video, AAC audio) and upload again.'), 'err'); return; }
      if (info.w > info.h * 1.15 && /^(stories|morals|culture)_/.test(slot)) toast(t('This video is landscape, the cards are vertical (4:5). It will be shown whole on a blurred background. For the best look upload a vertical video, for example 1080×1350.'), 'ok');
    }
    if (file.size > limit * 1048576) {
      toast(t('File is too large ({a} MB). Maximum is {b} MB.').replace('{a}', mb(file.size)).replace('{b}', limit) + (kind === 'video' ? ' ' + t('For bigger videos paste a direct link instead.') : ''), 'err');
      return;
    }
    setB(slot, true);
    try {
      const path = slot + '/' + kind + '-' + Date.now() + '.' + ext(file);
      const { error: upErr } = await supabase.storage.from(LANDING_BUCKET).upload(path, file, { contentType: file.type, upsert: false, cacheControl: '31536000' });
      if (upErr) throw upErr;
      const url = supabase.storage.from(LANDING_BUCKET).getPublicUrl(path).data.publicUrl;
      const old = rows && rows[slot];
      await save(slot, kind === 'video' ? { video_url: url, video_path: path } : { image_url: url, image_path: path });
      removeObject(old && (kind === 'video' ? old.video_path : old.image_path));
      toast(t('Saved. The landing page is updated.'), 'ok');
      fetchLandingMedia(true);
      await load();
    } catch (err) { toast(err.message || String(err), 'err'); }
    setB(slot, false);
  }

  async function saveVideoUrl(slot) {
    const v = urlVal.trim();
    if (!/^https:\/\/\S+$/i.test(v)) { toast(t('Enter a direct https:// link to an .mp4 or .webm file.'), 'err'); return; }
    setB(slot, true);
    try {
      const old = rows && rows[slot];
      await save(slot, { video_url: v, video_path: null });
      removeObject(old && old.video_path);
      toast(t('Saved. The landing page is updated.'), 'ok');
      setUrlOpen(null); setUrlVal('');
      fetchLandingMedia(true); await load();
    } catch (err) { toast(err.message || String(err), 'err'); }
    setB(slot, false);
  }

  function clearPart(slot, kind) {
    askConfirm(t('Reset to default'), t(kind === 'video' ? 'The custom video will be removed and the original video used again. Continue?' : 'The custom image will be removed and the original image used again. Continue?'), async () => {
      setB(slot, true);
      try {
        const old = rows && rows[slot];
        await save(slot, kind === 'video' ? { video_url: null, video_path: null } : { image_url: null, image_path: null });
        removeObject(old && (kind === 'video' ? old.video_path : old.image_path));
        toast(t('Reset to the original.'), 'ok');
        fetchLandingMedia(true); await load();
      } catch (err) { toast(err.message || String(err), 'err'); }
      setB(slot, false);
    });
  }

  const [links, setLinks] = useState({});
  useEffect(() => {
    if (!rows) return;
    const m = {}; LANDING_LINKS.forEach((l) => { m[l.slot] = (rows[l.slot] && rows[l.slot].video_url) || ''; });
    setLinks(m);
  }, [rows]);

  async function saveLink(slot) {
    const v = (links[slot] || '').trim();
    if (v && !/^https:\/\/\S+$/i.test(v)) { toast(t('Enter a full https:// link.'), 'err'); return; }
    setB(slot, true);
    try {
      await save(slot, { video_url: v || null, video_path: null });
      toast(v ? t('Link saved.') : t('Link removed.'), 'ok');
      fetchLandingMedia(true); await load();
    } catch (err) { toast(err.message || String(err), 'err'); }
    setB(slot, false);
  }

  const groups = useMemo(() => LANDING_GROUPS.map((g) => ({ g, slots: LANDING_SLOTS.filter((s) => s.group === g) })), []);

  return (
    <section className="page active" id="page-landing">
      <style>{CSS}</style>
      <input ref={fileRef} type="file" hidden onChange={onFile} />
      <PageHeader title={t('Landing page')} sub={t('Change the photos and videos on the public home page. Images up to {a} MB, videos up to {b} MB (or paste a direct link). Videos: MP4 (H.264), vertical 4:5 such as 1080×1350 fits the cards best.').replace('{a}', IMAGE_MAX_MB).replace('{b}', VIDEO_MAX_MB)}>
        <a className="btn btn-ghost" href="/index" target="_blank" rel="noreferrer">{t('Open landing page')} {'\u2197'}</a>
      </PageHeader>
      <div className="a-stats a-stats-sm">
        <StatCard loading={rows === null} tone="var(--gold)" label={t('Image slots')} value={LANDING_SLOTS.length} icon={<Ico><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" /></Ico>} />
        <StatCard loading={rows === null} tone="var(--a-teal)" label={t('Customised')} value={rows ? LANDING_SLOTS.filter((s) => rows[s.slot] && (rows[s.slot].image_url || rows[s.slot].video_url)).length : 0} icon={<Ico><path d="M20 6 9 17l-5-5" /></Ico>} />
        <StatCard loading={rows === null} tone="var(--a-blue)" label={t('Default')} value={rows ? LANDING_SLOTS.filter((s) => !(rows[s.slot] && (rows[s.slot].image_url || rows[s.slot].video_url))).length : 0} icon={<Ico><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" /></Ico>} />
      </div>
      <div className="panel" style={{ marginBottom: 22 }}>
        <div className="panel-head"><h3>{t('Footer links')}</h3></div>
        <p className="hint" style={{ marginTop: 0 }}>{t('Shown in the footer of the landing page. Leave empty to hide the link.')}</p>
        <div className="field-row-3">
          {LANDING_LINKS.map((l) => (
            <div className="field" key={l.slot}>
              <label>{l.label}</label>
              <div className="lm-url">
                <input className="u-input" type="url" placeholder={l.placeholder} value={links[l.slot] || ''} onChange={(e) => setLinks((m) => ({ ...m, [l.slot]: e.target.value }))} />
                <button className="btn btn-gold btn-sm" disabled={busy[l.slot] || rows === null} onClick={() => saveLink(l.slot)}>{t('Save')}</button>
              </div>
            </div>
          ))}
        </div>
      </div>
      {error && <p className="hint" style={{ color: 'var(--danger-bright)' }}>{error}</p>}
      {rows === null ? <Skeleton h={220} style={{ borderRadius: 20 }} /> : groups.map(({ g, slots }) => (
        <div className="lm-group" key={g}>
          <h3><span className="panel-head-bar" style={{ display: 'inline-block', width: 4, height: 15, borderRadius: 3, background: 'var(--gold)' }} />{t(g)}</h3>
          <div className="lm-grid">
            {slots.map((s) => {
              const r = rows[s.slot] || {};
              const imgCustom = !!r.image_url;
              const vidCustom = !!r.video_url;
              const hasVideo = s.defaultVideo !== null;
              return (
                <div className="lm-card" key={s.slot}>
                  <div className="lm-thumb">
                    <img src={(r.image_url || s.defaultImage) + (imgCustom ? '?v=' + new Date(r.updated_at).getTime() : '')} alt={s.label} loading="lazy" onError={(e) => { e.currentTarget.style.opacity = 0.15; }} />
                    {hasVideo && <CardVideo src={r.video_url || s.defaultVideo} poster={(r.image_url || s.defaultImage)} />}
                    <span className={'lm-badge' + (imgCustom ? ' custom' : '')}>{imgCustom ? t('Custom image') : t('Default image')}</span>
                    {hasVideo && <span className="lm-vid">{'\u25B6'} {vidCustom ? t('Custom video') : t('Default video')}</span>}
                    {busy[s.slot] && <div className="lm-busy">{t('Working…')}</div>}
                  </div>
                  <div className="lm-body">
                    <div className="lm-title">{s.label}</div>
                    <div className="lm-actions">
                      <button className="btn btn-gold btn-sm" disabled={busy[s.slot]} onClick={() => pick(s.slot, 'image')}>{t('Change image')}</button>
                      {imgCustom && <button className="btn btn-ghost btn-sm" disabled={busy[s.slot]} onClick={() => clearPart(s.slot, 'image')}>{t('Reset image')}</button>}
                      {hasVideo && <button className="btn btn-ghost btn-sm" disabled={busy[s.slot]} onClick={() => pick(s.slot, 'video')}>{t('Upload video')}</button>}
                      {hasVideo && <button className="btn btn-ghost btn-sm" disabled={busy[s.slot]} onClick={() => { setUrlOpen(urlOpen === s.slot ? null : s.slot); setUrlVal(r.video_url || ''); }}>{t('Video link')}</button>}
                      {hasVideo && vidCustom && <button className="btn btn-ghost btn-sm" disabled={busy[s.slot]} onClick={() => clearPart(s.slot, 'video')}>{t('Reset video')}</button>}
                    </div>
                    {urlOpen === s.slot && (
                      <div className="lm-url">
                        <input className="u-input" type="url" placeholder="https://…/video.mp4" value={urlVal} onChange={(e) => setUrlVal(e.target.value)} />
                        <button className="btn btn-gold btn-sm" onClick={() => saveVideoUrl(s.slot)} disabled={busy[s.slot]}>{t('Save')}</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
