import { createExamGuard } from '../src/lib/examGuardCore.js';

let failed = 0;
const check = (name, cond, extra = '') => {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + extra));
  if (!cond) failed++;
};

function rig(options) {
  const events = [];
  const g = createExamGuard((ev) => events.push(ev), options);
  let t = 1_000_000;
  const step = (ms) => { t += ms; };
  const tick = (reason, offline = false) => g.update(reason, offline, t);
  // a real timer: tick every 250 ms while the student is away for `ms`
  const away = (reason, ms, offline = false) => {
    for (let i = 0; i < ms / 250; i++) { step(250); tick(reason, offline); }
  };
  // back on the page: presence is seen by the timer every 250 ms
  const back = (ms = 600, offline = false) => { for (let i = 0; i < Math.ceil(ms / 250); i++) { step(250); tick('', offline); } };
  const warnings = () => events.filter((e) => e.type === 'warning');
  const violations = () => events.filter((e) => e.type === 'violation' && !e.tech);
  const submits = () => events.filter((e) => e.type === 'submit');
  return { g, events, step, tick, away, back, warnings, violations, submits };
}

// 1. Leave and return within 20 s → exactly one warning
{
  const r = rig();
  r.tick('tab'); r.away('tab', 10000); r.back();
  check('return at 10s: one warning', r.warnings().length === 1, r.warnings().length);
  check('return at 10s: one violation', r.violations().length === 1);
  check('return at 10s: no submit', r.submits().length === 0);
}

// 2. Leave, away 25 s, return → warning 1 at leave, warning 2 at 20 s, no submit
{
  const r = rig();
  r.tick('tab'); r.away('tab', 25000); r.back();
  check('return at 25s: two warnings', r.warnings().length === 2, r.warnings().length);
  check('return at 25s: no submit', r.submits().length === 0);
}

// 3. Leave and stay 45 s → 3 warnings, submitted at 40 s
{
  const r = rig();
  r.tick('tab'); r.away('tab', 45000);
  check('away 45s: three warnings', r.warnings().length === 3, r.warnings().length);
  check('away 45s: submitted', r.submits().length === 1);
  const idx = r.events.findIndex((e) => e.type === 'submit');
  check('away 45s: submit comes right after the 3rd warning', r.events[idx - 1].type === 'warning' && r.events[idx - 1].warned === 3);
}

// 4. Boundaries
{
  const a = rig();
  a.tick('tab'); a.away('tab', 19500); a.back();
  check('19.5s: one warning', a.warnings().length === 1, a.warnings().length);
  const b = rig();
  b.tick('tab'); b.away('tab', 20750); b.back();
  check('20.75s: two warnings, no submit', b.warnings().length === 2 && b.submits().length === 0);
  const c = rig();
  c.tick('tab'); c.away('tab', 39500); c.back();
  check('39.5s: two warnings, no submit', c.warnings().length === 2 && c.submits().length === 0);
}

// 5. Second departure back within 20 s → warning 2 (only the leave warning), exam continues
{
  const r = rig();
  r.tick('tab'); r.away('tab', 5000); r.back();
  r.step(3000); r.tick('blur'); r.away('blur', 6000); r.back();
  check('two quick departures: 2 warnings total', r.warnings().length === 2, r.warnings().length);
  check('two quick departures: no submit', r.submits().length === 0);
}

// 6. Third departure: its leave warning is the 3rd → exam submitted at once
{
  const r = rig();
  r.tick('tab'); r.away('tab', 5000); r.back();
  r.step(3000); r.tick('blur'); r.away('blur', 5000); r.back();
  r.step(3000); r.tick('fullscreen');
  check('3rd departure leave: 3rd warning', r.warnings().length === 3, r.warnings().length);
  check('3rd departure leave: submitted immediately', r.submits().length === 1);
}

// 7. Second departure away 25 s: its 20 s warning is the 3rd → submitted at 20 s
{
  const r = rig();
  r.tick('tab'); r.away('tab', 5000); r.back();
  r.step(3000); r.tick('blur'); r.away('blur', 25000);
  check('2nd departure 25s: exam submitted at 20 s', r.submits().length === 1 && r.warnings().length === 3, r.warnings().length);
}

// 8. One departure with a flood of browser events → still one departure
{
  const r = rig();
  for (const reason of ['tab', 'tab', 'leave', 'blur', 'tab', 'blur', 'tab', 'tab']) { r.step(20); r.tick(reason); }
  r.away('tab', 4000); r.back();
  check('event flood: 1 violation', r.violations().length === 1, r.violations().length);
  check('event flood: 1 warning', r.warnings().length === 1, r.warnings().length);
}

// 9. Flicker shorter than stableMs is not a return
{
  const r = rig();
  r.tick('blur'); r.step(100); r.tick(''); r.step(100); r.tick('blur');
  r.away('blur', 2000); r.back();
  check('flicker: one departure, one warning', r.violations().length === 1 && r.warnings().length === 1);
}

// 10. Timer path: submit happens while still away (desktop, timer running)
{
  const r = rig();
  r.tick('tab'); r.away('tab', 41000);
  check('timer path: submitted while still away', r.submits().length === 1 && r.g.isAway());
}

// 11. Suspended timer (phone in background): return after 45 s is still caught from the timestamps
{
  const r = rig();
  r.tick('tab'); r.step(45000); r.tick('');       // no ticks while the phone slept
  r.step(400); r.tick('');
  check('no timer, return after 45s: 3 warnings and submit', r.warnings().length === 3 && r.submits().length === 1, r.warnings().length);
}

// 12. Technical: offline departure not counted, no warning, no submit
{
  const r = rig();
  r.tick('tab', true); r.away('tab', 90000, true); r.back(600, false);
  check('offline 90s: not counted', r.violations().length === 0);
  check('offline 90s: no warning', r.warnings().length === 0);
  check('offline 90s: no submit', r.submits().length === 0);
  check('offline: logged as tech', r.events.some((e) => e.type === 'violation' && e.tech && e.kind === 'tech_tab'));
  check('offline: notice shown', r.events.some((e) => e.type === 'notice'));
}

// 13. Technical: back online while still away → normal departure from then on
{
  const r = rig();
  r.tick('tab', true); r.away('tab', 30000, true); r.tick('tab', false);
  check('reconnect while away: counted', r.violations().length === 1);
  check('reconnect while away: warning 1 at reconnect', r.warnings().length === 1);
  r.back(5000);
  check('reconnect while away: back in 5 s → nothing more', r.warnings().length === 1 && r.submits().length === 0);
}

// 14. Technical: only 3 free interruptions; the 4th offline departure counts
{
  const r = rig();
  for (let i = 0; i < 3; i++) { r.tick('tab', true); r.away('tab', 2000, true); r.back(600); r.step(1000); }
  check('three free interruptions: no warnings', r.warnings().length === 0);
  r.tick('tab', true); r.away('tab', 2000, true); r.back(600);
  check('4th offline departure: counted', r.violations().length === 1 && r.warnings().length === 1);
}

// 15. Idle on the page: no events
{
  const r = rig();
  r.tick(''); r.step(60000); r.tick('');
  check('idle on page: no events', r.events.length === 0);
}

// 16. Nothing is emitted after the exam is submitted
{
  const r = rig();
  r.tick('tab'); r.away('tab', 41000); const n = r.events.length;
  r.tick('blur'); r.away('blur', 2000); r.back();
  check('after submit: no more events', r.events.length === n);
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
