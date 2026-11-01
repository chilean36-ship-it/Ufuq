/**
 * Only plain web links may ever reach an <a href> or window.open().
 * Links such as zoom_link / drive_url are typed in by teachers and admins; without this check a value like
 * `javascript:fetch(...)` would run inside the student's (or admin's) logged-in session when they click it.
 * Relative paths resolve to this site and are allowed. Returns '' for anything else.
 */
export function safeHttpUrl(value) {
  if (value == null) return '';
  const s = String(value).trim();
  if (!s) return '';
  try {
    const u = new URL(s, window.location.origin);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : '';
  } catch (e) {
    return '';
  }
}

/** window.open() for a teacher-supplied link; refuses non-http(s) links. Returns true if it opened. */
export function openSafe(value, fallback = '') {
  const url = safeHttpUrl(value) || safeHttpUrl(fallback);
  if (!url) return false;
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}
