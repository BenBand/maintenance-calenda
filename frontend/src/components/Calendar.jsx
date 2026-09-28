import { useMemo, useState } from 'react';
import {
  addDays, addMonths, buildHourRows, DAY_END_HOUR, DAY_START_HOUR, formatMonthYear,
  formatShortDate, formatTime, formatTimeRange, groupByDate, humanizeKey, isSameDay,
  minutesSinceMidnight, slotDurationMinutes, startOfDay, startOfWeek, toLocalDateKey,
} from '../utils/datetime';
import './schedule.css';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const HOUR_ROWS = buildHourRows(DAY_START_HOUR, DAY_END_HOUR);
const SNAP_MINUTES = 15;

/** A full 6-week grid (42 cells) so the month always has the same shape. */
function getMonthGrid(year, month) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const start = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function snap(minutes, step = SNAP_MINUTES) {
  return Math.round(minutes / step) * step;
}

function formatHourLabel(hour) {
  return `${String(hour).padStart(2, '0')}:00`;
}

/* ------------------------------------------------------------------ month */

function MonthView({ anchor, schedulesByDate, selectedDate, onSelectDate, conflictIds }) {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const cells = useMemo(() => getMonthGrid(year, month), [year, month]);
  const todayKey = toLocalDateKey(new Date());
  const monthIndex = anchor.getMonth();

  return (
    <div className="calendar__grid-wrap">
      <div className="calendar__weekdays" role="row">
        {DAYS.map((day) => <div className="calendar__weekday" key={day} role="columnheader">{day}</div>)}
      </div>
      <div className="calendar__grid" role="grid" aria-label={`${MONTHS[month]} ${year}`}>
        {cells.map((cell) => {
          const key = toLocalDateKey(cell);
          const dayEvents = schedulesByDate.get(key) || [];
          const isToday = key === todayKey;
          const isSelected = key === selectedDate;
          const isOutside = cell.getMonth() !== monthIndex;
          const hasConflict = dayEvents.some((event) => conflictIds.has(event.id));

          return (
            <button
              className={[
                'calendar-cell',
                isToday ? 'calendar-cell--today' : '',
                isSelected ? 'calendar-cell--selected' : '',
                isOutside ? 'calendar-cell--outside' : '',
              ].filter(Boolean).join(' ')}
              key={key}
              type="button"
              role="gridcell"
              aria-pressed={isSelected}
              aria-label={`${formatShortDate(cell)}, ${dayEvents.length} ${dayEvents.length === 1 ? 'slot' : 'slots'}`}
              onClick={() => onSelectDate(key)}
            >
              <span className="calendar-cell__number">{cell.getDate()}</span>
              {dayEvents.length > 0 && (
                <span className="calendar-cell__times" aria-hidden="true">
                  {dayEvents.slice(0, 3).map((event) => (
                    <span
                      className={`calendar-cell__time calendar-cell__time--${event.priority}${hasConflict && conflictIds.has(event.id) ? ' calendar-cell__time--conflict' : ''}`}
                      key={event.id}
                    >
                      {formatTime(event.scheduled_at)}
                    </span>
                  ))}
                  {dayEvents.length > 3 && <span className="calendar-cell__more">+{dayEvents.length - 3}</span>}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------- time grid views */

function TimeGrid({ dates, schedulesByDate, downtimeWindows, conflictIds, onSelectSlot }) {
  const todayKey = toLocalDateKey(new Date());
  const nowMinutes = (() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  })();

  return (
    <div className={`timegrid${dates.length === 1 ? ' timegrid--day' : ''}`}>
      {dates.length > 1 && (
        <div className="timegrid__header" role="row">
          <div className="timegrid__gutter-header" aria-hidden="true" />
          {dates.map((date) => {
            const key = toLocalDateKey(date);
            return (
              <div
                className={`timegrid__day-header${key === todayKey ? ' timegrid__day-header--today' : ''}`}
                key={key}
                role="columnheader"
              >
                <span className="timegrid__day-name">
                  {date.toLocaleDateString(undefined, { weekday: 'short' })}
                </span>
                <span className="timegrid__day-number">{date.getDate()}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="timegrid__body">
        <div className="timegrid__gutter" aria-hidden="true">
          {HOUR_ROWS.map((row) => (
            <div className="timegrid__hour" key={row.hour}>{row.label}</div>
          ))}
        </div>

        {dates.map((date) => {
          const key = toLocalDateKey(date);
          const daySchedules = schedulesByDate.get(key) || [];
          const dayWindows = downtimeWindows.filter((window) => {
            const start = new Date(window.starts_at);
            const end = new Date(window.ends_at);
            return start < addDays(date, 1) && end >= date;
          });

          return (
            <div className="timegrid__column" key={key} role="gridcell" aria-label={formatShortDate(date)}>
              {HOUR_ROWS.map((row) => (
                <div className="timegrid__cell" key={row.hour} />
              ))}

              {dayWindows.map((window) => {
                const start = minutesSinceMidnight(new Date(window.starts_at));
                const end = minutesSinceMidnight(new Date(window.ends_at));
                const span = Math.max(end - start, 30);
                return (
                  <div
                    className={`timegrid__downtime timegrid__downtime--${window.window_type}`}
                    key={`window-${window.id}`}
                    style={{ top: `${(start / 60) * 100}%`, height: `${(span / 60) * 100}%` }}
                    title={`${window.title}${window.reason ? ` — ${window.reason}` : ''}`}
                  >
                    <span className="timegrid__downtime-label">{window.title}</span>
                  </div>
                );
              })}

              {daySchedules.map((schedule) => {
                const start = minutesSinceMidnight(schedule.scheduled_at);
                const duration = slotDurationMinutes(schedule);
                const hasConflict = conflictIds.has(schedule.id);
                return (
                  <button
                    className={[
                      'timegrid__slot',
                      `timegrid__slot--${schedule.priority}`,
                      `timegrid__slot--${schedule.status}`,
                      hasConflict ? 'timegrid__slot--conflict' : '',
                    ].filter(Boolean).join(' ')}
                    key={schedule.id}
                    type="button"
                    style={{ top: `${(start / 60) * 100}%`, height: `${Math.max(duration / 60, 0.6)}%` }}
                    onClick={() => onSelectSlot(schedule)}
                    title={`${formatTimeRange(schedule.scheduled_at, schedule.scheduled_end)} — ${schedule.description || humanizeKey(schedule.asset_type)}`}
                  >
                    <span className="timegrid__slot-time">
                      {formatTimeRange(schedule.scheduled_at, schedule.scheduled_end)}
                    </span>
                    <span className="timegrid__slot-title">
                      {schedule.description || humanizeKey(schedule.asset_type)}
                    </span>
                    <span className="timegrid__slot-meta">
                      {schedule.room} · {schedule.technician}
                    </span>
                    {hasConflict && <span className="timegrid__slot-flag">Conflict</span>}
                  </button>
                );
              })}

              {key === todayKey && nowMinutes >= DAY_START_HOUR * 60 && nowMinutes <= DAY_END_HOUR * 60 && (
                <div
                  className="timegrid__now"
                  style={{ top: `${((nowMinutes - DAY_START_HOUR * 60) / 60) * 100}%` }}
                  aria-hidden="true"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ shell */

export default function Calendar({
  schedules = [],
  downtimeWindows = [],
  conflictIds = new Set(),
  technicianLoad = [],
  onSelectSlot,
  initialView = 'month',
  anchor: controlledAnchor,
  onAnchorChange,
  onSelectDateChange,
}) {
  const [internalView, setInternalView] = useState(initialView);
  const [internalAnchor, setInternalAnchor] = useState(() => startOfDay(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => toLocalDateKey(new Date()));

  const view = controlledAnchor !== undefined ? initialView : internalView;
  const anchor = controlledAnchor || internalAnchor;
  const setAnchor = (next) => {
    if (onAnchorChange) onAnchorChange(next);
    if (controlledAnchor === undefined) setInternalAnchor(next);
  };
  const setView = (next) => {
    if (controlledAnchor === undefined) setInternalView(next);
  };

  const schedulesByDate = useMemo(() => groupByDate(schedules), [schedules]);

  const handleSelectDate = (key) => {
    setSelectedDate(key);
    if (onSelectDateChange) onSelectDateChange(key);
  };

  const move = (direction) => {
    if (view === 'day') {
      setAnchor(addDays(anchor, direction));
    } else if (view === 'week') {
      setAnchor(addDays(anchor, direction * 7));
    } else {
      setAnchor(addMonths(anchor, direction));
    }
  };

  const jumpToToday = () => {
    const today = startOfDay(new Date());
    setAnchor(today);
    handleSelectDate(toLocalDateKey(today));
  };

  const gridDates = useMemo(() => {
    if (view === 'day') return [anchor];
    if (view === 'week') {
      const start = startOfWeek(anchor);
      return Array.from({ length: 7 }, (_, index) => addDays(start, index));
    }
    return [];
  }, [view, anchor]);

  const heading = view === 'day'
    ? anchor.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : view === 'week'
      ? `${formatShortDate(gridDates[0])} – ${formatShortDate(gridDates[6])}`
      : formatMonthYear(anchor);

  const selectedEvents = selectedDate ? (schedulesByDate.get(selectedDate) || []) : [];
  const selectedWindows = downtimeWindows.filter((window) => {
    const key = toLocalDateKey(window.starts_at);
    return key === selectedDate;
  });

  return (
    <div className="calendar">
      <div className="calendar__toolbar">
        <div className="calendar__nav">
          <button className="button button--secondary button--small" type="button" onClick={() => move(-1)} aria-label={`Previous ${view}`}>
            &larr;
          </button>
          <button className="button button--secondary button--small" type="button" onClick={jumpToToday}>Today</button>
          <button className="button button--secondary button--small" type="button" onClick={() => move(1)} aria-label={`Next ${view}`}>
            &rarr;
          </button>
        </div>

        <h2 className="calendar__title">{heading}</h2>

        <div className="calendar__views" role="group" aria-label="Calendar view">
          {['month', 'week', 'day'].map((option) => (
            <button
              className={`calendar__view-toggle${view === option ? ' calendar__view-toggle--active' : ''}`}
              key={option}
              type="button"
              aria-pressed={view === option}
              onClick={() => setView(option)}
            >
              {humanizeKey(option)}
            </button>
          ))}
        </div>
      </div>

      {view === 'month' ? (
        <MonthView
          anchor={anchor}
          schedulesByDate={schedulesByDate}
          selectedDate={selectedDate}
          onSelectDate={handleSelectDate}
          conflictIds={conflictIds}
        />
      ) : (
        <TimeGrid
          dates={gridDates}
          schedulesByDate={schedulesByDate}
          downtimeWindows={downtimeWindows}
          conflictIds={conflictIds}
          onSelectSlot={onSelectSlot || (() => {})}
        />
      )}

      {view === 'month' && selectedDate && (
        <section className="day-details" aria-labelledby="selected-date-title" aria-live="polite">
          <div className="day-details__header">
            <h3 className="day-details__title" id="selected-date-title">
              {formatShortDate(selectedDate)} · {selectedEvents.length} {selectedEvents.length === 1 ? 'slot' : 'slots'}
            </h3>
            <button
              className="day-details__close"
              type="button"
              onClick={() => handleSelectDate(null)}
              aria-label="Close selected date details"
            >
              &times;
            </button>
          </div>

          {selectedWindows.length > 0 && (
            <ul className="downtime-strip">
              {selectedWindows.map((window) => (
                <li className={`downtime-strip__item downtime-strip__item--${window.window_type}`} key={window.id}>
                  <span className="downtime-strip__time">{formatTimeRange(window.starts_at, window.ends_at)}</span>
                  <span>{window.title}</span>
                  {window.department && <span className="downtime-strip__dept">{window.department}</span>}
                </li>
              ))}
            </ul>
          )}

          {selectedEvents.length === 0 ? (
            <p className="empty-state">No slots booked on this day</p>
          ) : (
            <ul className="slot-list">
              {selectedEvents.map((event) => {
                const hasConflict = conflictIds.has(event.id);
                return (
                  <li key={event.id}>
                    <button
                      className={`slot-card${hasConflict ? ' slot-card--conflict' : ''}`}
                      type="button"
                      onClick={() => onSelectSlot && onSelectSlot(event)}
                    >
                      <span className="slot-card__time">
                        {formatTimeRange(event.scheduled_at, event.scheduled_end)}
                      </span>
                      <span className="slot-card__body">
                        <span className="slot-card__title">
                          {event.description || `${humanizeKey(event.asset_type)} - ${event.room}`}
                        </span>
                        <span className="slot-card__meta">
                          {event.department} ({event.room}) · {event.technician} · {humanizeKey(event.priority)}
                        </span>
                      </span>
                      <span className={`badge badge--status-${event.status}`}>{humanizeKey(event.status)}</span>
                      {hasConflict && <span className="slot-card__flag">Conflict</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {view !== 'month' && technicianLoad.length > 0 && (
        <section className="tech-load" aria-label="Technician load for the day">
          <h3 className="subsection__title">Technician load</h3>
          <ul className="tech-load__list">
            {technicianLoad.map((entry) => (
              <li className="tech-load__item" key={entry.technician}>
                <span className="tech-load__name">{entry.technician}</span>
                <span className="tech-load__value">
                  {entry.bookings} bookings · {entry.booked_hours}h
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export { SNAP_MINUTES, snap, getMonthGrid, isSameDay, MONTHS, DAYS };
