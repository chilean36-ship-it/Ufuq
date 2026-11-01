import { useEffect, useMemo, useState } from 'react';
import useLiveRefresh from '../../../lib/liveRefresh';
import { useCabinetI18n } from '../../../context/CabinetI18nContext';
import { supabase } from '../../../lib/supabaseClient';
import { useDashboardData } from '../../../context/DashboardDataContext';
import { signMedia } from '../../../lib/mediaUpload';
import Loader from '../../../components/Loader';

import { fmtDate } from '../../../lib/dateLocale';
const NEW_MS = 14 * 24 * 3600 * 1000;
const clock = (s) => { s = Math.max(0, parseInt(s, 10) || 0); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(r).padStart(2, '0'); };
const WAVE = [30, 55, 80, 45, 95, 60, 35, 75, 50, 88, 40, 66, 28, 72, 52, 84, 38, 62];

/** Videos / audio the teacher published to this student's group (public.group_media + group_media_targets). */
export default function MediaTab({ groupCode, active }) {
  const { t, lang } = useCabinetI18n();
  const { user, name } = useDashboardData();
  const [items, setItems] = useState(null);
  const [kind, setKind] = useState('all');
  const [open, setOpen] = useState(null);   // { m, url }
  const [err, setErr] = useState('');
  const play = async (m) => {
    setErr('');
    const r = await signMedia(m.id);
    if (!r.ok) { setErr(t('Could not open this file. Please try again.')); return; }
    setOpen({ m, url: r.url });
  };
  // Visible watermark (name + short id) drifts over the video: screen recordings stay traceable to the account.
  const mark = ((name || '') + ' · ' + String((user && user.id) || '').slice(0, 8)).trim();

  const loadItems = async (silent) => {
    if (!groupCode) { setItems([]); return null; }
    const { data, error } = await supabase.from('group_media')
      .select('id, kind, title, description, duration_seconds, created_at, group_media_targets!inner(group_code)')
      .eq('group_media_targets.group_code', groupCode)
      .order('created_at', { ascending: false });
    if (error) return silent ? null : [];
    return data || [];
  };
  useEffect(() => {
    if (!active) return undefined;
    let off = false;
    (async () => { const rows = await loadItems(false); if (!off && rows) setItems(rows); })();
    return () => { off = true; };
  }, [active, groupCode]); // eslint-disable-line react-hooks/exhaustive-deps
  // Silent 5-second refresh while this tab is the one on screen.
  useLiveRefresh(async () => { if (!active) return; const rows = await loadItems(true); if (rows) setItems(rows); });

  useEffect(() => {
    if (!open) return undefined;
    const k = (e) => { if (e.key === 'Escape') setOpen(null); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [open]);

  const shown = useMemo(() => (items || []).filter((m) => kind === 'all' || m.kind === kind), [items, kind]);

  return (
    <>
      <div className="mdx-seg" role="tablist">
        {[['all', 'All'], ['video', 'Videos'], ['audio', 'Audio']].map(([k, l]) => (
          <button type="button" key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{t(l)}</button>
        ))}
      </div>
      {err && <div className="empty-state">{err}</div>}
      {items === null ? <Loader inline label={t('Loading…')} />
        : shown.length === 0 ? <div className="empty-state">{t('Your teacher has not shared any videos or audio yet.')}</div>
        : (
          <div className="mdx-grid">
            {shown.map((m, i) => {
              const isNew = Date.now() - Date.parse(m.created_at) < NEW_MS;
              return (
                <button type="button" className={'mdx-card ' + m.kind} key={m.id} style={{ '--i': Math.min(i, 12) }} onClick={() => play(m)}>
                  <span className="mdx-thumb">
                    {m.kind === 'audio' && <span className="mdx-wave">{WAVE.map((h, j) => <i key={j} style={{ height: h + '%', animationDelay: (j * 70) + 'ms' }} />)}</span>}
                    <span className="mdx-play"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg></span>
                    <span className="mdx-kind">{t(m.kind === 'video' ? 'Video' : 'Audio')}</span>
                    {isNew && <span className="mdx-new">{t('New')}</span>}
                    {m.duration_seconds > 0 && <span className="mdx-dur">{clock(m.duration_seconds)}</span>}
                  </span>
                  <span className="mdx-body">
                    <span className="mdx-title">{m.title}</span>
                    {m.description && <span className="mdx-desc">{m.description}</span>}
                    <span className="mdx-date">{fmtDate(m.created_at, lang, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      {open && (
        <div className="mdx-overlay" onClick={(e) => { if (e.target === e.currentTarget) setOpen(null); }}>
          <div className="mdx-modal">
            <button type="button" className="mdx-close" aria-label={t('Close')} onClick={() => setOpen(null)}>&times;</button>
            {open.m.kind === 'video' ? (
              <div className="mdx-vwrap" onContextMenu={(e) => e.preventDefault()}>
                <video src={open.url} controls autoPlay playsInline controlsList="nodownload noremoteplayback" disablePictureInPicture />
                <span className="mdx-mark a">{mark}</span><span className="mdx-mark b">{mark}</span>
              </div>
            ) : <audio src={open.url} controls autoPlay controlsList="nodownload" onContextMenu={(e) => e.preventDefault()} />}
            <h3>{open.m.title}</h3>
            {open.m.description && <p>{open.m.description}</p>}
          </div>
        </div>
      )}
    </>
  );
}
