/**
 * Single source of truth for lesson times.
 *
 * RULE: every schedule (groups.schedule_days = [{day:'Monday', time:'18:00'}]) is stored ONCE, in Tashkent
 * wall-clock time (GMT+5, Uzbekistan has no DST). It is never edited per country.
 *
 * Whoever looks at it (student, teacher, admin) sees it converted to THEIR OWN device time zone. The conversion
 * goes through a real UTC instant and the device's IANA zone (Africa/Cairo, Europe/Istanbul, ...), so when a
 * country moves its clocks (Egypt +2h <-> +3h from Tashkent, etc.) the shown time, and even the weekday when a late
 * evening class crosses midnight, change by themselves — no code change, no data change, no redeploy.
 */
export const TASHKENT_OFFSET_MS = 5 * 60 * 60000;

export function nowInTashkent() { return new Date(Date.now() + TASHKENT_OFFSET_MS); }

/** Real UTC instant for a Tashkent calendar date (month is 0-based) at hh:mm Tashkent wall-clock time. */
export function tashkentInstantOnDate(y, m, d, hh, mm) {
  return new Date(Date.UTC(y, m, d, hh, mm, 0, 0) - TASHKENT_OFFSET_MS);
}

/** Real UTC instant `daysFromToday` days after Tashkent's current calendar day, at hh:mm Tashkent time. */
export function tashkentInstant(daysFromToday, hh, mm) {
  const t = nowInTashkent();
  return tashkentInstantOnDate(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + daysFromToday, hh, mm);
}

/** 'YYYY-MM-DD' of an instant on the Tashkent calendar. */
export function tashkentDateKey(instant) {
  return new Date(instant.getTime() + TASHKENT_OFFSET_MS).toISOString().slice(0, 10);
}

/** True when `dateKey` ('YYYY-MM-DD', Tashkent) is an exam day (array / Set / nothing): the exam takes that day's lesson. */
export function isExamDay(examDays, dateKey) {
  if (!examDays || !dateKey) return false;
  return examDays instanceof Set ? examDays.has(dateKey) : examDays.indexOf(dateKey) >= 0;
}

export function formatLocalTime(date) {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function fmtHHMM(d) { return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }

/** The viewer's current offset from GMT in minutes (re-read every call, so it follows DST changes). */
export function viewerOffsetMinutes(at) { return -(at || new Date()).getTimezoneOffset(); }

/** True when the viewer's clock is the same as Tashkent's right now (nothing to convert). */
export function viewerIsOnTashkentTime(at) { return viewerOffsetMinutes(at) === 300; }

/** "GMT+3" for the viewer's current zone. */
export function viewerGmtLabel(at) {
  const off = viewerOffsetMinutes(at);
  const sign = off < 0 ? '-' : '+';
  const a = Math.abs(off);
  const h = Math.floor(a / 60), m = a % 60;
  return 'GMT' + sign + h + (m ? ':' + String(m).padStart(2, '0') : '');
}

/** Hours the viewer is behind (-) / ahead (+) of Tashkent right now, e.g. Cairo in summer = -2, in winter = -3. */
export function diffFromTashkentHours(at) { return (viewerOffsetMinutes(at) - 300) / 60; }

const DAY_NAME_BY_JS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TIME_RE = /^(\d{1,2}):(\d{2})$/;

/**
 * The lessons that fall on one LOCAL calendar date of the viewer (any zone, DST-proof).
 * Looks at the Tashkent dates around it, because a lesson can land on the neighbouring local day.
 * Returns [{ entry, instant, time }] sorted by time.
 */
export function lessonsOnLocalDate(scheduleDays, year, month, day, examDays) {
  const out = [];
  (Array.isArray(scheduleDays) ? scheduleDays : []).forEach((entry) => {
    const m = entry && TIME_RE.exec(entry.time || '');
    const dayIdx = entry ? DAY_NAME_BY_JS.indexOf(entry.day) : -1;
    if (!m || dayIdx < 0) return;
    for (let k = -1; k <= 1; k++) {
      const td = new Date(Date.UTC(year, month, day + k)); // a Tashkent calendar date near the local one
      if (td.getUTCDay() !== dayIdx) continue;
      if (isExamDay(examDays, td.toISOString().slice(0, 10))) continue;   // exam day: no lesson
      const instant = tashkentInstantOnDate(td.getUTCFullYear(), td.getUTCMonth(), td.getUTCDate(), +m[1], +m[2]);
      if (instant.getFullYear() === year && instant.getMonth() === month && instant.getDate() === day) {
        out.push({ entry, instant, time: fmtHHMM(instant) });
      }
    }
  });
  return out.sort((a, b) => a.instant - b.instant);
}

/** One schedule row shown to the viewer: "Mon 18:00" (Tashkent) -> viewer's own weekday and clock right now. */
export function entryInViewerZone(entry) {
  const m = entry && TIME_RE.exec(entry.time || '');
  const dayIdx = entry ? DAY_NAME_BY_JS.indexOf(entry.day) : -1;
  if (!m || dayIdx < 0) return null;
  const todayIdx = nowInTashkent().getUTCDay();
  const instant = tashkentInstant(((dayIdx - todayIdx) + 7) % 7, +m[1], +m[2]);
  return { day: DAY_NAME_BY_JS[instant.getDay()], time: fmtHHMM(instant), instant };
}
