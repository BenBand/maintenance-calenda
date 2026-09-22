import { useMemo, useState } from 'react';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function getCalendarDays(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days = [];
  for (let i = 0; i < firstDay.getDay(); i += 1) days.push(null);
  for (let day = 1; day <= lastDay.getDate(); day += 1) days.push(day);
  return days;
}

function formatDateLabel(year, month, day) {
  return new Intl.DateTimeFormat('en', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(year, month, day - 1));
}

export default function Calendar({ schedules }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const calendarDays = useMemo(() => getCalendarDays(year, month), [year, month]);
  const today = new Date().toISOString().split('T')[0];

  const schedulesByDate = useMemo(() => {
    const map = {};
    (schedules || []).forEach((schedule) => {
      const date = schedule.date.split('T')[0];
      if (!map[date]) map[date] = [];
      map[date].push(schedule);
    });
    return map;
  }, [schedules]);

  const selectedEvents = selectedDate ? (schedulesByDate[selectedDate] || []) : [];
  const moveMonth = (offset) => setCurrentDate(new Date(year, month + offset, 1));

  return (
    <div className="calendar">
      <div className="calendar__header">
        <h2 className="calendar__title">{MONTHS[month]} {year}</h2>
        <div className="calendar__nav">
          <button className="button button--secondary button--small" type="button" onClick={() => moveMonth(-1)} aria-label="Previous month">Prev</button>
          <button className="button button--secondary button--small" type="button" onClick={() => setCurrentDate(new Date())}>Today</button>
          <button className="button button--primary button--small" type="button" onClick={() => moveMonth(1)} aria-label="Next month">Next month</button>
        </div>
      </div>

      <div className="calendar__scroll" aria-label="Month calendar">
        <div className="calendar__grid">
          {DAYS.map((day) => <div className="calendar__day-header" key={day} role="columnheader">{day}</div>)}
          {calendarDays.map((day, index) => {
            const date = day ? `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null;
            const dayEvents = date ? (schedulesByDate[date] || []) : [];
            const isToday = date === today;
            const isSelected = date === selectedDate;
            const className = [
              'calendar__day',
              isToday ? 'calendar__day--today' : '',
              isSelected ? 'calendar__day--selected' : '',
            ].filter(Boolean).join(' ');

            return (
              <button
                className={className}
                key={`${date || 'empty'}-${index}`}
                type="button"
                disabled={!day}
                aria-pressed={isSelected}
                aria-label={day ? `${formatDateLabel(year, month, day)}, ${dayEvents.length} maintenance ${dayEvents.length === 1 ? 'item' : 'items'}` : undefined}
                onClick={() => date && setSelectedDate(date)}
              >
                {day && (
                  <>
                    <span className="calendar__day-number">{day}</span>
                    {dayEvents.length > 0 && (
                      <span className="calendar__markers" aria-hidden="true">
                        {dayEvents.slice(0, 3).map((event) => <span className={`calendar__marker calendar__marker--${event.priority}`} key={event.id} />)}
                        {dayEvents.length > 3 && <span className="calendar__more">+{dayEvents.length - 3}</span>}
                      </span>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selectedDate && (
        <section className="day-details" aria-labelledby="selected-date-title" aria-live="polite">
          <div className="day-details__header">
            <h3 className="day-details__title" id="selected-date-title">{selectedDate}</h3>
            <button className="day-details__close" type="button" onClick={() => setSelectedDate(null)} aria-label="Close selected date details">&times;</button>
          </div>
          {selectedEvents.length === 0 ? <p className="empty-state">No events scheduled</p> : (
            <div className="event-list">
              {selectedEvents.map((event) => (
                <article className="event-card" key={event.id}>
                  <div className="event-item__title">{event.description || `${event.asset_type} - ${event.room}`}</div>
                  <div className="event-item__meta">Technician: {event.technician} | Priority: {event.priority}</div>
                  <div className="event-item__meta">Status: {event.status}</div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
