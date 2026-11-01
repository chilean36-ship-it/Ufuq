import { fmtDate as fmtDateL, currentLang } from './dateLocale';
import { supabase } from './supabaseClient';
/**
 * Helpers shared by the Admin and Teacher panels (ported 1:1 from the inline scripts of
 * admin.html / teacher.html, where the same functions were copy-pasted in both files).
 */

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const DAY_LABELS_EN = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun' };
export const DAY_NUM = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
export const DAY_NAME_BY_JS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTH_KEYS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const DOW_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Localised short weekday label ("Mon" → "Dush" in Uzbek). */
export function dayLabel(t, day) { return t(DAY_LABELS_EN[day] || String(day)); }

/** { jsWeekday: true } for the group's class days, or null when the group has no restriction. */
export function allowedWeekdaysForGroup(g) {
  if (!g || !Array.isArray(g.schedule_days) || g.schedule_days.length === 0) return null;
  const set = {};
  g.schedule_days.forEach((d) => { if (Object.prototype.hasOwnProperty.call(DAY_NUM, d.day)) set[DAY_NUM[d.day]] = true; });
  return set;
}

export function weekdayOfDateStr(dateStr) {
  const p = dateStr.split('-');
  return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10)).getDay();
}

export function isDateAllowedForGroup(dateStr, g) {
  const allowed = allowedWeekdaysForGroup(g);
  if (allowed === null) return true;
  return !!allowed[weekdayOfDateStr(dateStr)];
}

export function allowedDaysLabel(g, t) {
  if (!g || !Array.isArray(g.schedule_days)) return '';
  return g.schedule_days.map((d) => dayLabel(t, d.day) || d.day).join(', ');
}

export function fmtDateStr(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function parseDateStr(str) {
  const p = String(str || '').split('-');
  if (p.length !== 3) return new Date();
  return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
}

/** Local date, not UTC — toISOString() would roll the day over for anyone east of Greenwich late in the evening. */
export function todayStr() { return fmtDateStr(new Date()); }

export function nearestAllowedDateStr(fromDateStr, g) {
  if (isDateAllowedForGroup(fromDateStr, g)) return fromDateStr;
  const base = parseDateStr(fromDateStr);
  for (let offset = 1; offset <= 7; offset++) {
    const back = new Date(base); back.setDate(base.getDate() - offset);
    if (isDateAllowedForGroup(fmtDateStr(back), g)) return fmtDateStr(back);
    const fwd = new Date(base); fwd.setDate(base.getDate() + offset);
    if (isDateAllowedForGroup(fmtDateStr(fwd), g)) return fmtDateStr(fwd);
  }
  return fromDateStr;
}

export function humanDate(str, t) {
  if (!str) return '';
  const d = parseDateStr(str);
  return t(DOW_ORDER[(d.getDay() + 6) % 7]) + ', ' + d.getDate() + ' ' + t(MONTH_KEYS[d.getMonth()]) + ' ' + d.getFullYear();
}

export function fmtDate(d) {
  if (!d) return '\u2014';
  try { return fmtDateL(d, currentLang(), { day: '2-digit', month: 'short', year: 'numeric' }) || d; } catch (e) { return d; }
}

/* ---------------------------------------------------------------- audio ---- */

/** Accepts any of the common Google Drive share-link shapes (/file/d/<id>/view, ?id=<id>, /open?id=<id>). */
export function extractDriveFileId(url) {
  if (!url) return null;
  const m1 = String(url).match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  if (m1) return m1[1];
  const m2 = String(url).match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (m2) return m2[1];
  return null;
}

export function secondsToClock(total) {
  const s = Math.max(0, parseInt(total, 10) || 0);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

/** Accepts "7:32", "7m 32s", "452" or nothing (null = detect it for me). */
export function parseDurationInput(raw) {
  const v = String(raw || '').trim();
  if (!v) return null;
  const clock = v.match(/^(\d+):([0-5]?\d)$/);
  if (clock) return parseInt(clock[1], 10) * 60 + parseInt(clock[2], 10);
  const ms = v.match(/^(?:(\d+)\s*m)?\s*(?:(\d+)\s*s)?$/i);
  if (ms && (ms[1] || ms[2])) return (parseInt(ms[1] || '0', 10) * 60) + parseInt(ms[2] || '0', 10);
  const plain = parseInt(v, 10);
  return Number.isNaN(plain) ? null : Math.max(0, plain);
}

/** Reads the duration straight off a local File — works before the file is even uploaded. Resolves 0 on failure. */
export function detectDurationFromFile(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const probe = new Audio();
    probe.preload = 'metadata';
    let timer;
    const done = (val) => {
      clearTimeout(timer);
      probe.removeEventListener('loadedmetadata', onMeta);
      probe.removeEventListener('error', onErr);
      URL.revokeObjectURL(url);
      resolve(val);
    };
    const onMeta = () => done(Number.isFinite(probe.duration) ? Math.round(probe.duration) : 0);
    const onErr = () => done(0);
    timer = setTimeout(() => done(0), 8000);
    probe.addEventListener('loadedmetadata', onMeta);
    probe.addEventListener('error', onErr);
    probe.src = url;
    probe.load();
  });
}

