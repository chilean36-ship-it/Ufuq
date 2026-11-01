import { useEffect, useRef, useState } from 'react';
import { CalendarIcon } from './ui';
import { usePanel } from './PanelContext';
import {
  DOW_ORDER, MONTH_KEYS, allowedDaysLabel, allowedWeekdaysForGroup, fmtDateStr, humanDate, parseDateStr, todayStr,
} from '../../lib/panelUtils';

/**
 * Attendance date picker (port of #attDatePicker). The visible field is read-only: a date is only ever chosen from
 * the calendar, and the calendar disables every weekday the selected group has no class on, so an attendance
 * session can't be opened on a non-class day. Month and weekday names come from the active language.
 */
export default function DatePicker({ value, group, onPick }) {
  const { t } = usePanel();
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => parseDateStr(value || todayStr()));
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      const path = e.composedPath ? e.composedPath() : [];
      if (rootRef.current && !path.includes(rootRef.current)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('click', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('click', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const toggle = () => {
    if (open) { setOpen(false); return; }
    setCursor(parseDateStr(value || todayStr()));
    setOpen(true);
  };

  const allowed = allowedWeekdaysForGroup(group);
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const lead = (new Date(year, month, 1).getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = todayStr();
  const label = allowedDaysLabel(group, t);

  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(<button type="button" key={'b' + i} className="date-cal-day is-blank" disabled></button>);
  for (let day = 1; day <= daysInMonth; day++) {
    const str = fmtDateStr(new Date(year, month, day));
    const ok = allowed === null || !!allowed[new Date(year, month, day).getDay()];
    const cls = ['date-cal-day'];
    if (str === value) cls.push('is-selected');
    if (str === today) cls.push('is-today');
    cells.push(
      <button type="button" key={str} className={cls.join(' ')} data-date={str} disabled={!ok}
              onClick={() => { setOpen(false); onPick(str); }}>{day}</button>
    );
  }

  return (
    <div className="date-picker" id="attDatePicker" ref={rootRef}>
      <input type="hidden" id="attDate" value={value || ''} readOnly />
      <input type="text" id="attDateDisplay" readOnly tabIndex={-1} aria-live="polite" value={humanDate(value, t)} />
      <button type="button" className="date-picker-btn" id="attDateBtn" aria-label={t('Pick a date')} aria-haspopup="dialog"
              aria-expanded={open ? 'true' : 'false'} onClick={toggle}>
        <CalendarIcon />
      </button>
      <div className="date-cal" id="attDateCal" role="dialog" aria-modal="false" hidden={!open}>
        <div className="date-cal-head">
          <button type="button" className="date-cal-nav" aria-label={t('Previous month')}
                  onClick={() => setCursor(new Date(year, month - 1, 1))}>&lsaquo;</button>
          <span className="date-cal-title" id="attCalTitle">{t(MONTH_KEYS[month]) + ' ' + year}</span>
          <button type="button" className="date-cal-nav" aria-label={t('Next month')}
                  onClick={() => setCursor(new Date(year, month + 1, 1))}>&rsaquo;</button>
        </div>
        <div className="date-cal-dows" id="attCalDows">{DOW_ORDER.map((d) => <span key={d}>{t(d).slice(0, 2)}</span>)}</div>
        <div className="date-cal-grid" id="attCalGrid">{cells}</div>
        <p className="date-cal-note" id="attCalNote">{label ? (t('Class days for this group:') + ' ' + label + '.') : ''}</p>
      </div>
    </div>
  );
}
