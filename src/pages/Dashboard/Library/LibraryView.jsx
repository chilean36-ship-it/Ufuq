import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useLiveRefresh from '../../../lib/liveRefresh';
import { useCabinetI18n } from '../../../context/CabinetI18nContext';
import { useDashboardData } from '../../../context/DashboardDataContext';
import { getAudioLessons, getBoardPhotos, getMyList, toggleMyListAudio, getSavedPhotoRefs, toggleSavedPhoto, fmtClock } from './libraryData';
import AudioPlayer from './AudioPlayer';
import MediaTab from './MediaTab';
import './library-audio.css';
import Loader from '../../../components/Loader';
import ZoomPan from '../../../components/ZoomPan';

const WAVE_HEIGHTS = [22, 40, 62, 34, 78, 48, 90, 56, 30, 70, 44, 84, 38, 60, 26, 52, 74, 36, 64, 28, 46, 80, 32, 58];
/** Deterministic little waveform illustration per card, purely decorative. */
function waveformBars(seed) {
  const rot = seed % WAVE_HEIGHTS.length;
  return WAVE_HEIGHTS.slice(rot).concat(WAVE_HEIGHTS.slice(0, rot));
}

const STAR_ICON = (
  <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" /></svg>
);
const STAR_OUTLINE = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" /></svg>
);
const NOTE_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
);
const IMAGE_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="M21 15l-5-5L5 21" /></svg>
);
const TRASH_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" /></svg>
);

const NEW_WINDOW_MS = 14 * 24 * 3600 * 1000; // an upload counts as "New" for two weeks

const BROKEN_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="M21 15l-5-5L5 21" /></svg>
);

/** One board photo tile; steps through the photo's candidate URLs before showing the "unavailable" placeholder. */
function PhotoCard({ photo, onOpen, saved, onToggleSave, index }) {
  const { t } = useCabinetI18n();
  const [idx, setIdx] = useState(0);
  const [broken, setBroken] = useState(false);
  const onError = () => {
    if (idx + 1 < photo.urls.length) setIdx(idx + 1); else setBroken(true);
  };
  return (
    <div className={'photo-card' + (broken ? ' photo-broken' : '')} data-photo-id={photo.id} style={{ '--i': Math.min(index, 14) }} onClick={() => { if (!broken) onOpen(photo); }}>
      {broken ? (
        <div className="photo-broken-fallback">{BROKEN_ICON}<span>{t('Photo unavailable')}</span></div>
      ) : (
        <img src={photo.urls[idx]} alt={photo.caption || t('Board photo')} loading="lazy" onError={onError} />
      )}
      {!broken && (
        <button type="button" className={'photo-save-btn' + (saved ? ' saved' : '')} aria-pressed={saved} aria-label={t(saved ? 'Saved' : 'Save')} onClick={(e) => { e.stopPropagation(); onToggleSave(photo); }}>
          {saved ? STAR_ICON : STAR_OUTLINE}
        </button>
      )}
      <span className="photo-zoom-hint"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3M11 8v6M8 11h6" /></svg></span>
      {photo.caption ? <div className="photo-card-caption">{photo.caption}</div> : null}
    </div>
  );
}

function PhotoLightbox({ photo, onClose, saved, onToggleSave }) {
  const { t } = useCabinetI18n();
  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [photo]);
  useEffect(() => {
    if (!photo) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [photo, onClose]);
  const open = !!photo;
  return (
    <div className={'photo-lightbox' + (open ? ' open' : '')} id="photoLightbox" aria-hidden={open ? 'false' : 'true'} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="photo-lightbox-inner">
        <button type="button" className="photo-lightbox-close" id="photoLightboxClose" aria-label={t('Close')} onClick={onClose}>&times;</button>
        {open && (
          <div className="photo-zoomwrap">
            <ZoomPan src={photo.urls[idx]} onError={() => { if (idx + 1 < photo.urls.length) setIdx(idx + 1); }} />
          </div>
        )}
        <div className="photo-lightbox-caption" id="photoLightboxCaption">{open ? (photo.caption ? `${photo.caption} · ${photo.date}` : photo.date) : ''}</div>
        {open && (
          <button type="button" className={'list-save-btn photo-lightbox-save' + (saved ? ' saved' : '')} onClick={() => onToggleSave(photo)}>
            {saved ? <>★<span> {t('Saved')}</span></> : <>☆<span> {t('Save')}</span></>}
          </button>
        )}
      </div>
    </div>
  );
}

