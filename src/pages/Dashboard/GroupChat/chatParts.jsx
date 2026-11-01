import { Fragment, useEffect, useMemo, useState } from 'react';
import { useCabinetI18n } from '../../../context/CabinetI18nContext';
import { GC_URL_RE, gcFormatDuration, gcFormatFileSize, gcFormatTime, gcGetSignedUrl, gcIsAudioFile, gcPreview, gcVoiceBarHeights } from './chatUtils';

export const Svg = ({ size, w = 2.2, children, fill = 'none' }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill={fill} stroke={fill === 'none' ? 'currentColor' : 'none'}
       strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);
export const IconSearch = ({ size = 17 }) => <Svg size={size}><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></Svg>;
export const IconClose = ({ size = 14, w = 2.4 }) => <Svg size={size} w={w}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></Svg>;

export const IconCheck = ({ size = 13 }) => <Svg size={size} w={2.6}><polyline points="20 6 9 17 4 12" /></Svg>;
export const IconChecks = ({ size = 15 }) => <Svg size={size} w={2.5}><polyline points="1.5 12.5 6.5 17.5 15 7" /><polyline points="10 16 11.5 17.5 22 6.5" /></Svg>;
export const IconClock = ({ size = 12 }) => <Svg size={size} w={2.4}><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></Svg>;
export const IconSmile = ({ size = 20 }) => <Svg size={size} w={2}><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></Svg>;
export const IconChevronDown = ({ size = 18 }) => <Svg size={size} w={2.4}><polyline points="6 9 12 15 18 9" /></Svg>;

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export const MENU_ICONS = {
  copy: <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></>,
  reply: <><polyline points="9 17 4 12 9 7" /><path d="M20 18v-2a4 4 0 00-4-4H4" /></>,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z" /></>,
  pin: <><path d="M12 17v5" /><path d="M9 10.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V16a1 1 0 001 1h12a1 1 0 001-1v-.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V7a1 1 0 011-1 2 2 0 000-4H8a2 2 0 000 4 1 1 0 011 1z" /></>,
  delete: <><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m5 0V4a1 1 0 011-1h2a1 1 0 011 1v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></>,
};

/** Highlights the current search term inside a plain string. */
export function highlight(text, re) {
  if (!re) return text;
  return text.split(re).map((part, i) => (i % 2 === 1 ? <span key={i} className="gc-search-mark">{part}</span> : part));
}

/** Message text: newlines kept, http(s) links clickable, current search term wrapped in <span class="gc-search-mark">. */
export function renderContent(content, term) {
  const text = content == null ? '' : String(content);
  const needle = term.trim();
  const lines = text.split('\n');
  const re = needle ? new RegExp('(' + needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig') : null;
  return lines.map((line, li) => (
    <Fragment key={li}>
      {li > 0 && <br />}
      {line.split(GC_URL_RE).map((part, i) => (i % 2 === 1
        ? <a key={i} className="gc-link" href={part} target="_blank" rel="noopener noreferrer">{highlight(part, re)}</a>
        : <Fragment key={i}>{highlight(part, re)}</Fragment>))}
    </Fragment>
  ));
}

/** Preview line shared by reply quotes, the composer strip and the pinned banner. */
export function PreviewText({ msg }) {
  const { t } = useCabinetI18n();
  const p = gcPreview(msg);
  if (p.kind === 'missing') return t('Message unavailable');
  if (p.kind === 'voice') return <>🎤 {t('Voice message')}</>;
  return p.text;
}

export function VoiceBubble({ msg, chat, isLast }) {
  const { t } = useCabinetI18n();
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => chat.subscribeVoice(msg.id, (p) => {
    if ('playing' in p) setPlaying(p.playing);
    if ('progress' in p) setProgress(p.progress);
    if ('error' in p) setFailed(!!p.error);
  }), [chat, msg.id]);
  // Sign the download URL ahead of the tap so playback can begin inside the tap itself (required on iPhone).
  const prefetch = chat.prefetchVoice;
  useEffect(() => { if (msg.voice_path && !msg._uploading) prefetch(msg.id); }, [prefetch, msg.id, msg.voice_path, msg._uploading]);
  const bars = useMemo(() => gcVoiceBarHeights(msg.id, 32), [msg.id]);
  // Played part = bars whose position is before the current progress (colouring, not an overlay: an overlay with a
  // width % squeezed the waveform and made it look skewed).
  const playedCount = Math.round((progress / 100) * bars.length);
  return (
    <div className={'gc-msg-bubble gc-voice-bubble ' + (isLast ? '' : 'gc-no-tail') + ' ' + (msg._uploading ? 'gc-voice-uploading' : '') + (failed ? ' gc-voice-error' : '')} title={failed ? t('Could not play this voice message') : undefined}>
      <button type="button" className="gc-voice-play" data-msg-id={msg.id} aria-label={t('Play')} disabled={!!msg._uploading}
              onClick={() => chat.toggleVoice(msg.id)}>
        {playing
          ? <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
          : <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="8 5 19 12 8 19 8 5" /></svg>}
      </button>
      <div className="gc-voice-main">
        <div className="gc-voice-wave" aria-hidden="true">
          {bars.map((h, i) => (
            <span key={i} className={i < playedCount ? 'is-played' : ''} style={{ '--h': h.toFixed(0) + '%' }} />
          ))}
        </div>
        <span className="gc-voice-dur">{failed ? '⚠️' : gcFormatDuration(msg.voice_duration)}</span>
      </div>
    </div>
  );
}

