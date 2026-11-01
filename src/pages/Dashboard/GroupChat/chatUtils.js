// Pure helpers + the Cloudflare R2 presign client for the group chat (ported 1:1 from the gc* helpers in dashboard.html).
import { supabase, SUPABASE_URL } from '../../../lib/supabaseClient';

import { fmtDate, currentLang } from '../../../lib/dateLocale';
export const GC_VOICE_MAX_SECONDS = 120;
export const GC_VOICE_MIN_MS = 500;
export const GC_MEDIA_MAX_MB = 5;   // photos / videos — previewed inline, kept small
export const GC_FILE_MAX_MB = 25;   // any other file (audio, pdf, docs, zip…)

export const MESSAGE_COLUMNS =
  'id, sender_id, sender_name, content, message_type, voice_path, voice_duration, media_path, file_name, file_size, file_mime, created_at, edited_at, reply_to_id, is_pinned, pinned_by, pinned_at';

/* ---------- R2 (Cloudflare) presigned URLs ---------- */
// Chat files (voice, photos, video, documents) live in Cloudflare R2. The `r2-presign` edge
// function checks group_members / teacher_groups membership before signing any URL.
export async function gcR2Call(payload) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData && sessionData.session && sessionData.session.access_token;
  if (!token) throw new Error('Session expired — please sign in again');
  const res = await fetch(SUPABASE_URL + '/functions/v1/r2-presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify(payload),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || 'R2 so\u2018rovi muvaffaqiyatsiz tugadi');
  return out;
}

/** `onKey` is called as soon as the presigned URL is known (before the PUT finishes) so the bubble can show at once. */
/** 'audio/webm;codecs=opus' -> 'audio/webm' (parameters in Content-Type break signed PUTs and allow-lists on some setups). */
export function gcBaseMime(type) {
  return String(type || '').split(';')[0].trim().toLowerCase();
}

export async function gcR2Upload(file, kind, groupCode, onKey) {
  const contentType = gcBaseMime(file.type) || undefined;
  const { uploadUrl, key } = await gcR2Call({
    action: 'upload', groupCode, kind,
    filename: file.name || ('file.' + (kind === 'voice' ? 'webm' : 'bin')),
    contentType,
  });
  if (onKey) onKey(key);
  let putRes;
  try {
    putRes = await fetch(uploadUrl, { method: 'PUT', headers: contentType ? { 'Content-Type': contentType } : {}, body: file });
  } catch (netErr) {
    // A rejected fetch (no status) on a phone is almost always a network drop or a CORS rule on the bucket.
    throw new Error('Network/CORS error while uploading');
  }
  if (!putRes.ok) throw new Error('R2 upload failed: ' + putRes.status);
  return key;
}

export function gcR2Delete(key, groupCode) {
  return gcR2Call({ action: 'delete', groupCode, key }).catch(() => {});
}

const signedUrlCache = new Map(); // `${groupCode}|${path}` -> { url, expiresAt }
/** Cached signed URL if we already have a fresh one (no network) — lets playback start synchronously inside the tap. */
export function gcPeekSignedUrl(groupCode, path) {
  const cached = signedUrlCache.get(groupCode + '|' + path);
  return cached && cached.expiresAt > Date.now() + 15000 ? cached.url : null;
}
export function gcForgetSignedUrl(groupCode, path) { signedUrlCache.delete(groupCode + '|' + path); }
/** Temporary download URL for a voice/media/file key (cached ~1h, like the original's two caches). */
export async function gcGetSignedUrl(groupCode, path, ttlMs = 3500 * 1000) {
  const cacheKey = groupCode + '|' + path;
  const cached = signedUrlCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 15000) return cached.url;
  const { url } = await gcR2Call({ action: 'download', groupCode, key: path });
  if (!url) throw new Error('No signed URL');
  signedUrlCache.set(cacheKey, { url, expiresAt: Date.now() + ttlMs });
  return url;
}

