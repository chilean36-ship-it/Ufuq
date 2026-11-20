import { useMemo, useState } from 'react';
import { usePanel } from '../../components/panel/PanelContext';
import PageStyle from '../../components/PageStyle';
import { DOW_ORDER, MONTH_KEYS, fmtDateStr } from '../../lib/panelUtils';
import { useExamDays } from '../../lib/examDays';
import { lessonsOnLocalDate } from '../../lib/tzTime';

const css = `
  .wk{ display:grid; gap:14px; }
  .wk-bar{ display:flex; align-items:center; gap:10px; }
  .wk-nav{ flex:none; width:38px; height:38px; border-radius:12px; border:1px solid var(--line); background:var(--bg-3); color:var(--text); font-size:20px; line-height:1; cursor:pointer; display:grid; place-items:center; transition:border-color .15s, transform .15s; }
  .wk-nav:hover{ border-color:var(--gold); } .wk-nav:active{ transform:scale(.94); }
  .wk-range{ flex:1; min-width:0; text-align:center; }
  .wk-range b{ display:block; font-family:'Fraunces',serif; font-size:19px; font-weight:600; line-height:1.2; }
  .wk-range small{ display:block; margin-top:2px; font-size:12px; color:var(--text-muted); }
  .wk-today{ flex:none; padding:0 14px; height:38px; border-radius:12px; border:1px solid var(--gold); background:var(--gold-dim); color:var(--gold-bright); font:700 13px inherit; font-family:inherit; cursor:pointer; }
  .wk-grid{ display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:10px; align-items:stretch; }
  .wk-day{ display:flex; flex-direction:column; gap:8px; min-height:150px; padding:10px; border-radius:16px; border:1px solid var(--line); background:var(--bg-3); }
  .wk-day.is-today{ border-color:var(--gold); background:linear-gradient(180deg,var(--gold-dim),var(--bg-3) 70%); box-shadow:0 12px 28px -18px rgba(201,162,75,.8); }
  .wk-day.is-past{ opacity:.72; }
  .wk-dh{ display:flex; align-items:baseline; gap:6px; }
  .wk-dn{ font-family:'Fraunces',serif; font-size:24px; font-weight:600; line-height:1; }
  .wk-dw{ font-size:11px; font-weight:800; letter-spacing:.09em; text-transform:uppercase; color:var(--text-muted); }
  .wk-day.is-today .wk-dn, .wk-day.is-today .wk-dw{ color:var(--gold-bright); }
  .wk-ev{ display:grid; gap:2px; padding:7px 9px; border-radius:11px; background:var(--bg-2); border-inline-start:3px solid var(--gold); min-width:0; }
  .wk-ev b{ font-size:14px; font-variant-numeric:tabular-nums; color:var(--gold-bright); line-height:1.2; }
  .wk-ev span{ font-size:12.5px; color:var(--text); overflow-wrap:anywhere; line-height:1.3; }
  .wk-ev.is-exam{ border-inline-start-color:#E0A53A; background:rgba(224,165,58,.13); } .wk-ev.is-exam b{ color:#E0A53A; }
  .wk-none{ margin:auto 0; text-align:center; font-size:12px; color:var(--text-muted); opacity:.7; }
  @media (max-width:860px){
    .wk-grid{ grid-template-columns:1fr; gap:8px; }
    .wk-day{ flex-direction:row; align-items:stretch; gap:12px; min-height:0; padding:10px 12px; }
    .wk-dh{ flex:none; width:58px; flex-direction:column; align-items:center; justify-content:center; gap:4px; border-radius:12px; background:var(--bg-2); padding:8px 0; }
    .wk-day.is-today .wk-dh{ background:var(--gold); } .wk-day.is-today .wk-dh .wk-dn, .wk-day.is-today .wk-dh .wk-dw{ color:#171717; }
    .wk-evs{ flex:1; min-width:0; display:grid; gap:6px; align-content:center; }
    .wk-ev{ grid-template-columns:auto 1fr; align-items:center; gap:4px 10px; }
    .wk-none{ margin:0; text-align:start; }
  }
`;

