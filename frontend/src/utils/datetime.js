/**
 * Date and time helpers for scheduling.
 *
 * The API stores `scheduled_at` as a TIMESTAMPTZ. Everything here works in the
 * browser's local zone so a technician booking 09:00 sees 09:00, and always
 * reads the timestamp from `scheduled_at` rather than the legacy `date` column
 * (which carries no time of day).
 */

export const MINUTES_PER_DAY = 24 * 60;

export const DEFAULT_SLOT_MINUTES = 60;
export const DAY_START_HOUR = 6;
export const DAY_END_HOUR = 20;

export function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Local calendar date as YYYY-MM-DD. Avoids toISOString(), which is UTC. */
export function toLocalDateKey(value) {
  const date = toDate(value);
  if (!date) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function startOfDay(value) {
  const date = toDate(value) || new Date();
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(value, days) {
  const date = startOfDay(value);
  date.setDate(date.getDate() + days);
  return date;
}

export function addMonths(value, months) {
  const date = startOfDay(value);
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  return date;
}

/** Monday-based start of week, matching the calendar's week layout. */
export function startOfWeek(value) {
  const date = startOfDay(value);
  const dayOfWeek = (date.getDay() + 6) % 7;
  return addDays(date, -dayOfWeek);
}

export function isSameDay(a, b) {
  return toLocalDateKey(a) === toLocalDateKey(b);
}

export function formatTime(value) {
  const date = toDate(value);
  if (!date) return '';
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatTimeRange(start, end) {
  const from = formatTime(start);
  if (!from) return '';
  const to = formatTime(end);
  return to ? `${from} - ${to}` : from;
}

export function formatDateLabel(value) {
  const date = toDate(value);
  if (!date) return '';
  return date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

export function formatShortDate(value) {
  const date = toDate(value);
  if (!date) return '';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatMonthYear(value) {
  const date = toDate(value) || new Date();
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/**
 * "09:00 - 10:30" for a booked slot, falling back to the start time alone when
 * the schedule has no end time (older rows predate `duration_minutes`).
 */
export function formatSlotRange(start, end) {
  return formatTimeRange(start, end);
}

export function formatMinutes(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours && mins) return `${hours}h ${mins}m`;
  if (hours) return `${hours}h`;
  return `${mins}m`;
}

export function formatHours(minutes) {
  return formatMinutes(Number(minutes || 0) / 60);
}

export function formatCurrency(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '-';
  return `ZMW ${amount.toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatCompactCurrency(value) {
  const amount = Number(value) || 0;
  if (amount >= 1_000_000) return `ZMW ${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `ZMW ${(amount / 1_000).toFixed(0)}k`;
  return `ZMW ${amount.toFixed(0)}`;
}

export function formatPercent(value, digits = 1) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '-';
  return `${amount.toFixed(digits)}%`;
}

/** Minutes since local midnight, used to position a slot on the hour grid. */
export function minutesSinceMidnight(value) {
  const date = toDate(value);
  if (!date) return 0;
  return date.getHours() * 60 + date.getMinutes();
}

/** The slot's length, preferring the server-computed end over duration. */
export function slotDurationMinutes(schedule) {
  if (schedule?.scheduled_end) {
    const start = toDate(schedule.scheduled_at);
    const end = toDate(schedule.scheduled_end);
    if (start && end) {
      const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
      if (minutes > 0) return minutes;
    }
  }
  const duration = Number(schedule?.duration_minutes);
  if (Number.isFinite(duration) && duration > 0) return duration;
  return DEFAULT_SLOT_MINUTES;
}

/** A `datetime-local` input value (local wall time, no zone suffix). */
export function toDateTimeLocalInput(value) {
  const date = toDate(value);
  if (!date) return '';
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 16);
}

/** Inverse of toDateTimeLocalInput. */
export function fromDateTimeLocalInput(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** A `date` input value. */
export function toDateInput(value) {
  return toLocalDateKey(value) || '';
}

export function fromDateInput(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

/** Whole hours a day is split into, for the time grid. */
export function buildHourRows(startHour = DAY_START_HOUR, endHour = DAY_END_HOUR) {
  const rows = [];
  for (let hour = startHour; hour < endHour; hour += 1) {
    rows.push({
      hour,
      label: `${String(hour).padStart(2, '0')}:00`,
    });
  }
  return rows;
}

/** Bucket schedules by local calendar date, sorted by start time. */
export function groupByDate(schedules) {
  const map = new Map();
  (schedules || []).forEach((schedule) => {
    const key = toLocalDateKey(schedule.scheduled_at || schedule.date);
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(schedule);
  });
  map.forEach((list) => {
    list.sort((a, b) => new Date(a.scheduled_at || 0) - new Date(b.scheduled_at || 0));
  });
  return map;
}

export function humanizeKey(value) {
  if (!value) return '-';
  return String(value).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}