/* ---------- formatting ---------- */
export function gcFormatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds || 0));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
export function gcFormatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
/** Returns an English key ('Today' / 'Yesterday') or a locale date string; callers run keys through t(). */
export function gcFormatDaySeparator(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(today); yest.setDate(yest.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return fmtDate(d, currentLang(), { day: 'numeric', month: 'short' });
}
export function gcFormatFileSize(bytes) {
  const n = Number(bytes);
  if (!n || n <= 0) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

/* ---------- Telegram-style sender colours ---------- */
const GC_NAME_COLORS = ['#E17076', '#EDA86C', '#A695E7', '#7BC862', '#6EC9CB', '#65AADD', '#EE7AAE', '#C9A24B'];
export function gcSenderColor(id) {
  const s = String(id || '');
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return GC_NAME_COLORS[hash % GC_NAME_COLORS.length];
}
export function gcHexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Deterministic pseudo-random bar heights per message id, so a waveform looks the same on every render. */
export function gcVoiceBarHeights(seed, count) {
  let h = 0;
  const str = String(seed);
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  const heights = [];
  for (let i = 0; i < count; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    heights.push(28 + (h % 1000) / 1000 * 72); // 28%–100%
  }
  return heights;
}

export function gcPickRecordingMimeType() {
  // Chrome/Android/Firefox -> webm/ogg; Safari/iOS -> mp4 (aac)
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/aac'];
  for (const type of candidates) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

/* ---------- message-type helpers ---------- */
export function gcIsAudioFile(msg) {
  return !!(msg && msg.message_type === 'file' && msg.file_mime && msg.file_mime.startsWith('audio/'));
}
/** One-line preview of any message type: [kind, label]. kind 'voice' is rendered as "🎤 Voice message" (translated). */
export function gcPreview(msg) {
  if (!msg) return { kind: 'missing' };
  if (msg.message_type === 'voice') return { kind: 'voice' };
  if (msg.message_type === 'image') return { kind: 'text', text: '📷 Photo' };
  if (msg.message_type === 'video') return { kind: 'text', text: '🎥 Video' };
  if (msg.message_type === 'file') {
    return { kind: 'text', text: gcIsAudioFile(msg) ? '🎵 ' + (msg.file_name || 'Audio') : '📎 ' + (msg.file_name || 'File') };
  }
  return { kind: 'text', text: msg.content || '' };
}

/* ---------- links ---------- */
// Only http(s) links are made clickable (no javascript:/data: URLs), trailing punctuation stays outside the link.
export const GC_URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)"'\]])/g;

/* ---------- emoji picker (plain Unicode emoji — no third-party artwork) ---------- */
export const GC_EMOJI_GROUPS = [
  { id: 'smile', icon: '😀', list: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '🙂', '😉', '😊', '😇', '🥰', '😍', '😘', '😋', '😎', '🤩', '🥳', '🤔', '🤗', '😴', '😌', '😏', '😬', '😮', '😢', '😭', '😤', '😡', '🤯', '😱'] },
  { id: 'hand', icon: '👍', list: ['👍', '👎', '👌', '✌️', '🤞', '🤝', '👏', '🙌', '🙏', '💪', '👋', '🤙', '👀', '🫡', '🫶', '✍️'] },
  { id: 'heart', icon: '❤️', list: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '💖', '💯', '✨', '🔥', '⭐', '🌟', '✅', '❌', '❗', '❓', '💡'] },
  { id: 'study', icon: '📚', list: ['📚', '📖', '📝', '✏️', '🎧', '🎤', '🎓', '🏆', '🥇', '🎯', '⏰', '📅', '💻', '📎', '🌍', '☕', '🎉', '🎁', '🚀', '🌙'] },
];

/** Clipboard write with a legacy fallback (older mobile browsers / non-secure contexts). */
export async function gcCopyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (err) { /* ignore */ }
    ta.remove();
  }
}
