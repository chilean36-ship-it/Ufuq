import { useMemo, useState } from 'react';
import { usePanel } from '../../components/panel/PanelContext';
import { DOW_ORDER, MONTH_KEYS, fmtDateStr } from '../../lib/panelUtils';
import { useExamDays } from '../../lib/examDays';
import { lessonsOnLocalDate, viewerIsOnTashkentTime, viewerGmtLabel } from '../../lib/tzTime';

/** Every lesson on one calendar date (viewer's own zone, converted from Tashkent time for that exact date, so DST
 *  changes are handled per date) across ALL of the teacher's groups. */
function lessonsOnDate(myGroups, y, m, day, examDaysBy) {
  const out = [];
  myGroups.forEach((g) => {
    if (!g.is_active || !Array.isArray(g.schedule_days)) return;
    lessonsOnLocalDate(g.schedule_days, y, m, day, examDaysBy[g.code]).forEach((l) => out.push({ group: g, time: l.time, instant: l.instant }));
  });
  return out.sort((a, b) => a.instant - b.instant);
}

export default function CalendarPage() {
  const { t, myGroups } = usePanel();
  const [cursor, setCursor] = useState(() => new Date());
  const examDaysBy = useExamDays();   // an exam day replaces that group's lesson

  const { label, cells, today } = useMemo(() => {
    const y = cursor.getFullYear(), m = cursor.getMonth();
    const first = new Date(y, m, 1);
    const lead = (first.getDay() + 6) % 7; // Monday-first
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const today = fmtDateStr(new Date());
    const arr = [];
    for (let i = 0; i < lead; i++) arr.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(y, m, day);
      arr.push({ day, dateStr: fmtDateStr(d), events: lessonsOnDate(myGroups, y, m, day, examDaysBy) });
    }
    return { label: t(MONTH_KEYS[m]) + ' ' + y, cells: arr, today };
  }, [cursor, myGroups, t, examDaysBy]);

  return (
    <section className="page active" id="page-calendar">
      <div className="page-head">
        <h2>{t('Calendar')}</h2>
        <p>{t('The full month of lessons for all of your groups.')}{viewerIsOnTashkentTime() ? '' : ' \u00b7 ' + t('Shown in your local time') + ' (' + viewerGmtLabel() + ')'}</p>
      </div>
      <div className="panel">
        <div className="cal-head">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}>&lsaquo;</button>
          <div className="cal-month">{label}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCursor(new Date())}>{t('Today')}</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}>&rsaquo;</button>
          </div>
        </div>
        <div className="cal-dows">{DOW_ORDER.map((d) => <span key={d}>{t(d).slice(0, 3)}</span>)}</div>
        <div className="cal-grid">
          {cells.map((c, i) => (
            c === null ? <div className="cal-cell is-blank" key={'b' + i}></div> : (
              <div className={'cal-cell' + (c.dateStr === today ? ' is-today' : '')} key={c.dateStr}>
                <div className="cal-daynum">{c.day}</div>
                {c.events.map((e, j) => (
                  <div className="cal-ev" title={e.group.name + ' \u00b7 ' + e.time} key={j}>
                    <b>{e.time || '\u2014'}</b>{e.group.name}
                  </div>
                ))}
              </div>
            )
          ))}
        </div>
        <div className="cal-legend">
          {myGroups.length === 0 ? t('No group has been assigned to you yet.') : myGroups.map((g) => (
            <span key={g.code}>{g.name} {'\u2014'} {g.schedule || '\u2014'}</span>
          ))}
        </div>
      </div>
    </section>
  );
}