/** Loads just the metadata of a Drive file to read its length. Resolves 0 rather than rejecting. */
export function detectDurationSeconds(fileId) {
  return new Promise((resolve) => {
    const urls = [
      'https://drive.usercontent.google.com/download?id=' + fileId + '&export=download&authuser=0',
      'https://drive.google.com/uc?export=download&id=' + fileId,
    ];
    let i = 0;
    const probe = new Audio();
    probe.preload = 'metadata';
    let timer;
    const done = (val) => {
      clearTimeout(timer);
      probe.removeEventListener('loadedmetadata', onMeta);
      probe.removeEventListener('error', onErr);
      probe.src = '';
      resolve(val);
    };
    const onMeta = () => done(Number.isFinite(probe.duration) ? Math.round(probe.duration) : 0);
    const onErr = () => { if (i < urls.length) { probe.src = urls[i++]; probe.load(); } else { done(0); } };
    timer = setTimeout(() => done(0), 8000);
    probe.addEventListener('loadedmetadata', onMeta);
    probe.addEventListener('error', onErr);
    probe.src = urls[i++];
    probe.load();
  });
}

/* Audio files go to Cloudflare R2 via a Worker that auto-names them audioa1, audioa2 ... —
   one independent counter per group letter. A group keeps its letter for ever ("Group A8" -> "a"), whatever its level. */
export const AUDIO_WORKER_URL = 'https://ufuq-audio-uploader.ufuq-edu.workers.dev';

export function groupLetterFor(g) {
  if (!g) return null;
  if (g.letter && /^[A-Ga-g]$/.test(g.letter)) return g.letter.toLowerCase();
  if (!g.name) return null;
  const m = g.name.trim().match(/^(?:group|guruh)[ _-]*([A-Za-z])\d*$/i) || g.name.trim().match(/([A-Za-z])\s*$/);
  if (!m) return null;
  const letter = m[1].toLowerCase();
  return /^[a-g]$/.test(letter) ? letter : null;
}

export async function uploadToAudioWorker(groupLetter, file) {
  try {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess && sess.session && sess.session.access_token;
    if (!token) throw new Error('Session expired — please sign in again.');
    const res = await fetch(AUDIO_WORKER_URL + '/upload?group=' + encodeURIComponent(groupLetter), {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'audio/mpeg', Authorization: 'Bearer ' + token },
      body: file,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !data.ok) throw new Error((data && data.error) || ('HTTP ' + res.status));
    if (!data.url) throw new Error('Worker did not return a public URL — check PUBLIC_BASE_URL in wrangler.toml.');
    return { ok: true, url: data.url, name: data.name };
  } catch (err) {
    return { ok: false, error: (err && err.message) || String(err) };
  }
}
