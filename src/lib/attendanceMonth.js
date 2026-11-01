/**
 * Monthly attendance maths — shared by the student dashboard, the teacher panel and the admin panel.
 *
 * Rules
 *  - Every lesson planned for the calendar month (from the group's weekly schedule, plus any extra lesson the
 *    teacher actually recorded) adds up to 100 %.
 *  - Each missed lesson takes an equal share off:  100 / lessons-in-the-month  (e.g. 8 lessons → −12.5 % each).
 *  - The allowed number of absences is FIXED: MAX_ABSENCES = 3 per month (regardless of how many lessons there are).
 *  - Colour: green = comfortable, amber = at / next to the limit, red = limit exceeded (attendance below 80 %).
 *
 * The raw data (who was present on which date) lives in Supabase (attendance_sessions + attendance_records);
 * the teacher's present / absent toggle writes it, and everything here is computed from it, so nothing can drift.
 */

export const MIN_RATE = 80;
/** Oyiga ruxsat etilgan qoldirishlar soni (qat'iy 3 ta). */
export const MAX_ABSENCES = 3;
export const LEVEL_COLORS = { good: '#4CAF7A', warn: '#E0A93B', danger: '#E4544C' };

const DAY_NUM = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
const pad = (n) => String(n).padStart(2, '0');
export const monthPrefix = (year, month) => `${year}-${pad(month + 1)}-`;

/** 'YYYY-MM-DD' for every day in (year, month) that falls on one of the group's weekly class days. */
export function plannedDatesInMonth(scheduleDays, year, month) {
  const weekdays = new Set();
  (Array.isArray(scheduleDays) ? scheduleDays : []).forEach((d) => {
    if (d && Object.prototype.hasOwnProperty.call(DAY_NUM, d.day)) weekdays.add(DAY_NUM[d.day]);
  });
  if (!weekdays.size) return [];
  const out = [];
  const last = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= last; day++) {
    if (weekdays.has(new Date(year, month, day).getDay())) out.push(`${year}-${pad(month + 1)}-${pad(day)}`);
  }
  return out;
}

/** 87.5 → "87.5", 100 → "100" */
export function fmtPct(n) {
  const v = Math.round(n * 10) / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/**
 * @param scheduleDays  group's schedule_days ([{day:'Monday', time:'18:00'}, …])
 * @param records       [{ date:'YYYY-MM-DD', present:boolean }] — only lessons the teacher has marked
 */
export function computeMonthAttendance({ scheduleDays, records, year, month, minRate = MIN_RATE }) {
  const prefix = monthPrefix(year, month);
  const planned = plannedDatesInMonth(scheduleDays, year, month);
  const inMonth = (records || []).filter((r) => r && r.date && r.date.startsWith(prefix));
  const byDate = {};
  inMonth.forEach((r) => { byDate[r.date] = !!r.present; });

  const dates = Array.from(new Set([...planned, ...Object.keys(byDate)])).sort();
  // Har bir mashg'ulotning vaqti: guruh jadvalidagi shu hafta kuni vaqti (bo'lmasa null)
  const timeByWeekday = {};
  (Array.isArray(scheduleDays) ? scheduleDays : []).forEach((d) => {
    if (d && Object.prototype.hasOwnProperty.call(DAY_NUM, d.day) && timeByWeekday[DAY_NUM[d.day]] === undefined) {
      timeByWeekday[DAY_NUM[d.day]] = d.time || null;
    }
  });
  const total = dates.length;
  const absent = dates.filter((d) => byDate[d] === false).length;
  const present = dates.filter((d) => byDate[d] === true).length;
  const perLesson = total ? 100 / total : 0;
  const rate = total ? Math.max(0, Math.round((100 - absent * perLesson) * 10) / 10) : 100;
  const allowed = MAX_ABSENCES;
  const left = allowed - absent;

  let level = 'good';
  if (total) {
    if (left < 0) level = 'danger';
    else if (absent > 0 && left <= 1) level = 'warn';  // 2 ta qoldirilgan → 1 qoldi, 3 ta → limit
  }

  return {
    year, month, total, present, absent, marked: present + absent, upcoming: total - present - absent,
    perLesson, rate, allowed, left, over: Math.max(0, -left), level, minRate,
    lessons: dates.map((date) => ({
      date,
      time: timeByWeekday[new Date(date + 'T00:00:00').getDay()] || null,
      status: byDate[date] === true ? 'present' : byDate[date] === false ? 'absent' : 'pending',
    })),
  };
}

/** Same maths for one student out of many records: [{ user_id, date, present }]. */
export function computeForMembers({ members, records, scheduleDays, year, month }) {
  const byUser = {};
  (records || []).forEach((r) => { (byUser[r.user_id] = byUser[r.user_id] || []).push(r); });
  return (members || []).map((m) => ({ member: m, stats: computeMonthAttendance({ scheduleDays, records: byUser[m.user_id] || [], year, month }) }));
}
