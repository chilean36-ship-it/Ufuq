import assert from 'node:assert/strict';
import { computeMonthAttendance } from '../src/lib/attendanceMonth.js';

// Mondays of Nov 2026: 2, 9, 16, 23, 30. "Today" is Thursday the 19th.
const base = { scheduleDays: [{ day: 'Monday', time: '18:00' }], year: 2026, month: 10, today: '2026-11-19' };

// nothing was ever taken: the lessons that are already over count as "no lesson", the two still to come remain
let s = computeMonthAttendance({ ...base, records: [] });
assert.equal(s.total, 2); assert.equal(s.absent, 0); assert.equal(s.rate, 100);
assert.deepEqual(s.lessons.map((l) => l.date), ['2026-11-23', '2026-11-30']);

// a lesson that WAS taken keeps counting, absent or present
s = computeMonthAttendance({ ...base, records: [{ date: '2026-11-02', present: false }, { date: '2026-11-09', present: true }] });
assert.equal(s.total, 4); assert.equal(s.absent, 1); assert.equal(s.present, 1); assert.equal(s.rate, 75);

// today's own lesson (not yet taken) is still planned
s = computeMonthAttendance({ ...base, today: '2026-11-16', records: [] });
assert.equal(s.total, 3);

// the lock limit is untouched: 3 absences is still the limit
s = computeMonthAttendance({ ...base, records: ['02', '09', '16'].map((d) => ({ date: '2026-11-' + d, present: false })) });
assert.equal(s.level, 'danger'); assert.equal(s.absent, 3);
console.log('attendance tests passed');