/** Every lesson on one calendar date (viewer's own zone, converted from Tashkent time for that exact date, so DST
 *  changes are handled per date) across ALL of the teacher's groups. */
function lessonsOnDate(myGroups, y, m, day, examDaysBy) {
  const out = [];
  myGroups.forEach((g) => {
    if (!g.is_active || !Array.isArray(g.schedule_days)) return;
    lessonsOnLocalDate(g.schedule_days, y, m, day, examDaysBy[g.code]).forEach((l) => out.push({ group: g, time: l.time, instant: l.instant }));
  });
  out.sort((a, b) => a.instant - b.instant);
  // exam days: the exam stands where the lesson was
  const dateStr = fmtDateStr(new Date(y, m, day));
  myGroups.forEach((g) => { if (g.is_active && (examDaysBy[g.code] || []).indexOf(dateStr) >= 0) out.push({ group: g, time: null, exam: true }); });
  return out;
}

export default function CalendarPage() {
  const { t, myGroups } = usePanel();
  const [offset, setOffset] = useState(0);   // weeks from this week
  const examDaysBy = useExamDays();   // an exam day replaces that group's lesson

  const { days, title, sub, todayStr } = useMemo(() => {
    const now = new Date();
    const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) + offset * 7);
    const list = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i);
      list.push({ d, dateStr: fmtDateStr(d), dow: DOW_ORDER[i], events: lessonsOnDate(myGroups, d.getFullYear(), d.getMonth(), d.getDate(), examDaysBy) });
    }
    const last = list[6].d;
    const sameMonth = mon.getMonth() === last.getMonth();
    const ttl = sameMonth ? mon.getDate() + ' – ' + last.getDate() + ' ' + t(MONTH_KEYS[mon.getMonth()]) : mon.getDate() + ' ' + t(MONTH_KEYS[mon.getMonth()]).slice(0, 3) + ' – ' + last.getDate() + ' ' + t(MONTH_KEYS[last.getMonth()]).slice(0, 3);
    return { days: list, title: ttl, sub: mon.getFullYear() === last.getFullYear() ? String(mon.getFullYear()) : mon.getFullYear() + ' / ' + last.getFullYear(), todayStr: fmtDateStr(now) };
  }, [offset, myGroups, t, examDaysBy]);

  return (
    <section className="page active" id="page-calendar">
      <PageStyle css={css} />
      <div className="page-head">
        <h2>{t('Calendar')}</h2>
      </div>
      <div className="panel wk">
        <div className="wk-bar">
          <button type="button" className="wk-nav" aria-label={t('Previous week')} onClick={() => setOffset((o) => o - 1)}>&lsaquo;</button>
          <div className="wk-range"><b>{title}</b><small>{offset === 0 ? t('This week') + ' · ' + sub : sub}</small></div>
          {offset !== 0 && <button type="button" className="wk-today" onClick={() => setOffset(0)}>{t('Today')}</button>}
          <button type="button" className="wk-nav" aria-label={t('Next week')} onClick={() => setOffset((o) => o + 1)}>&rsaquo;</button>
        </div>
        <div className="wk-grid">
          {days.map((c) => (
            <div className={'wk-day' + (c.dateStr === todayStr ? ' is-today' : '') + (c.dateStr < todayStr ? ' is-past' : '')} key={c.dateStr}>
              <div className="wk-dh"><span className="wk-dw">{t(c.dow).slice(0, 3)}</span><span className="wk-dn">{c.d.getDate()}</span></div>
              <div className="wk-evs">
                {c.events.length === 0 ? <div className="wk-none">{t('No lessons')}</div> : c.events.map((e, j) => (
                  <div className={'wk-ev' + (e.exam ? ' is-exam' : '')} title={e.group.name + ' · ' + (e.exam ? t('Exam') : e.time)} key={j}>
                    <b>{e.exam ? t('Exam') : (e.time || '—')}</b><span>{e.group.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