const AUTONEXT_KEY = 'ufuq-audio-autonext';
const QUEUE_ICON = (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h12M4 12h12M4 18h8" /><path d="M18 14l4 3-4 3z" fill="currentColor" /></svg>);

function AudioLightbox({ lesson, queue, onSelect, onClose, saved, onToggleSave }) {
  const { t } = useCabinetI18n();
  const open = !!lesson;
  const [qOpen, setQOpen] = useState(false);
  const [autoNext, setAutoNextRaw] = useState(() => { try { return localStorage.getItem(AUTONEXT_KEY) !== '0'; } catch (e) { return true; } });
  const setAutoNext = (v) => { setAutoNextRaw(v); try { localStorage.setItem(AUTONEXT_KEY, v ? '1' : '0'); } catch (e) { /* ignore */ } };
  const listRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  useEffect(() => { if (!open) setQOpen(false); }, [open]);

  const q = queue && queue.length ? queue : (lesson ? [lesson] : []);
  const idx = lesson ? q.findIndex((x) => x.id === lesson.id) : -1;
  const prev = idx > 0 ? q[idx - 1] : null;
  const next = idx >= 0 && idx < q.length - 1 ? q[idx + 1] : null;
  const queueApi = useMemo(() => (lesson && q.length > 1 ? {
    hasPrev: !!prev, hasNext: !!next, prevTitle: prev ? prev.title : '', nextTitle: next ? next.title : '',
    onPrev: () => prev && onSelect(prev), onNext: () => next && onSelect(next), autoNext, setAutoNext,
  } : null), [lesson, prev, next, autoNext, q.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!qOpen || !listRef.current) return;
    const cur = listRef.current.querySelector('.apx-q-item.on');
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
  }, [qOpen, lesson]);

  return (
    <div className={'apx-lb' + (open ? ' open' : '')} id="audioLightbox" role="dialog" aria-modal="true" aria-hidden={open ? 'false' : 'true'} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="apx-card">
        <span className="apx-card-aurora" aria-hidden="true" />
        <header className="apx-card-top">
          <span className="apx-kicker"><i />{t('Audio lesson')}{open && lesson.date ? ` · ${lesson.date}` : ''}{open && q.length > 1 ? ` · ${idx + 1}/${q.length}` : ''}</span>
          <span className="apx-top-actions">
            {open && (
              <button type="button" className={'apx-close apx-top-btn' + (saved ? ' on' : '')} aria-pressed={saved} aria-label={t(saved ? 'Saved' : 'Save')} title={t(saved ? 'Saved' : 'Save')} onClick={(e) => onToggleSave(e, lesson)}>
                {saved ? STAR_ICON : STAR_OUTLINE}
              </button>
            )}
            {q.length > 1 && (
              <button type="button" className={'apx-close apx-top-btn apx-qbtn' + (qOpen ? ' on' : '')} aria-expanded={qOpen} aria-label={t('Up next')} title={t('Up next')} onClick={() => setQOpen((v) => !v)}>
                {QUEUE_ICON}<em>{q.length}</em>
              </button>
            )}
            <button type="button" className="apx-close" id="audioLightboxClose" aria-label={t('Close')} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </span>
        </header>
        <div className="apx-card-title">
          <h3 id="audioLightboxTitle">{open ? lesson.title : t('Audio lesson')}</h3>
          <p id="audioLightboxDesc">{open ? (lesson.desc || t('Recorded lesson audio.')) : t('Recorded lesson audio.')}</p>
        </div>
        <div id="audioLightboxPlayer">{open && <AudioPlayer key={lesson.id} lesson={lesson} autoPlay queueApi={queueApi} />}</div>
        {qOpen && q.length > 1 && (
          <div className="apx-queue" ref={listRef}>
            <div className="apx-queue-head">{t('Up next')}<em>{q.length}</em></div>
            <ul>
              {q.map((x, i) => (
                <li key={x.id}>
                  <button type="button" className={'apx-q-item' + (lesson && x.id === lesson.id ? ' on' : '')} onClick={() => onSelect(x)} aria-current={lesson && x.id === lesson.id ? 'true' : undefined}>
                    <span className="apx-q-num">{lesson && x.id === lesson.id ? <i className="apx-q-eq"><b /><b /><b /></i> : i + 1}</span>
                    <span className="apx-q-title">{x.title}</span>
                    <span className="apx-q-dur">{x.durationSeconds > 0 ? x.duration : ''}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Audio Lessons panel: search, filters, sort, grid/list, featured latest lesson, "heard" marks ---------- */
const HEARD_PREFIX = 'ufuq-audio-heard:';
function readHeard(uid) {
  try { return new Set(JSON.parse(localStorage.getItem(HEARD_PREFIX + (uid || 'anon')) || '[]')); } catch (e) { return new Set(); }
}
function writeHeard(uid, set) {
  try { localStorage.setItem(HEARD_PREFIX + (uid || 'anon'), JSON.stringify([...set].slice(-500))); } catch (e) { /* storage blocked */ }
}
const isFreshLesson = (a) => !!a.ts && Date.now() - a.ts < NEW_WINDOW_MS;
const SEARCH_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
);
const PLAY_ICON = (<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>);
const CHECK_ICON = (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>);

/* One lesson card — shared by the Audio Lessons grid and the saved List, so both look and behave identically. */
function LessonCard({ a, i, isNew, isHeard, isCurrent, resume, onPlay, renderSave }) {
  const { t } = useCabinetI18n();
  const moveFocus = (e, dir) => {
    e.preventDefault();
    const parent = e.currentTarget.parentElement;
    const cards = parent ? Array.from(parent.querySelectorAll(':scope > .lx-card')) : [];
    const next = cards[cards.indexOf(e.currentTarget) + dir];
    if (next) { next.focus(); next.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  };
  return (
      <article className={'lx-card' + (isCurrent ? ' is-current' : '') + (isHeard ? ' is-heard' : '')} data-audio-id={a.id} style={{ '--i': Math.min(i, 12) }} onClick={() => onPlay(a)}
           onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); e.currentTarget.style.setProperty('--mx', (e.clientX - r.left) + 'px'); e.currentTarget.style.setProperty('--my', (e.clientY - r.top) + 'px'); }}
           role="button" tabIndex={0} aria-label={t('Play') + ': ' + a.title} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPlay(a); } else if (e.key === 'ArrowDown') moveFocus(e, 1); else if (e.key === 'ArrowUp') moveFocus(e, -1); }}>
        <span className="lx-index" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
        <span className="lx-orb" aria-hidden="true">
          <span className="lx-orb-ring" />
          {isCurrent ? <i className="lx-eq"><b /><b /><b /></i> : PLAY_ICON}
        </span>
        <div className="lx-main">
          <div className="lx-top">
            <span className="lx-date">{a.date}</span>
            {isNew && <span className="lx-badge-new">{t('New')}</span>}
            {isCurrent && <span className="lx-badge-last">{t('Last played')}</span>}
            {isHeard && <span className="lx-heard" title={t('Listened')}>{CHECK_ICON}<span>{t('Listened')}</span></span>}
          </div>
          <h3 className="lx-title">{a.title}</h3>
          {a.desc ? <p className="lx-desc">{a.desc}</p> : null}
          {resume && resume.ratio < 0.97 && (
            <div className="lx-resume" title={t('Continue') + ' ' + fmtClock(resume.sec)}>
              <span className="lx-resume-bar"><em style={{ width: Math.round(resume.ratio * 100) + '%' }} /></span>
              <span className="lx-resume-txt">{t('Continue')} · {fmtClock(resume.sec)}</span>
            </div>
          )}
          <div className="lx-wave" aria-hidden="true">
            {waveformBars(i).map((h, j) => <i key={j} style={{ height: h + '%', animationDelay: (j % 9) * 70 + 'ms' }} />)}
          </div>
        </div>
        <div className="lx-side">
          {a.durationSeconds > 0 && <span className="lx-duration">{a.duration}</span>}
          <span className="lx-save" onClick={(e) => e.stopPropagation()}>{renderSave(a)}</span>
        </div>
      </article>
  );
}

/** Resume positions the player already stores per lesson (ufuq.audioPos.<id>) → progress bar on each card. */
function buildResumeMap(items) {
  const m = {};
  items.forEach((a) => {
    try {
      const sec = parseInt(localStorage.getItem('ufuq.audioPos.' + a.id), 10);
      if (isFinite(sec) && sec > 0 && a.durationSeconds > 0) m[a.id] = { sec, ratio: Math.min(1, sec / a.durationSeconds) };
    } catch (e) { /* storage blocked */ }
  });
  return m;
}

/** Saved audio: the very same card grid and the very same player window as the Audio Lessons tab. */
function SavedAudioList({ items, savedIds, heard, lastId, onPlay, onToggleSave, orphans, onRemoveOrphan }) {
  const { t } = useCabinetI18n();
  const resumeMap = useMemo(() => buildResumeMap(items), [items, lastId, heard]); // eslint-disable-line react-hooks/exhaustive-deps
  const play = (a) => onPlay(a, items);
  const renderSave = (a) => {
    const saved = savedIds.has(a.id);
    return (
      <button type="button" className={'list-save-btn' + (saved ? ' saved' : '')} data-save-audio={a.id} aria-pressed={saved} title={t(saved ? 'Saved' : 'Save')} onClick={(e) => onToggleSave(e, a)}>
        {saved ? <>★<span> {t('Saved')}</span></> : <>☆<span> {t('Save')}</span></>}
      </button>
    );
  };
  return (
    <div className="lax">
      <div className="audio-grid lax-grid" id="savedAudioGrid">
        {items.map((a, i) => (
          <LessonCard key={a.id} a={a} i={i} isNew={isFreshLesson(a) && !heard.has(a.id)} isHeard={heard.has(a.id)} isCurrent={lastId === a.id}
                      resume={resumeMap[a.id]} onPlay={play} renderSave={renderSave} />
        ))}
      </div>
      {orphans.map((item) => (
        <div className="list-item-block" key={item.id}>
          <div className="list-item-row">
            <div className="list-item-thumb">{NOTE_ICON}</div>
            <div className="list-item-info"><div className="list-item-title">{item.title}</div><div className="list-item-sub">{t(item.sub)}</div></div>
            <button type="button" className="list-item-remove" aria-label={t('Remove')} onClick={() => onRemoveOrphan(item.id)}>{TRASH_ICON}</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function AudioLessonsPanel({ audio, savedIds, heard, onPlay, onToggleSave, lastId }) {
  const { t } = useCabinetI18n();
  const [q, setQ] = useState('');
  const searchRef = useRef(null);

  // "/" focuses the search box (unless the student is typing somewhere else)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag) || (document.activeElement && document.activeElement.isContentEditable)) return;
      if (!searchRef.current || searchRef.current.offsetParent === null) return;
      e.preventDefault(); searchRef.current.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return audio.slice();
    return audio.filter((a) => (a.title + ' ' + (a.desc || '')).toLowerCase().includes(needle));
  }, [audio, q]);

  const resumeMap = useMemo(() => buildResumeMap(audio), [audio, lastId, heard]); // eslint-disable-line react-hooks/exhaustive-deps

  const pristine = !q.trim();
  const featured = pristine && audio.length > 2 ? audio[0] : null;
  const gridItems = featured ? shown.filter((a) => a.id !== featured.id) : shown;
  const queueOrder = featured ? [featured, ...gridItems] : shown;
  const play = (a) => onPlay(a, queueOrder);
  const clearAll = () => { setQ(''); };

  const renderSave = (a) => {
    const saved = savedIds.has(a.id);
    return (
      <button type="button" className={'list-save-btn' + (saved ? ' saved' : '')} data-save-audio={a.id} aria-pressed={saved} title={t(saved ? 'Saved' : 'Save')} onClick={(e) => onToggleSave(e, a)}>
        {saved ? <>★<span> {t('Saved')}</span></> : <>☆<span> {t('Save')}</span></>}
      </button>
    );
  };

  return (
    <div className="lax">
      {featured && (
        <div className="lax-hero" role="button" tabIndex={0} onClick={() => play(featured)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); play(featured); } }}>
          <div className="lax-hero-bars" aria-hidden="true">{waveformBars(3).concat(waveformBars(11)).map((h, j) => <i key={j} style={{ height: h + '%', animationDelay: (j % 12) * 90 + 'ms' }} />)}</div>
          <div className="lax-hero-body">
            <span className="lax-hero-kicker">{t('Latest lesson')}{isFreshLesson(featured) && <em>{t('New')}</em>}</span>
            <h2>{featured.title}</h2>
            {featured.desc ? <p>{featured.desc}</p> : null}
            <div className="lax-hero-meta">
              <span>{featured.date}</span>
              {featured.durationSeconds > 0 && <><span className="dot-sep">·</span><span>{featured.duration}</span></>}
              {heard.has(featured.id) && <span className="lax-heard">{CHECK_ICON}{t('Listened')}</span>}
            </div>
          </div>
          <div className="lax-hero-actions">
            <button type="button" className="lax-hero-play" aria-label={t('Play') + ': ' + featured.title} onClick={(e) => { e.stopPropagation(); play(featured); }}>{PLAY_ICON}</button>
            {renderSave(featured)}
          </div>
        </div>
      )}

      <div className="lax-toolbar">
        <label className="lax-search">
          {SEARCH_ICON}
          <input ref={searchRef} type="search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { setQ(''); e.currentTarget.blur(); } }} placeholder={t('Search lessons…')} aria-label={t('Search lessons…')} />
          {q ? <button type="button" className="lax-search-x" aria-label={t('Clear')} onClick={() => { setQ(''); searchRef.current && searchRef.current.focus(); }}>×</button> : <kbd>/</kbd>}
        </label>
      </div>

      {shown.length === 0 ? (
        <div className="lax-empty">
          <span>{SEARCH_ICON}</span>
          <p>{t('No lessons match your filters.')}</p>
          <button type="button" onClick={clearAll}>{t('Clear filters')}</button>
        </div>
      ) : (
        <div className="audio-grid lax-grid" id="audioLessonsGrid">
          {gridItems.map((a, i) => {
            const isNew = isFreshLesson(a) && (!heard.has(a.id));
            const isHeard = heard.has(a.id);
            const isCurrent = lastId === a.id;
            const resume = resumeMap[a.id];
            return (
              <LessonCard key={a.id} a={a} i={i} isNew={isNew} isHeard={isHeard} isCurrent={isCurrent} resume={resume} onPlay={play} renderSave={renderSave} />
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Library page — port of `<section id="libraryView">` (Audio Lessons / Board Photos / List) + its JS. */
export default function LibraryView() {
  const { t } = useCabinetI18n();
  const { user, groupCode, groupReady } = useDashboardData();
  const userId = user && user.id;
  const [tab, setTab] = useState('audio');
  const [audio, setAudio] = useState(null);   // null = loading
  const [photos, setPhotos] = useState(null);
  const [list, setList] = useState(null);           // saved AUDIO (public.saved_lessons)
  const [photoRefs, setPhotoRefs] = useState(null);   // saved PHOTOS (public.saved_photos) — separate on purpose
  const [listTab, setListTab] = useState('audio');    // audio | photos inside the List tab
  const [confirmDel, setConfirmDel] = useState(null); // 'audio:<id>' | 'photo:<id>' awaiting "are you sure?"
  const [playing, setPlayingRaw] = useState(null);
  const [heard, setHeard] = useState(() => readHeard(null));
  const [lastId, setLastId] = useState(null);
  useEffect(() => { setHeard(readHeard(userId)); }, [userId]);
  const [queue, setQueue] = useState([]);
  const setPlaying = useCallback((lesson, q) => {
    setPlayingRaw(lesson);
    if (lesson && q) setQueue(q);
    if (lesson) {
      setLastId(lesson.id);
      setHeard((prev) => { if (prev.has(lesson.id)) return prev; const next = new Set(prev); next.add(lesson.id); writeHeard(userId, next); return next; });
    }
  }, [userId]);
  const [zoomed, setZoomed] = useState(null);

  const loadPhotos = useCallback(async () => { setPhotos(await getBoardPhotos(groupCode)); }, [groupCode]);
  const loadList = useCallback(async () => { setList(await getMyList(userId)); }, [userId]);
  const loadPhotoRefs = useCallback(async () => { setPhotoRefs(await getSavedPhotoRefs(userId)); }, [userId]);

  // Original showLibraryView(): (re)load all three panels every time the page is opened.
  useEffect(() => {
    if (!groupReady) return undefined;
    let cancelled = false;
    (async () => {
      const [a, p, l, pr] = await Promise.all([getAudioLessons(groupCode), getBoardPhotos(groupCode), getMyList(userId), getSavedPhotoRefs(userId)]);
      if (cancelled) return;
      setAudio(a); setPhotos(p); setList(l); setPhotoRefs(pr);
    })();
    return () => { cancelled = true; };
  }, [groupReady, groupCode, userId]);

  // Silent 5-second refresh: lessons and board photos the teacher adds appear without a manual reload.
  useLiveRefresh(async () => {
    if (!groupReady) return;
    const [a, p] = await Promise.all([getAudioLessons(groupCode), getBoardPhotos(groupCode)]);
    setAudio(a); setPhotos(p);
  });

  const switchTab = (next) => {
    setTab(next);
    if (next === 'photos') loadPhotos(); // original re-fetches photos on every switch to that tab
  };

  const savedIds = new Set((list || []).map((x) => x.audioId));
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);
  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3200);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  const pendingRef = useRef(new Set()); // ids with a request in flight — ignores double taps

  // Optimistic: the star flips at once; if Supabase refuses, it flips back and tells the student.
  const toggleSave = async (e, lessonItem) => {
    e.stopPropagation();
    if (!userId) { showToast(t('Could not save. Please sign in again.')); return; }
    if (pendingRef.current.has(lessonItem.id)) return;
    const willSave = !savedIds.has(lessonItem.id);
    pendingRef.current.add(lessonItem.id);
    const before = list || [];
    setList(willSave
      ? [{ id: lessonItem.id, audioId: lessonItem.id, savedAt: new Date().toISOString(), title: lessonItem.title, sub: 'Audio lesson · saved', lesson: lessonItem }, ...before.filter((x) => x.audioId !== lessonItem.id)]
      : before.filter((x) => x.audioId !== lessonItem.id));
    const ok = await toggleMyListAudio(userId, lessonItem.id, willSave);
    pendingRef.current.delete(lessonItem.id);
    if (!ok) { setList(before); showToast(t('Could not save. Check your connection and try again.')); return; }
    loadList(); // quiet re-sync with the server's copy
  };
  const removeFromList = async (id) => {
    setConfirmDel(null);
    const before = list || [];
    setList(before.filter((x) => x.id !== id)); // optimistic
    const ok = await toggleMyListAudio(userId, id, false);
    if (!ok) { setList(before); showToast(t('Could not remove. Please try again.')); return; }
    loadList();
  };

  const savedPhotoIds = new Set((photoRefs || []).map((r) => r.photoId));
  const togglePhotoSave = async (photo) => {
    if (!userId) { showToast(t('Could not save. Please sign in again.')); return; }
    const willSave = !savedPhotoIds.has(photo.id);
    const before = photoRefs || [];
    setPhotoRefs(willSave ? [{ photoId: photo.id, savedAt: new Date().toISOString() }, ...before] : before.filter((r) => r.photoId !== photo.id)); // optimistic
    const ok = await toggleSavedPhoto(userId, photo.id, willSave);
    if (!ok) { setPhotoRefs(before); showToast(t('Could not save. Check your connection and try again.')); return; }
    loadPhotoRefs();
  };
  const removePhotoFromList = async (photo) => {
    setConfirmDel(null);
    await togglePhotoSave(photo);
  };

  const savedPhotos = (photoRefs || []).map((r) => (photos || []).find((p) => p.id === r.photoId)).filter(Boolean);
  const audioById = new Map((audio || []).map((a) => [a.id, a]));
  const savedLessons = (list || []).map((item) => audioById.get(item.audioId) || item.lesson).filter(Boolean);
  const orphanItems = (list || []).filter((item) => !(audioById.get(item.audioId) || item.lesson));

  return (
    <section id="libraryView">
      <div className="inner-page-head">
        <div>
          <h1>{t('Library')}</h1>
          <p>{t("Recordings of your lessons and the items you've saved for later.")}</p>
        </div>
      </div>
      <div className="lib-tabs">
        <button type="button" className={'lib-tab' + (tab === 'audio' ? ' active' : '')} onClick={() => switchTab('audio')}>{t('Audio Lessons')}</button>
        <button type="button" className={'lib-tab' + (tab === 'photos' ? ' active' : '')} onClick={() => switchTab('photos')}>{t('Board Photos')}</button>
        <button type="button" className={'lib-tab' + (tab === 'media' ? ' active' : '')} onClick={() => switchTab('media')}>{t('Videos')}</button>
        <button type="button" className={'lib-tab' + (tab === 'list' ? ' active' : '')} onClick={() => switchTab('list')}>{t('List')}</button>
      </div>

      <div className={'lib-panel' + (tab === 'audio' ? ' active' : '')} id="libAudioPanel">
        {audio === null ? (
          <div className="audio-grid" id="audioLessonsGrid"><Loader inline label={t('Loading…')} /></div>
        ) : audio.length === 0 ? (
          <div className="audio-grid" id="audioLessonsGrid"><div className="empty-state">{t('No recorded lessons yet. Check back after your next class.')}</div></div>
        ) : (
          <AudioLessonsPanel audio={audio} savedIds={savedIds} heard={heard} lastId={lastId} onPlay={setPlaying} onToggleSave={toggleSave} />
        )}
      </div>

      <div className={'lib-panel' + (tab === 'photos' ? ' active' : '')} id="libPhotosPanel">
        <div className="photo-grid" id="boardPhotosGrid">
          {photos === null ? (
            <Loader inline label={t('Loading…')} />
          ) : photos.length === 0 ? (
            <div className="empty-state">{t('No board photos yet. Check back after your next class.')}</div>
          ) : photos.map((p, i) => (
            <PhotoCard key={p.id} photo={p} index={i} onOpen={setZoomed} saved={savedPhotoIds.has(p.id)} onToggleSave={togglePhotoSave} />
          ))}
        </div>
      </div>

      <div className={'lib-panel' + (tab === 'media' ? ' active' : '')} id="libMediaPanel">
        <MediaTab groupCode={groupCode} active={tab === 'media'} />
      </div>

      <div className={'lib-panel' + (tab === 'list' ? ' active' : '')} id="libListPanel">
        {/* Audio and photos are kept in two separate lists so they never get mixed up. */}
        <div className="list-seg" role="tablist">
          <button type="button" role="tab" aria-selected={listTab === 'audio'} className={'list-seg-btn' + (listTab === 'audio' ? ' active' : '')} onClick={() => { setListTab('audio'); setConfirmDel(null); }}>
            {NOTE_ICON}<span>{t('Audio')}</span><em>{list ? list.length : 0}</em>
          </button>
          <button type="button" role="tab" aria-selected={listTab === 'photos'} className={'list-seg-btn' + (listTab === 'photos' ? ' active' : '')} onClick={() => { setListTab('photos'); setConfirmDel(null); }}>
            {IMAGE_ICON}<span>{t('Board Photos')}</span><em>{savedPhotos.length}</em>
          </button>
        </div>

        {listTab === 'audio' && (
          <div id="myListWrap">
            {list === null ? (
              <Loader inline label={t('Loading…')} />
            ) : list.length === 0 ? (
              <div className="empty-state">{t('No saved audio yet. Tap ☆ Save on an audio lesson.')}</div>
            ) : (
              <SavedAudioList items={savedLessons} orphans={orphanItems} savedIds={savedIds} heard={heard} lastId={lastId}
                              onPlay={setPlaying} onToggleSave={toggleSave} onRemoveOrphan={removeFromList} />
            )}
          </div>
        )}

        {listTab === 'photos' && (
          <div id="myPhotoListWrap">
            {photos === null || photoRefs === null ? (
              <Loader inline label={t('Loading…')} />
            ) : savedPhotos.length === 0 ? (
              <div className="empty-state">{t('No saved photos yet. Tap ☆ on a board photo to keep it here.')}</div>
            ) : (
              <div className="saved-photo-grid">
                {savedPhotos.map((p) => {
                  const key = 'photo:' + p.id;
                  return (
                    <div className="saved-photo" key={p.id}>
                      <button type="button" className="saved-photo-img" onClick={() => setZoomed(p)} aria-label={p.caption || t('Board photo')}>
                        <img src={p.urls[0]} alt={p.caption || t('Board photo')} loading="lazy" />
                      </button>
                      <div className="saved-photo-meta">
                        <div className="saved-photo-text">
                          <div className="list-item-title">{p.caption || t('Board photo')}</div>
                          <div className="list-item-sub">{p.date}</div>
                        </div>
                        {confirmDel === key ? (
                          <div className="list-confirm">
                            <button type="button" className="list-confirm-yes" onClick={() => removePhotoFromList(p)}>{t('Yes')}</button>
                            <button type="button" className="list-confirm-no" onClick={() => setConfirmDel(null)}>{t('No')}</button>
                          </div>
                        ) : (
                          <button type="button" className="list-item-remove" aria-label={t('Remove')} onClick={() => setConfirmDel(key)}>{TRASH_ICON}</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {toast ? <div className="lib-toast" role="status" aria-live="polite">{toast}</div> : null}
      <AudioLightbox lesson={playing} queue={queue} onSelect={(l) => setPlaying(l)} onClose={() => setPlaying(null)} saved={!!playing && savedIds.has(playing.id)} onToggleSave={toggleSave} />
      <PhotoLightbox photo={zoomed} onClose={() => setZoomed(null)} saved={!!zoomed && savedPhotoIds.has(zoomed.id)} onToggleSave={togglePhotoSave} />
    </section>
  );
}
