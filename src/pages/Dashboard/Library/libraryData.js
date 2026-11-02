import { supabase } from '../../../lib/supabaseClient';

import { fmtDate, currentLang } from '../../../lib/dateLocale';
/* Port of the Library helpers in dashboard.html: Board Photos, Audio Lessons, saved List. */

export function fmtShortDate(iso) {
  return fmtDate(iso, currentLang(), { month: 'short', day: 'numeric' });
}

export function fmtAudioDuration(totalSeconds) {
  const s = Math.max(0, parseInt(totalSeconds, 10) || 0);
  const m = Math.floor(s / 60), r = s % 60;
  return m + ':' + String(r).padStart(2, '0');
}

export function fmtClock(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}

/** Upload time when the row has one (created_at), otherwise the lesson/photo date. Returns ms since epoch. */
function tsOf(createdAt, fallbackDate) {
  const a = createdAt ? Date.parse(createdAt) : NaN;
  if (!isNaN(a)) return a;
  const b = fallbackDate ? Date.parse(fallbackDate) : NaN;
  return isNaN(b) ? 0 : b;
}

/** Newest upload first (audio and board photos both use this). */
export function newestFirst(a, b) { return (b.ts || 0) - (a.ts || 0); }

/** Accepts any common Google Drive share-link shape (/file/d/<id>/view, ?id=<id>, /open?id=<id>) → file id. */
export function extractDriveFileId(url) {
  if (!url) return null;
  const m1 = String(url).match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  if (m1) return m1[1];
  const m2 = String(url).match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (m2) return m2[1];
  return null;
}

/** Ordered list of candidate image URLs for a stored photo path (Drive endpoints are flaky, so we try several). */
export function driveImageCandidates(rawUrl) {
  if (!rawUrl) return [];
  if (rawUrl.includes('drive.google.com') || rawUrl.includes('docs.google.com')) {
    const fileId = extractDriveFileId(rawUrl);
    if (fileId) {
      return [
        `https://drive.google.com/thumbnail?id=${fileId}&sz=w2000`,
        `https://lh3.googleusercontent.com/d/${fileId}=w2000`,
        `https://drive.google.com/uc?export=view&id=${fileId}`,
      ];
    }
  }
  return [rawUrl];
}