/** <img>/<video>/<audio> whose real (signed, temporary) src is fetched once the key is known. */
export function SignedMedia({ as: Tag, groupCode, path, localUrl, ...rest }) {
  const [src, setSrc] = useState(localUrl || null);
  useEffect(() => {
    if (localUrl) { setSrc(localUrl); return undefined; }
    if (!path) return undefined;
    let cancelled = false;
    gcGetSignedUrl(groupCode, path, 3600000)
      .then((url) => { if (!cancelled) setSrc(url); })
      .catch((err) => console.error('Media yuklashda xatolik:', err.message));
    return () => { cancelled = true; };
  }, [groupCode, path, localUrl]);
  return <Tag {...rest} src={src || undefined} />;
}

async function downloadFile(groupCode, path, filename) {
  try {
    const url = await gcGetSignedUrl(groupCode, path, 3600000);
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.download = filename || '';
    document.body.appendChild(a); a.click(); a.remove();
  } catch (err) {
    console.error('Faylni yuklab olishda xatolik:', err.message);
  }
}

/** One tick = sent, two ticks = seen by at least one classmate / teacher. */
export function Ticks({ pending, seenBy }) {
  const { t } = useCabinetI18n();
  if (pending) return <span className="gc-bubble-tick" title={t('Sending…')}><IconClock /></span>;
  const seen = seenBy.length > 0;
  const title = seen ? `${t('Seen by')} ${seenBy.slice(0, 6).join(', ')}${seenBy.length > 6 ? ` +${seenBy.length - 6}` : ''}` : t('Sent');
  return <span className={'gc-bubble-tick' + (seen ? ' is-seen' : '')} title={title}>{seen ? <IconChecks /> : <IconCheck />}</span>;
}

/** Reaction chips under a bubble. Click = add / switch / remove your own reaction. */
export function ReactionChips({ list, myId, onToggle }) {
  const groups = useMemo(() => {
    const map = new Map();
    list.forEach((r) => {
      const g = map.get(r.emoji) || { emoji: r.emoji, count: 0, mine: false, names: [] };
      g.count += 1; g.mine = g.mine || r.user_id === myId; if (r.user_name) g.names.push(r.user_name);
      map.set(r.emoji, g);
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [list, myId]);
  if (!groups.length) return null;
  return (
    <div className="gc-reactions">
      {groups.map((g) => (
        <button type="button" key={g.emoji} className={'gc-reaction' + (g.mine ? ' is-mine' : '')}
                title={g.names.join(', ') || undefined} onClick={() => onToggle(g.emoji)}>
          <span className="gc-reaction-emoji">{g.emoji}</span>
          <span className="gc-reaction-count">{g.count}</span>
        </button>
      ))}
    </div>
  );
}

export function Bubble({ msg, chat, groupCode, isLast, term, isMine, seenBy }) {
  const { t } = useCabinetI18n();
  const tail = isLast ? '' : 'gc-no-tail';
  const isMedia = msg.message_type === 'image' || msg.message_type === 'video';
  if (msg.message_type === 'voice') return <VoiceBubble msg={msg} chat={chat} isLast={isLast} />;
  if (isMedia) {
    return (
      <div className={'gc-msg-bubble gc-media-bubble ' + tail + ' ' + (msg._uploading ? 'gc-media-uploading' : '')}>
        {msg.message_type === 'video'
          ? <SignedMedia as="video" className="gc-media-el" groupCode={groupCode} path={msg.media_path} localUrl={msg._localUrl} controls playsInline />
          : <SignedMedia as="img" className="gc-media-el" groupCode={groupCode} path={msg.media_path} localUrl={msg._localUrl} alt={t('Photo')} loading="lazy" />}
      </div>
    );
  }
  if (gcIsAudioFile(msg)) {
    return (
      <div className={'gc-msg-bubble gc-file-bubble gc-file-bubble--audio ' + tail + ' ' + (msg._uploading ? 'gc-file-uploading' : '')}>
        <div className="gc-file-name" title={msg.file_name || 'Audio'}>🎵 {msg.file_name || 'Audio'}</div>
        <SignedMedia as="audio" className="gc-audio-el" groupCode={groupCode} path={msg._uploading ? null : msg.media_path} controls preload="none" />
      </div>
    );
  }
  if (msg.message_type === 'file') {
    const activate = () => downloadFile(groupCode, msg.media_path, msg.file_name || 'file');
    return (
      <div className={'gc-msg-bubble gc-file-bubble ' + tail + ' ' + (msg._uploading ? 'gc-file-uploading' : '')}
           role="button" tabIndex={0}
           onClick={msg._uploading ? undefined : activate}
           onKeyDown={msg._uploading ? undefined : (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } }}>
        <span className="gc-file-icon">📎</span>
        <div className="gc-file-info">
          <div className="gc-file-name" title={msg.file_name || 'File'}>{msg.file_name || 'File'}</div>
          <div className="gc-file-size">{msg._uploading ? 'Uploading…' : gcFormatFileSize(msg.file_size)}</div>
        </div>
      </div>
    );
  }
  const pending = String(msg.id).startsWith('temp-');
  return (
    <div className={'gc-msg-bubble ' + tail}>
      {renderContent(msg.content, term)}
      <span className="gc-bubble-meta">
        {msg.edited_at ? <span className="gc-msg-edited-tag">{t('edited')}</span> : null}
        <span className="gc-bubble-time">{gcFormatTime(msg.created_at)}</span>
        {isMine ? <Ticks pending={pending} seenBy={seenBy} /> : null}
      </span>
    </div>
  );
}
