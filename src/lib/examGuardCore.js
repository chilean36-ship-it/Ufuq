/*
 * Exam leave-guard, rules only (no DOM, no React). The hook feeds it the state of the page and the time.
 *
 * Rules
 *  - A departure is one continuous stretch away from the exam page (tab/app switch, screen lock, Back, leaving full
 *    screen, window losing focus). However many browser events fire for it, it is ONE departure.
 *  - Leaving: warning 1 at once, for every counted departure.
 *  - Still away after warnAfterMs (20 s): warning 2 of this departure.
 *  - Still away after submitAfterMs (40 s): warning 3 of this departure, and the exam is submitted.
 *  - Back before 20 s: nothing more than warning 1.
 *  - Back between 20 s and 40 s: the warnings reached so far stay, the exam continues.
 *  - Exam-wide budget: maxWarnings (3). The moment the 3rd warning is given, the exam is submitted.
 *  - Technical interruption (device offline when the student left): not counted, no warning, no submission.
 *    Logged as tech_*. Up to maxFreeInterruptions per exam. If the device comes back online while the student is still
 *    away, or the offline stretch lasts techMaxMs, it becomes a normal departure from that moment.
 *  - "Back" must hold for stableMs before it counts, so focus flicker is ignored.
 */

export const GUARD_DEFAULTS = {
  maxWarnings: 3,
  warnAfterMs: 20000,
  submitAfterMs: 40000,
  techMaxMs: 120000,
  maxFreeInterruptions: 3,
  stableMs: 300,
};

/**
 * @param {(ev: object) => void} emit  events: violation, warning, notice, back, submit
 * @param {object} [options]           overrides for GUARD_DEFAULTS
 * @returns {{ update(reason: string, offline: boolean, t: number): void, isAway(): boolean, snapshot(): object }}
 *   reason: '' while the student is on the exam page, otherwise why they are away (tab, blur, fullscreen, leave).
 */
export function createExamGuard(emit, options = {}) {
  const o = { ...GUARD_DEFAULTS, ...options };
  const s = {
    away: false,
    since: 0,           // start of the current departure (ms)
    reason: '',         // what caused the current departure
    tech: false,        // current departure is a technical interruption
    presentSince: 0,    // when presence began (0 while away)
    stageHere: 0,       // warnings issued during the current departure (1, 2 or 3)
    count: 0,           // counted departures in this exam
    warned: 0,          // warnings issued in this exam
    free: 0,            // technical interruptions used
    limit: false,       // the exam has been submitted by the guard
  };
  const thresholds = [o.warnAfterMs, o.submitAfterMs];   // time at which warning 2 and warning 3 of a departure fall due

  const meta = (extra) => ({ kind: s.reason, tech: s.tech, stage: s.stageHere, sec: Math.round(o.submitAfterMs / 1000), ...extra });

  const submit = () => {
    if (s.limit) return;
    s.limit = true;
    emit({ type: 'submit', warned: s.warned, warning: meta({ count: s.warned, back: false, final: true }) });
  };

  // Issues the next warning of the current departure. Reaching the exam-wide budget submits the exam.
  const issue = () => {
    s.warned += 1;
    s.stageHere += 1;
    emit({ type: 'warning', warned: s.warned, warning: meta({ count: s.warned, back: false, final: false }) });
    if (s.warned >= o.maxWarnings) submit();
  };

  // Gives the warnings of the current departure that are due for the time away (elapsed ms).
  const escalate = (elapsed) => {
    while (!s.limit && s.stageHere < 3 && elapsed >= thresholds[s.stageHere - 1]) issue();
    if (!s.limit && s.stageHere >= 3) submit();   // 40 s reached: the 3rd warning ends the exam
  };

  const countDeparture = () => {
    s.count += 1;
    emit({ type: 'violation', kind: s.reason, count: s.count, tech: false });
    issue();                                      // warning 1 at once
  };

  const startAway = (reason, offline, t) => {
    s.away = true;
    s.since = t;
    s.reason = reason;
    s.presentSince = 0;
    s.stageHere = 0;
    s.tech = !!offline && s.free < o.maxFreeInterruptions;
    if (s.tech) {
      s.free += 1;
      emit({ type: 'violation', kind: 'tech_' + reason, count: s.free, tech: true });
      emit({ type: 'notice', warning: meta({ count: s.warned, back: false, final: false }) });
      return;
    }
    countDeparture();
  };

  // A technical departure becomes a normal one from time t.
  const promote = (t) => {
    s.tech = false;
    s.since = t;
    s.stageHere = 0;
    countDeparture();
  };

  const endAway = (t) => {
    const wasTech = s.tech;
    const elapsed = (s.presentSince || t) - s.since;
    if (!wasTech) escalate(elapsed);              // warnings that fell due during the absence
    s.away = false;
    s.tech = false;
    s.presentSince = 0;
    if (s.limit) return;
    emit({ type: 'back', warning: { ...meta({ count: s.warned, back: true, final: false }), tech: wasTech } });
  };

  const step = (reason, t) => {
    if (s.limit || !s.away) return;
    if (!reason) {
      if (!s.presentSince) s.presentSince = t;
      if (t - s.presentSince >= o.stableMs) endAway(t);
      return;
    }
    s.presentSince = 0;
    if (s.tech) {
      if (t - s.since >= o.techMaxMs) promote(t);
      return;
    }
    escalate(t - s.since);
  };

  /** Called on every page event and on a regular timer; safe to call as often as needed. */
  const update = (reason, offline, t) => {
    if (s.limit) return;
    if (!s.away) {
      if (reason) startAway(reason, offline, t);
      return;
    }
    if (s.tech && reason && !offline) promote(t);
    step(reason, t);
  };

  return {
    update,
    isAway: () => s.away,
    snapshot: () => ({ ...s }),
  };
}
