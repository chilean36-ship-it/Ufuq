import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import useLiveRefresh from '../../lib/liveRefresh';
import { usePanel } from '../../components/panel/PanelContext';
import { Modal } from '../../components/panel/ui';
import { deleteMedia, fmtBytes, fmtClock, probeDuration, signMedia, uploadMedia } from '../../lib/mediaUpload';
import { fmtDate } from '../../lib/panelUtils';
import Loader from '../../components/Loader';

const ico = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
const UploadIcon = () => <svg {...ico}><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></svg>;
const VideoIcon = () => <svg {...ico}><rect x="2" y="5" width="14" height="14" rx="3" /><path d="M16 10l6-3v10l-6-3z" /></svg>;
const AudioIcon = () => <svg {...ico}><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>;
const PlayIcon = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5z" /></svg>;
const CheckIcon = () => <svg {...ico} strokeWidth={2.6}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
const TrashIcon = () => <svg {...ico}><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" /></svg>;
const FolderIcon = () => <svg {...ico}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>;
const GridIcon = () => <svg {...ico}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>;
const ListIcon = () => <svg {...ico}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>;
const ChevIcon = () => <svg {...ico} strokeWidth={2.4}><path d="M6 9l6 6 6-6" /></svg>;
const CloseIcon = () => <svg {...ico}><path d="M6 6l12 12M18 6L6 18" /></svg>;

const WAVE = [30, 55, 80, 45, 95, 60, 35, 75, 50, 88, 40, 66, 28, 72, 52, 84, 38, 62];
const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|avi|3gp)$/i;
const AUDIO_EXT = /\.(mp3|m4a|wav|ogg|aac|opus|flac)$/i;
const MIME_FALLBACK = { mkv: 'video/x-matroska', mov: 'video/quicktime', m4v: 'video/mp4', avi: 'video/x-msvideo', '3gp': 'video/3gpp', m4a: 'audio/mp4', flac: 'audio/flac', opus: 'audio/ogg', aac: 'audio/aac' };

function kindOf(file) {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  if (VIDEO_EXT.test(file.name)) return 'video';
  if (AUDIO_EXT.test(file.name)) return 'audio';
  return null;
}
function mimeOf(file, kind) {
  if (file.type) return file.type;
  const ext = (file.name.match(/\.([a-z0-9]+)$/i) || [])[1];
  return MIME_FALLBACK[(ext || '').toLowerCase()] || (kind + '/' + (ext || 'mpeg').toLowerCase());
}
const niceTitle = (name) => name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
const safeCode = (c) => String(c).replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 64);
const folderFor = (codes) => (codes.length === 1 ? 'groups/' + safeCode(codes[0]) + '/' : codes.length > 1 ? 'shared/…/' : '—');