/** Ordered list of direct-media URLs to try for an audio lesson. */
export function audioSourceCandidates(a) {
  const raw = String(a.driveUrl || '').trim();
  const fileId = extractDriveFileId(raw);
  if (fileId) {
    return [
      // `confirm=t` skips Drive's "can't scan this file for viruses" interstitial served for large files.
      'https://drive.usercontent.google.com/download?id=' + fileId + '&export=download&authuser=0&confirm=t',
      'https://drive.google.com/uc?export=download&confirm=t&id=' + fileId,
      'https://docs.google.com/uc?export=download&confirm=t&id=' + fileId,
    ];
  }
  // Not a Drive link — a direct file URL (Supabase storage, a CDN…) is playable as-is.
  if (/^https?:\/\//i.test(raw)) return [raw];
  return [];
}

/** Group codes whose materials this student sees: the own group plus the lower levels of the same letter (materials follow the student
 *  up the levels). Falls back to the own group when the server function is not available yet. */
async function materialCodes(code) {
  if (!code) return [];
  try {
    const { data, error } = await supabase.rpc('ufuq_series_codes_for', { p_code: code });
    if (!error && Array.isArray(data) && data.length) return [...new Set([code, ...data.map((x) => String(x))])].filter((c) => /^[A-Za-z0-9]+$/.test(c));
  } catch (e) { /* use the own group only */ }
  return [code];
}
const groupFilter = (codes) => 'group_code.is.null,group_code.in.(' + codes.join(',') + ')';

/** Rows from public.board_photos: general photos (group_code IS NULL) + those of the student's group and its lower levels. */
export async function getBoardPhotos(code) {
  try {
    let query = supabase
      .from('board_photos')
      .select('*')
      .order('taken_at', { ascending: false });
    const codes = await materialCodes(code);
    query = codes.length ? query.or(groupFilter(codes)) : query.is('group_code', null);
    const { data, error } = await query;
    if (error) throw error;
    const rows = data || [];
    // Older rows only have a Supabase Storage path → short-lived signed URL, so nothing already uploaded breaks.
    const legacyRows = rows.filter((r) => r.storage_path && !/^https?:\/\//i.test(r.storage_path));
    const signedByPath = {};
    if (legacyRows.length) {
      const { data: signed, error: signErr } = await supabase.storage
        .from('board-photos')
        .createSignedUrls(legacyRows.map((r) => r.storage_path), 3600);
      if (signErr) throw signErr;
      (signed || []).forEach((s) => { if (s.signedUrl) signedByPath[s.path] = s.signedUrl; });
    }
    return rows
      .map((r) => {
        const urls = /^https?:\/\//i.test(r.storage_path)
          ? driveImageCandidates(r.storage_path)
          : (signedByPath[r.storage_path] ? [signedByPath[r.storage_path]] : []);
        return { id: r.id, caption: r.caption || '', date: fmtShortDate(r.taken_at), urls, ts: tsOf(r.created_at, r.taken_at) };
      })
      .filter((p) => p.urls.length)
      .sort(newestFirst);
  } catch (err) {
    console.error('Doska rasmlarini olishda xatolik:', err.message);
    return [];
  }
}

/** Rows from public.audio_lessons: general lessons + those of the student's group and its lower levels. */
export async function getAudioLessons(code) {
  try {
    let query = supabase
      .from('audio_lessons')
      .select('*')
      .order('published_at', { ascending: false });
    const codes = await materialCodes(code);
    query = codes.length ? query.or(groupFilter(codes)) : query.is('group_code', null);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map((a) => ({
      id: a.id, title: a.title, desc: a.description || '',
      driveUrl: a.drive_url,
      durationSeconds: parseInt(a.duration_seconds, 10) || 0,
      duration: fmtAudioDuration(a.duration_seconds), date: fmtShortDate(a.published_at),
      ts: tsOf(a.created_at, a.published_at), // created_at may not exist on this table — tsOf falls back to published_at
    })).sort(newestFirst);
  } catch (err) {
    console.error('Audio darslarni olishda xatolik:', err.message);
    return [];
  }
}

/** The student's own bookmarks from public.saved_lessons. */
export async function getMyList(userId) {
  if (!userId) return [];
  try {
    const { data, error } = await supabase
      .from('saved_lessons')
      .select('audio_id, saved_at, audio_lessons(title, description, drive_url, duration_seconds, published_at)')
      .eq('user_id', userId)
      .order('saved_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((row) => {
      const a = row.audio_lessons || null;
      return {
        id: row.audio_id, audioId: row.audio_id, savedAt: row.saved_at,
        title: (a && a.title) || 'Lesson', sub: 'Audio lesson · saved',
        // enough to play the lesson straight from the List tab
        lesson: a ? {
          id: row.audio_id, title: a.title, desc: a.description || '', driveUrl: a.drive_url,
          durationSeconds: parseInt(a.duration_seconds, 10) || 0, duration: fmtAudioDuration(a.duration_seconds),
          date: fmtShortDate(a.published_at), ts: tsOf(null, a.published_at),
        } : null,
      };
    });
  } catch (err) {
    console.error("My List'ni olishda xatolik:", err.message);
    return [];
  }
}

/** Save / unsave an audio lesson. Resolves to `true` on success and `false` on failure (the UI rolls back). */
export async function toggleMyListAudio(userId, audioId, save) {
  if (!userId || !audioId) return false;
  try {
    if (save) {
      // ignoreDuplicates → INSERT … ON CONFLICT DO NOTHING: only needs the INSERT policy and never errors on a double tap.
      const { error } = await supabase.from('saved_lessons')
        .upsert({ user_id: userId, audio_id: audioId }, { onConflict: 'user_id,audio_id', ignoreDuplicates: true });
      if (error) throw error;
    } else {
      const { error } = await supabase.from('saved_lessons')
        .delete().eq('user_id', userId).eq('audio_id', audioId);
      if (error) throw error;
    }
    return true;
  } catch (err) {
    console.error("My List'ni yangilashda xatolik:", err.message || err);
    return false;
  }
}

/* ---------- Saved board photos (public.saved_photos) — kept apart from saved audio so the two never mix ---------- */

/** The student's bookmarked board photos: [{ photoId, savedAt }], most recently saved first. */
export async function getSavedPhotoRefs(userId) {
  if (!userId) return [];
  try {
    const { data, error } = await supabase
      .from('saved_photos')
      .select('photo_id, saved_at')
      .eq('user_id', userId)
      .order('saved_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((r) => ({ photoId: r.photo_id, savedAt: r.saved_at }));
  } catch (err) {
    console.error('Saqlangan rasmlarni olishda xatolik:', err.message);
    return [];
  }
}

export async function toggleSavedPhoto(userId, photoId, save) {
  if (!userId || !photoId) return false;
  try {
    if (save) {
      const { error } = await supabase.from('saved_photos')
        .upsert({ user_id: userId, photo_id: photoId }, { onConflict: 'user_id,photo_id', ignoreDuplicates: true });
      if (error) throw error;
    } else {
      const { error } = await supabase.from('saved_photos')
        .delete().eq('user_id', userId).eq('photo_id', photoId);
      if (error) throw error;
    }
    return true;
  } catch (err) {
    console.error('Rasmni saqlash/o‘chirishda xatolik:', err.message || err);
    return false;
  }
}
