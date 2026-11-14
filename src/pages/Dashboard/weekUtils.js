import { fmtDate, currentLang } from '../../lib/dateLocale';
import { nowInTashkent, tashkentInstant, formatLocalTime, tashkentDateKey, isExamDay } from '../../lib/tzTime';
// Timezone-aware week/schedule helpers — port of the date logic in dashboard.html's inline script.
// Every group's schedule_days is stored in Tashkent wall-clock time (UTC+5, no DST); these turn
// each entry into a real UTC instant so "is class live right now" and the on-screen time are both
// correct no matter where the student actually is.

const DAY_NAMES_MON_FIRST = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const DAY_NAME_BY_JS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function getCurrentWeekDates() {
  const now = new Date();
  const dow = now.getDay(); // 0=Sun..6=Sat
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() + mondayOffset);
  const todayStr = new Date().toDateString();
  return DAY_NAMES_MON_FIRST.map((name, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return {
      day: name, date: d,
      dateLabel: MONTH_NAMES[d.getMonth()] + ' ' + d.getDate(),
      dateNum: d.getDate(),
      isToday: d.toDateString() === todayStr,
    };
  });
}

export { nowInTashkent, tashkentInstant, formatLocalTime };

/** Calendar-day key (local to the viewer) — used to match a class instant to the viewer's own week strip. */
function localDayKey(d) { return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }

/**
 * Full Monday-first week array ({day,time,instant}) in the *viewer's own* clock and calendar.
 * Schedules are fixed in Tashkent time (UTC+5, no DST). Every class is turned into a real UTC instant, then shown
 * on the viewer's local day at the viewer's local hour — so when Egypt (or anywhere) switches DST, or a late
 * Tashkent evening class falls on a different local weekday, the student still sees the correct day and time.
 */
export function scheduleDaysToWeekArray(scheduleDays, currentWeek, examDays) {
  const list = (scheduleDays || []).filter((e) => e && e.day && /^\d{1,2}:\d{2}$/.test(e.time || ''));
  const tashkentTodayIdx = nowInTashkent().getUTCDay();
  const byLocalDay = {};
  const examLocalDay = {};   // local days whose lesson is replaced by an exam
  list.forEach((entry) => {
    const [hh, mm] = entry.time.split(':').map(Number);
    const dayIdx = DAY_NAME_BY_JS.indexOf(entry.day);
    if (dayIdx < 0) return;
    // every occurrence from last week to next week; the one landing on a given local date wins
    for (let k = -7; k <= 7; k += 7) {
      const instant = tashkentInstant(dayIdx - tashkentTodayIdx + k, hh, mm);
      const key = localDayKey(instant);
      if (isExamDay(examDays, tashkentDateKey(instant))) { examLocalDay[key] = true; continue; }   // exam day: no lesson
      if (!byLocalDay[key]) byLocalDay[key] = instant;
    }
  });
  return currentWeek.map((w) => {
    const instant = byLocalDay[localDayKey(w.date)];
    if (!instant) return examLocalDay[localDayKey(w.date)] ? { day: w.day, time: null, exam: true } : { day: w.day, time: null };
    return { day: w.day, time: formatLocalTime(instant), instant };
  });
}

export function getLiveClassNow(scheduleDays, examDays) {
  if (!scheduleDays || !scheduleDays.length) return null;
  const todayName = DAY_NAME_BY_JS[nowInTashkent().getUTCDay()];
  const entry = scheduleDays.find((e) => e && e.day === todayName);
  if (!entry || !entry.time) return null;
  const [hh, mm] = entry.time.split(':').map(Number);
  const start = tashkentInstant(0, hh, mm);
  if (isExamDay(examDays, tashkentDateKey(start))) return null;
  const end = new Date(start.getTime() + 120 * 60000);
  const now = new Date();
  return now >= start && now <= end ? { start, end } : null;
}

function resolveScheduleForDay(scheduleDays, dayName) {
  if (!scheduleDays || !scheduleDays.length) return null;
  let match = null;
  scheduleDays.forEach((entry) => { if (entry && entry.day === dayName) match = entry; });
  return match;
}

/** First upcoming class instant (today included) across the next 7 days, in the viewer's local time. */
export function findNextClass(scheduleDays, examDays) {
  if (!scheduleDays || !scheduleDays.length) return null;
  const now = new Date();
  const tashkentTodayIdx = nowInTashkent().getUTCDay();
  for (let offset = 0; offset <= 7; offset++) {
    const dayName = DAY_NAME_BY_JS[(tashkentTodayIdx + offset) % 7];
    const entry = resolveScheduleForDay(scheduleDays, dayName);
    if (entry && entry.time) {
      const [hh, mm] = entry.time.split(':').map(Number);
      const start = tashkentInstant(offset, hh, mm);
      if (start > now && !isExamDay(examDays, tashkentDateKey(start))) {
        return {
          day: DAY_NAME_BY_JS[start.getDay()], time: formatLocalTime(start), start,
          dateLabel: MONTH_NAMES[start.getMonth()] + ' ' + start.getDate(),
        };
      }
    }
  }
  return null;
}

export function fmtDueDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return fmtDate(d, currentLang(), { month: 'short', day: 'numeric' });
}

export function isOverdue(iso) {
  return new Date(iso + 'T23:59:59') < new Date();
}
