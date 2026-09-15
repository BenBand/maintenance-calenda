import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../services/auth';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function getCalendarDays(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPadding = firstDay.getDay();
  const days = [];
  for (let i = 0; i < startPadding; i++) days.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(d);
  return days;
}

export default function Calendar({ schedules }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const calendarDays = useMemo(() => getCalendarDays(year, month), [year, month]);

  const schedulesByDate = useMemo(() => {
    const map = {};
    (schedules || []).forEach((s) => {
      const d = s.date.split('T')[0];
      if (!map[d]) map[d] = [];
      map[d].push(s);
    });
    return map;
  }, [schedules]);

  const today = new Date().toISOString().split('T')[0];

  const events = selectedDate ? (schedulesByDate[selectedDate] || []) : [];

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  return (
    <div>
      <div style={styles.header}>
        <h2 style={styles.heading}>
          {MONTHS[month]} {year}
        </h2>
        <div style={styles.navBtns}>
          <button style={styles.navBtn} onClick={prevMonth}>&lt; Prev</button>
          <button style={styles.navBtn} onClick={() => setCurrentDate(new Date())}>Today</button>
          <button style={styles.navBtn} onClick={nextMonth}>Next &gt;</button>
        </div>
      </div>
      <div style={styles.calendar}>
        {DAYS.map((d) => (
          <div key={d} style={styles.dayHeader}>{d}</div>
        ))}
        {calendarDays.map((day, idx) => {
          const dateStr = day ? `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null;
          const dayEvents = dateStr ? (schedulesByDate[dateStr] || []) : [];
          const isToday = dateStr === today;
          const isSelected = dateStr === selectedDate;
          return (
            <div
              key={idx}
              style={{
                ...styles.dayCell,
                ...(isToday ? styles.today : {}),
                ...(isSelected ? styles.selectedDay : {}),
              }}
              onClick={() => dateStr && setSelectedDate(dateStr)}
            >
              {day && (
                <>
                  <span style={styles.dayNumber}>{day}</span>
                  {dayEvents.length > 0 && (
                    <div style={styles.eventMarkers}>
                      {dayEvents.slice(0, 3).map((ev) => (
                        <span key={ev.id} style={{
                          ...styles.eventDot,
                          backgroundColor: ev.priority === 'critical' ? '#dc2626' : ev.priority === 'high' ? '#F97316' : '#2563eb',
                        }} title={ev.description || ev.asset_type} />
                      ))}
                      {dayEvents.length > 3 && <span style={styles.moreText}>+{dayEvents.length - 3}</span>}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
      {selectedDate && (
        <div style={styles.dayDetails}>
          <div style={styles.dayDetailsHeader}>
            <h3 style={styles.dayDetailsTitle}>{selectedDate}</h3>
            <button style={styles.closeBtn} onClick={() => setSelectedDate(null)}>X</button>
          </div>
          {events.length === 0 ? (
            <p style={styles.emptyText}>No events scheduled</p>
          ) : (
            events.map((ev) => (
              <div key={ev.id} style={styles.eventCard}>
                <div style={styles.eventTitle}>{ev.description || `${ev.asset_type} - ${ev.room}`}</div>
                <div style={styles.eventMeta}>Technician: {ev.technician} | Priority: {ev.priority}</div>
                <div style={styles.eventMeta}>Status: {ev.status}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
  heading: { margin: 0, fontSize: '22px', color: '#1f2937' },
  navBtns: { display: 'flex', gap: '8px' },
  navBtn: { padding: '8px 14px', backgroundColor: '#fff', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' },
  calendar: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '24px' },
  dayHeader: { textAlign: 'center', padding: '8px', fontSize: '12px', fontWeight: '600', color: '#6b7280' },
  dayCell: { minHeight: '80px', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '6px', cursor: 'pointer', backgroundColor: '#fff', transition: 'border-color 0.15s' },
  today: { borderColor: '#F97316', backgroundColor: '#fff7ed' },
  selectedDay: { borderColor: '#F97316', backgroundColor: '#fff7ed', boxShadow: '0 0 0 2px #F97316' },
  dayNumber: { fontSize: '14px', fontWeight: '500', color: '#1f2937' },
  eventMarkers: { display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: '4px' },
  eventDot: { width: '8px', height: '8px', borderRadius: '50%' },
  moreText: { fontSize: '10px', color: '#6b7280' },
  dayDetails: { backgroundColor: '#fff', borderRadius: '8px', padding: '16px', border: '1px solid #e5e7eb', marginTop: '16px' },
  dayDetailsHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  dayDetailsTitle: { margin: 0, fontSize: '18px', color: '#1f2937' },
  closeBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#6b7280' },
  emptyText: { color: '#6b7280' },
  eventCard: { padding: '10px', borderBottom: '1px solid #f3f4f6', backgroundColor: '#f9fafb', borderRadius: '6px', marginBottom: '8px' },
  eventTitle: { fontWeight: '600', color: '#1f2937', fontSize: '14px' },
  eventMeta: { fontSize: '12px', color: '#6b7280' },
};