export default function MediaPage() {
  const { t, toast, askConfirm, myGroups, currentGroupCode, user } = usePanel();
  const [items, setItems] = useState(null);
  const [preview, setPreview] = useState(null);   // { m, url }
  const openPreview = async (m) => {
    const r = await signMedia(m.id);
    if (!r.ok) { toast(r.error, 'err'); return; }
    setPreview({ m, url: r.url });
  };
  const [fGroup, setFGroup] = useState('all');
  const [fKind, setFKind] = useState('all');
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('library');
  const [view, setView] = useState(() => { try { return localStorage.getItem('mx-view') || 'grid'; } catch (e) { return 'grid'; } });
  const [folded, setFolded] = useState({});
  const [queued, setQueued] = useState(0);
  const pickView = (v) => { setView(v); try { localStorage.setItem('mx-view', v); } catch (e) { /* ignore */ } };
  const total = Array.isArray(items) ? items.length : null;

  const load = useCallback(async (opts) => {
    const silent = !!(opts && opts.silent);
    const { data, error } = await supabase.from('group_media')
      .select('id, kind, title, description, file_url, r2_key, size_bytes, duration_seconds, uploaded_by, created_at, group_media_targets(group_code)')
      .order('created_at', { ascending: false });
    if (error) {
      const missing = error.code === '42P01' || error.code === 'PGRST205' || /group_media/.test(error.message || '');
      setItems({ error: missing ? t('The media tables are not set up yet — run supabase/migrations/group_media.sql in Supabase.') : error.message });
      return;
    }
    setItems(data || []);
  }, [t]);
  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load);

  const codesOf = (m) => (m.group_media_targets || []).map((x) => x.group_code);

  const del = (m) => askConfirm(t('Delete'), t('This file will be deleted from all groups and from storage. Continue?'), async () => {
    const r = await deleteMedia(m.id);
    if (!r.ok) { toast(r.error, 'err'); return; }
    toast(t('File deleted.'), 'ok');
    load();
  });

  /* ---- library, split per group so one group's files never mix with another's ---- */
  const sections = useMemo(() => {
    if (!Array.isArray(items)) return [];
    const needle = q.trim().toLowerCase();
    return myGroups
      .filter((g) => fGroup === 'all' || g.code === fGroup)
      .map((g) => ({
        g,
        list: items.filter((m) => codesOf(m).includes(g.code)
          && (fKind === 'all' || m.kind === fKind)
          && (!needle || (m.title + ' ' + (m.description || '')).toLowerCase().includes(needle))),
      }))
      .filter((s) => s.list.length > 0 || fGroup !== 'all');
  }, [items, myGroups, fGroup, fKind, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const countFor = (code) => (Array.isArray(items) ? items.filter((m) => codesOf(m).includes(code)).length : 0);

  return (
    <section className="page active" id="page-media">
      <div className="page-head">
        <h2>{t('Media')}</h2>
      </div>

      <div className="mx-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'library'} className={'mx-tab' + (tab === 'library' ? ' on' : '')} onClick={() => setTab('library')}>
          <FolderIcon /><span>{t('Media library')}</span>{total != null && <em>{total}</em>}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'upload'} className={'mx-tab' + (tab === 'upload' ? ' on' : '')} onClick={() => setTab('upload')}>
          <UploadIcon /><span>{t('Upload studio')}</span>{queued > 0 && <em>{queued}</em>}
        </button>
      </div>

      <Studio hidden={tab !== 'upload'} onQueue={setQueued} onPublished={() => { load(); setTab('library'); }} />

      <div className="panel mx-library" hidden={tab !== 'library'}>
        <div className="mx-filters">
          <div className="mx-chips">
            <button type="button" className={'mx-fchip' + (fGroup === 'all' ? ' on' : '')} onClick={() => setFGroup('all')}>{t('All groups')}</button>
            {myGroups.map((g) => (
              <button type="button" key={g.code} className={'mx-fchip' + (fGroup === g.code ? ' on' : '')} onClick={() => setFGroup(g.code)}>
                {g.name}<span className="mx-fcount">{countFor(g.code)}</span>
              </button>
            ))}
          </div>
          <div className="mx-filter-row">
            <div className="mx-seg mx-seg-sm" role="tablist">
              {[['all', 'All'], ['video', 'Videos'], ['audio', 'Audio']].map(([k, l]) => (
                <button type="button" key={k} className={fKind === k ? 'on' : ''} onClick={() => setFKind(k)}>{t(l)}</button>
              ))}
            </div>
            <input className="mx-search" type="search" placeholder={t('Search by title…')} value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="mx-view" role="group">
              <button type="button" className={view === 'grid' ? 'on' : ''} aria-label="Grid" onClick={() => pickView('grid')}><GridIcon /></button>
              <button type="button" className={view === 'list' ? 'on' : ''} aria-label="List" onClick={() => pickView('list')}><ListIcon /></button>
            </div>
          </div>
        </div>

        {items === null ? <Loader inline label={t('Loading…')} />
          : items.error ? <div className="empty-block">{items.error}</div>
          : myGroups.length === 0 ? <div className="empty-block">{t('No group assigned')}</div>
          : sections.length === 0 ? <div className="empty-block">{t('Nothing here yet — drop a video or audio file above.')}</div>
          : sections.map(({ g, list }) => {
            const v = list.filter((m) => m.kind === 'video').length;
            return (
              <div className="mx-section" key={g.code}>
                <div className="mx-section-head" role="button" tabIndex={0} aria-expanded={!folded[g.code]}
                     onClick={() => setFolded((f) => ({ ...f, [g.code]: !f[g.code] }))}
                     onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFolded((f) => ({ ...f, [g.code]: !f[g.code] })); } }}>
                  <div className="mx-section-title"><span className={'mx-sec-chev' + (folded[g.code] ? ' shut' : '')}><ChevIcon /></span>{g.name}</div>
                  <div className="mx-section-meta">
                    <span>{v} {t('videos')}</span><span>{list.length - v} {t('audio')}</span>
                    <span className="mx-folder"><FolderIcon />groups/{safeCode(g.code)}/</span>
                  </div>
                </div>
                {folded[g.code] ? null : list.length === 0 ? <div className="mx-empty-line">{t('Nothing here yet — drop a video or audio file above.')}</div> : (
                  <div className={'mx-grid' + (view === 'list' ? ' as-list' : '')}>
                    {list.map((m, i) => {
                      const n = codesOf(m).length;
                      const mine = user && m.uploaded_by === user.id;
                      return (
                        <article className={'mx-card ' + m.kind} key={m.id} style={{ '--i': Math.min(i, 12) }}>
                          <button type="button" className="mx-thumb" onClick={() => openPreview(m)} aria-label={t('Play')}>
                            {m.kind === 'audio' && <span className="mx-wave">{WAVE.map((h, k) => <i key={k} style={{ height: h + '%', animationDelay: (k * 70) + 'ms' }} />)}</span>}
                            <span className="mx-play"><PlayIcon /></span>
                            <span className="mx-kind">{m.kind === 'video' ? <VideoIcon /> : <AudioIcon />}{t(m.kind === 'video' ? 'Video' : 'Audio')}</span>
                            {m.duration_seconds > 0 && <span className="mx-dur">{fmtClock(m.duration_seconds)}</span>}
                          </button>
                          <div className="mx-body">
                            <div className="mx-title" title={m.title}>{m.title}</div>
                            {m.description && <div className="mx-desc">{m.description}</div>}
                            <div className="mx-pills">
                              <span className="u-pill">{fmtBytes(m.size_bytes)}</span>
                              <span className="u-pill">{fmtDate(m.created_at)}</span>
                              {n > 1 && <span className="u-pill gold">{t('Also in other groups')} · {n}</span>}
                            </div>
                          </div>
                          <div className="mx-actions">
                            <button type="button" className="mx-ib play" title={t('Play')} aria-label={t('Play')} onClick={() => openPreview(m)}><PlayIcon /></button>
                            {mine && <button type="button" className="mx-ib danger" title={t('Delete')} aria-label={t('Delete')} onClick={() => del(m)}><TrashIcon /></button>}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
      </div>

      <Modal open={!!preview} onClose={() => setPreview(null)} wide>
        {preview && (
          <div className="mx-preview">
            <h3>{preview.m.title}</h3>
            {preview.m.kind === 'video'
              ? <video src={preview.url} controls autoPlay playsInline controlsList="nodownload noremoteplayback" disablePictureInPicture onContextMenu={(e) => e.preventDefault()} />
              : <audio src={preview.url} controls autoPlay controlsList="nodownload" onContextMenu={(e) => e.preventDefault()} />}
            {preview.m.description && <p className="hint">{preview.m.description}</p>}
            <p className="hint">{(preview.m.group_media_targets || []).map((x) => (myGroups.find((g) => g.code === x.group_code) || {}).name || x.group_code).join(' · ')}</p>
          </div>
        )}
      </Modal>
    </section>
  );
}

/* ------------------------------------------------------------------ upload studio -- */
function Studio({ onPublished, onQueue, hidden }) {
  const { t, toast, myGroups, currentGroupCode } = usePanel();
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);
  const [queue, setQueue] = useState([]);
  const [mode, setMode] = useState('selected'); // 'all' = every group of mine, 'selected' = the chips below
  const [picked, setPicked] = useState(() => (currentGroupCode ? [currentGroupCode] : []));
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef(null);
  const pendingCount = queue.filter((x) => x.status === 'ready' || x.status === 'error').length;
  useEffect(() => { onQueue(pendingCount); }, [pendingCount, onQueue]);

  useEffect(() => { if (picked.length === 0 && currentGroupCode) setPicked([currentGroupCode]); }, [currentGroupCode]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!busy) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

  const targets = mode === 'all' ? myGroups.map((g) => g.code) : picked.filter((c) => myGroups.some((g) => g.code === c));
  const patch = (id, p) => setQueue((qs) => qs.map((x) => (x.id === id ? { ...x, ...p } : x)));

  function addFiles(fileList) {
    const files = Array.from(fileList || []);
    const rejected = [];
    files.forEach((file) => {
      const kind = kindOf(file);
      if (!kind) { rejected.push(file.name); return; }
      const id = Date.now() + '-' + Math.random().toString(36).slice(2, 7);
      setQueue((qs) => [...qs, { id, file, kind, title: niceTitle(file.name), desc: '', duration: 0, progress: 0, status: 'ready', error: '' }]);
      probeDuration(file, kind).then((d) => patch(id, { duration: d }));
    });
    if (rejected.length) toast(t('Only video and audio files are allowed.') + ' ' + rejected.join(', '), 'err');
  }

  async function publish() {
    if (busy) return;
    if (targets.length === 0) { toast(t('Pick at least one group.'), 'err'); return; }
    const todo = queue.filter((x) => x.status === 'ready' || x.status === 'error');
    if (todo.length === 0) return;
    setBusy(true);
    const ctl = new AbortController(); cancelRef.current = ctl;
    let ok = 0;
    for (const it of todo) {
      if (ctl.signal.aborted) break;
      patch(it.id, { status: 'uploading', progress: 0, error: '' });
      const up = await uploadMedia({ file: it.file, kind: it.kind, groups: targets, contentType: mimeOf(it.file, it.kind), signal: ctl.signal, onProgress: (p) => patch(it.id, { progress: p }) });
      if (!up.ok) { patch(it.id, { status: 'error', error: up.error }); continue; }
      const { data: { user } } = await supabase.auth.getUser();
      const { data: row, error } = await supabase.from('group_media').insert({
        kind: it.kind, title: it.title.trim() || niceTitle(it.file.name), description: it.desc.trim(), file_url: '/f/' + up.key, r2_key: up.key,
        mime_type: mimeOf(it.file, it.kind), size_bytes: up.size, duration_seconds: it.duration || 0, uploaded_by: user.id,
      }).select('id').single();
      if (error) { patch(it.id, { status: 'error', error: error.message }); continue; }
      const { error: tErr } = await supabase.from('group_media_targets').insert(targets.map((code) => ({ media_id: row.id, group_code: code })));
      if (tErr) { await supabase.from('group_media').delete().eq('id', row.id); patch(it.id, { status: 'error', error: tErr.message }); continue; }
      patch(it.id, { status: 'done', progress: 1 });
      ok++;
    }
    cancelRef.current = null;
    setBusy(false);
    if (ok > 0) {
      toast(t('Published') + ': ' + ok, 'ok');
      onPublished();
      setTimeout(() => setQueue((qs) => qs.filter((x) => x.status !== 'done')), 1400);
    }
  }

  const toggle = (code) => setPicked((p) => (p.includes(code) ? p.filter((c) => c !== code) : [...p, code]));
  const pending = queue.filter((x) => x.status === 'ready' || x.status === 'error').length;

  return (
    <div className="panel mx-studio" hidden={hidden}>

      <div className={'mx-drop' + (drag ? ' over' : '')} role="button" tabIndex={0}
           onClick={() => inputRef.current && inputRef.current.click()}
           onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current.click(); } }}
           onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
           onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}>
        <span className="mx-drop-ico"><UploadIcon /></span>
        <div className="mx-drop-txt">
          <div className="mx-drop-t">{t('Drop videos or audio here')}</div>
          <div className="mx-drop-s">{t('or tap to choose from your phone or computer · up to 4 GB each')}</div>
        </div>
        <input ref={inputRef} type="file" multiple accept="video/*,audio/*,.mkv,.m4a,.opus,.flac" hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      </div>

      {queue.length > 0 && (
        <div className="mx-queue">
          {queue.map((it) => (
            <div className={'mx-q ' + it.status} key={it.id}>
              <span className={'mx-q-ico ' + it.kind}>{it.kind === 'video' ? <VideoIcon /> : <AudioIcon />}</span>
              <div className="mx-q-main">
                <input className="mx-q-title" value={it.title} disabled={it.status === 'uploading' || it.status === 'done'} placeholder={t('Title')} onChange={(e) => patch(it.id, { title: e.target.value })} />
                <input className="mx-q-desc" value={it.desc} disabled={it.status === 'uploading' || it.status === 'done'} placeholder={t('Description (optional)')} onChange={(e) => patch(it.id, { desc: e.target.value })} />
                <div className="mx-q-meta">{fmtBytes(it.file.size)}{it.duration > 0 && ' · ' + fmtClock(it.duration)}{it.status === 'error' && <b className="mx-err"> · {it.error}</b>}</div>
                {(it.status === 'uploading' || it.status === 'done') && (
                  <div className="mx-bar"><span style={{ width: Math.round(it.progress * 100) + '%' }} /><em>{it.status === 'done' ? t('Done') : Math.round(it.progress * 100) + '%'}</em></div>
                )}
              </div>
              {it.status === 'done' ? <span className="mx-q-ok"><CheckIcon /></span>
                : <button type="button" className="mx-q-x" disabled={it.status === 'uploading'} aria-label={t('Remove')} onClick={() => setQueue((qs) => qs.filter((x) => x.id !== it.id))}><CloseIcon /></button>}
            </div>
          ))}
        </div>
      )}

      <div className="mx-audience">
        <div className="mx-aud-label">{t('Who should get this?')}</div>
        <div className="mx-seg" role="tablist">
          <button type="button" className={mode === 'selected' ? 'on' : ''} onClick={() => setMode('selected')}>{t('Selected groups')}</button>
          <button type="button" className={mode === 'all' ? 'on' : ''} onClick={() => setMode('all')}>{t('All my groups')} · {myGroups.length}</button>
        </div>
        {mode === 'selected' && (
          <div className="mx-pick">
            {myGroups.length === 0 && <div className="mx-empty-line">{t('No group assigned')}</div>}
            {myGroups.map((g) => {
              const on = picked.includes(g.code);
              return (
                <button type="button" key={g.code} className={'mx-pchip' + (on ? ' on' : '')} aria-pressed={on} onClick={() => toggle(g.code)}>
                  <span className="mx-box">{on && <CheckIcon />}</span>{g.name}
                </button>
              );
            })}
          </div>
        )}
        <div className="mx-hint"><FolderIcon />{t('Stored in')} <code>{folderFor(targets)}</code> · {targets.length} {t('group(s)')}</div>
      </div>

      <div className="mx-foot">
        {busy && <button type="button" className="btn btn-ghost" onClick={() => cancelRef.current && cancelRef.current.abort()}>{t('Cancel')}</button>}
        <button type="button" className="btn btn-gold mx-publish" disabled={busy || pending === 0 || targets.length === 0} onClick={publish}>
          {busy ? t('Uploading…') : t('Publish') + (pending ? ' · ' + pending : '')}
        </button>
      </div>
    </div>
  );
}
