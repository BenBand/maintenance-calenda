import { useEffect, useId, useMemo, useState } from 'react';
import {
  DAY_END_HOUR, DAY_START_HOUR, formatTimeRange, fromDateTimeLocalInput,
  slotDurationMinutes, toDateTimeLocalInput, toLocalDateKey,
} from '../utils/datetime';

const ASSET_TYPES = ['laptop', 'desktop', 'network_equipment', 'printer'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const STATUSES = ['scheduled', 'in_progress', 'completed', 'cancelled', 'overdue'];
const RECURRENCE_FREQUENCIES = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual', label: 'Annually' },
];

const DURATION_OPTIONS = [30, 45, 60, 90, 120, 180, 240, 480];

/**
 * Half-hour slot picker. Renders the hours of the selected day and marks the
 * ones already taken by the chosen technician or blocked by a downtime window,
 * so a slot is chosen with its conflicts visible rather than discovered on save.
 */
function SlotPicker({ day, start, durationMinutes, technician, availability, onPick, selectedStart }) {
  const slots = useMemo(() => {
    const out = [];
    for (let hour = DAY_START_HOUR; hour < DAY_END_HOUR; hour += 1) {
      out.push({ hour, label: `${String(hour).padStart(2, '0')}:00` });
      out.push({ hour, label: `${String(hour).padStart(2, '0')}:30` });
    }
    return out;
  }, []);

  if (!day) return null;

  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const booked = (availability?.schedules || []).filter((schedule) => {
    if (schedule.status === 'cancelled') return false;
    if (technician && schedule.technician !== technician) return false;
    const startsAt = new Date(schedule.scheduled_at);
    const endsAt = new Date(schedule.scheduled_end || startsAt.getTime() + slotDurationMinutes(schedule) * 60000);
    return endsAt > dayStart && startsAt < dayEnd;
  });

  const windows = (availability?.downtime_windows || []).filter((window) => {
    const startsAt = new Date(window.starts_at);
    const endsAt = new Date(window.ends_at);
    return endsAt > dayStart && startsAt < dayEnd;
  });

  const conflictsFor = (minutes) => {
    const slotStart = dayStart.getTime() + minutes * 60000;
    const slotEnd = slotStart + durationMinutes * 60000;

    const blocked = windows.find((window) => (
      new Date(window.starts_at) < new Date(slotEnd) && new Date(window.ends_at) > new Date(slotStart)
    ));
    if (blocked) return { state: 'blocked', title: `Blocked by "${blocked.title}"` };

    const clash = booked.find((schedule) => {
      const startsAt = new Date(schedule.scheduled_at);
      const endsAt = new Date(schedule.scheduled_end || startsAt.getTime() + slotDurationMinutes(schedule) * 60000);
      return startsAt < new Date(slotEnd) && endsAt > new Date(slotStart);
    });
    if (clash) {
      return {
        state: 'busy',
        title: `Busy: ${clash.technician} ${formatTimeRange(clash.scheduled_at, clash.scheduled_end)} (${clash.room})`,
      };
    }
    return { state: 'free', title: 'Available' };
  };

  return (
    <div className="slot-picker">
      <span className="field-label" id="slot-picker-label">Available start times</span>
      <div className="slot-picker__grid" role="group" aria-labelledby="slot-picker-label">
        {slots.map((slot) => {
          const minutes = slot.hour * 60 + (slot.label.endsWith('30') ? 30 : 0);
          if (minutes + durationMinutes > DAY_END_HOUR * 60) return null;
          const { state, title } = conflictsFor(minutes);
          const iso = new Date(dayStart.getTime() + minutes * 60000).toISOString();
          const isSelected = selectedStart && new Date(selectedStart).getTime() === new Date(iso).getTime();

          return (
            <button
              className={[
                'slot-picker__option',
                state === 'busy' ? 'slot-picker__option--busy' : '',
                state === 'blocked' ? 'slot-picker__option--blocked' : '',
                isSelected ? 'slot-picker__option--selected' : '',
              ].filter(Boolean).join(' ')}
              key={slot.label}
              type="button"
              disabled={state === 'busy' || state === 'blocked'}
              title={title}
              aria-label={`${slot.label} — ${title}`}
              onClick={() => onPick(iso)}
            >
              {slot.label}
            </button>
          );
        })}
      </div>
      {windows.length > 0 && (
        <p className="field-hint">
          {windows.length} downtime window{windows.length === 1 ? '' : 's'} affect this day.
        </p>
      )}
    </div>
  );
}

export default function MaintenanceForm({
  initialData,
  prefill,
  availability,
  onSubmit,
  onCancel,
  submitLabel,
  loading = false,
}) {
  const initialScheduledAt = initialData?.scheduled_at || prefill?.scheduled_at || initialData?.date || '';
  const [form, setForm] = useState({
    scheduled_at: toDateTimeLocalInput(initialScheduledAt),
    department: initialData?.department || '',
    room: initialData?.room || '',
    asset_type: initialData?.asset_type || 'laptop',
    asset_identifier: initialData?.asset_identifier || '',
    asset_id: initialData?.asset_id || '',
    description: initialData?.description || '',
    technician: initialData?.technician || '',
    technician_user_id: initialData?.technician_user_id || '',
    priority: initialData?.priority || 'medium',
    reminder_days: initialData?.reminder_days ?? '1',
    status: initialData?.status || 'scheduled',
    duration_minutes: String(initialData?.duration_minutes || 60),
    estimated_cost: initialData?.estimated_cost ?? '',
    recurrence_frequency: initialData?.recurrence_rule || 'none',
    recurrence_interval: String(initialData?.recurrence_interval || 1),
    recurrence_end_at: toDateTimeLocalInput(initialData?.recurrence_end),
  });
  const [errors, setErrors] = useState({});
  const formId = useId();

  // Keep the technician account link in step with the free-text name so
  // workload reporting can attribute the slot to a person.
  useEffect(() => {
    if (form.technician_user_id) return;
    const match = (availability?.schedules || []).find(
      (schedule) => schedule.technician === form.technician && schedule.technician_username,
    );
    if (match?.technician_user_id) {
      setForm((current) => ({ ...current, technician_user_id: String(match.technician_user_id) }));
    }
  }, [form.technician, form.technician_user_id, availability]);

  const selectedDate = form.scheduled_at ? toLocalDateKey(new Date(form.scheduled_at)) : null;
  const durationMinutes = Number(form.duration_minutes) || 60;

  const handleChange = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (errors[field]) {
      setErrors((current) => {
        const next = { ...current };
        delete next[field];
        return next;
      });
    }
  };

  const handlePickSlot = (iso) => {
    // Rebuild the local wall-clock string from the picked instant so the
    // datetime-local input shows exactly the slot that was clicked.
    handleChange('scheduled_at', toDateTimeLocalInput(iso));
  };

  const validate = () => {
    const next = {};
    if (!form.scheduled_at) next.scheduled_at = 'Date and time are required';
    if (!form.department.trim()) next.department = 'Department is required';
    if (form.department.length > 255) next.department = 'Must be 255 characters or fewer';
    if (!form.room.trim()) next.room = 'Room is required';
    if (form.room.length > 255) next.room = 'Must be 255 characters or fewer';
    if (!form.technician.trim()) next.technician = 'Technician is required';
    if (form.technician.length > 255) next.technician = 'Must be 255 characters or fewer';
    if (form.asset_identifier.length > 255) next.asset_identifier = 'Must be 255 characters or fewer';
    if (form.description.length > 2000) next.description = 'Must be 2000 characters or fewer';
    if (durationMinutes < 15 || durationMinutes > 1440) next.duration_minutes = 'Duration must be between 15 and 1440 minutes';
    if (form.estimated_cost !== '' && Number(form.estimated_cost) < 0) next.estimated_cost = 'Cost cannot be negative';
    if (form.recurrence_frequency !== 'none') {
      if (Number(form.recurrence_interval) < 1) next.recurrence_interval = 'Interval must be at least 1';
      if (form.recurrence_end_at && form.recurrence_end_at <= form.scheduled_at) {
        next.recurrence_end_at = 'Repeat must end after the first slot';
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!validate()) return;

    const scheduledAt = fromDateTimeLocalInput(form.scheduled_at);
    const recurrenceEndAt = fromDateTimeLocalInput(form.recurrence_end_at);

    onSubmit({
      scheduled_at: scheduledAt,
      // `date` is retained for the legacy column the API still accepts.
      date: scheduledAt,
      department: form.department.trim(),
      room: form.room.trim(),
      asset_type: form.asset_type,
      asset_identifier: form.asset_identifier.trim() || null,
      asset_id: form.asset_id || null,
      description: form.description.trim() || null,
      technician: form.technician.trim(),
      technician_user_id: form.technician_user_id || null,
      priority: form.priority,
      reminder_days: form.reminder_days === '' ? null : Number(form.reminder_days),
      status: form.status,
      duration_minutes: durationMinutes,
      estimated_cost: form.estimated_cost === '' ? null : Number(form.estimated_cost),
      recurrence_rule: form.recurrence_frequency,
      recurrence_interval: form.recurrence_frequency === 'none' ? null : Number(form.recurrence_interval) || 1,
      recurrence_end: recurrenceEndAt,
      recurrence_end_at: recurrenceEndAt,
    });
  };

  const fieldClass = (field) => `input${errors[field] ? ' input--error' : ''}`;
  const errorId = (field) => `${formId}-${field}-error`;

  return (
    <form className="form-stack" onSubmit={handleSubmit} aria-busy={loading}>
      <fieldset className="form-section">
        <legend className="form-section__legend">When</legend>
        <div className="form-row">
          <div className="form-field">
            <label className="field-label" htmlFor={`${formId}-scheduled-at`}>Start date and time *</label>
            <input
              className={fieldClass('scheduled_at')}
              id={`${formId}-scheduled-at`}
              type="datetime-local"
              value={form.scheduled_at}
              onChange={(e) => handleChange('scheduled_at', e.target.value)}
              required
              aria-invalid={Boolean(errors.scheduled_at)}
              aria-describedby={errors.scheduled_at ? errorId('scheduled_at') : undefined}
            />
            {errors.scheduled_at && <span className="error-text" id={errorId('scheduled_at')}>{errors.scheduled_at}</span>}
          </div>
          <div className="form-field">
            <label className="field-label" htmlFor={`${formId}-duration`}>Duration</label>
            <select
              className={fieldClass('duration_minutes')}
              id={`${formId}-duration`}
              value={form.duration_minutes}
              onChange={(e) => handleChange('duration_minutes', e.target.value)}
              aria-invalid={Boolean(errors.duration_minutes)}
            >
              {DURATION_OPTIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes < 60 ? `${minutes} min` : `${minutes / 60} hour${minutes === 60 ? '' : 's'}`}
                </option>
              ))}
            </select>
            {errors.duration_minutes && <span className="error-text">{errors.duration_minutes}</span>}
          </div>
        </div>

        {selectedDate && availability && (
          <SlotPicker
            day={new Date(form.scheduled_at)}
            start={form.scheduled_at}
            durationMinutes={durationMinutes}
            technician={form.technician}
            availability={availability}
            selectedStart={fromDateTimeLocalInput(form.scheduled_at)}
            onPick={handlePickSlot}
          />
        )}
      </fieldset>

      <fieldset className="form-section">
        <legend className="form-section__legend">Where and what</legend>
        <div className="form-row">
          <div className="form-field">
            <label className="field-label" htmlFor={`${formId}-department`}>Department *</label>
            <input
              className={fieldClass('department')}
              id={`${formId}-department`}
              type="text"
              value={form.department}
              onChange={(e) => handleChange('department', e.target.value.slice(0, 255))}
              placeholder="e.g. IT, Finance, HR"
              required
              aria-invalid={Boolean(errors.department)}
            />
            {errors.department && <span className="error-text">{errors.department}</span>}
          </div>
          <div className="form-field">
            <label className="field-label" htmlFor={`${formId}-room`}>Room / location *</label>
            <input
              className={fieldClass('room')}
              id={`${formId}-room`}
              type="text"
              value={form.room}
              onChange={(e) => handleChange('room', e.target.value.slice(0, 255))}
              placeholder="e.g. Server Room, 12"
              required
              aria-invalid={Boolean(errors.room)}
            />
            {errors.room && <span className="error-text">{errors.room}</span>}
          </div>
        </div>
        <div className="form-row">
          <div className="form-field">
            <label className="field-label" htmlFor={`${formId}-asset-type`}>Asset type *</label>
            <select
              className={fieldClass('asset_type')}
              id={`${formId}-asset-type`}
              value={form.asset_type}
              onChange={(e) => handleChange('asset_type', e.target.value)}
            >
              {ASSET_TYPES.map((type) => <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div className="form-field">
            <label className="field-label" htmlFor={`${formId}-asset-identifier`}>Asset identifier</label>
            <input
              className={fieldClass('asset_identifier')}
              id={`${formId}-asset-identifier`}
              type="text"
              value={form.asset_identifier}
              onChange={(e) => handleChange('asset_identifier', e.target.value.slice(0, 255))}
              placeholder="Serial no or registry tag"
              aria-invalid={Boolean(errors.asset_identifier)}
            />
            {errors.asset_identifier && <span className="error-text">{errors.asset_identifier}</span>}
            <span className="field-hint">Links this job to an asset in the registry</span>
          </div>
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor={`${formId}-description`}>Description</label>
          <textarea
            className="input"
            id={`${formId}-description`}
            rows={2}
            maxLength={2000}
            value={form.description}
            onChange={(e) => handleChange('description', e.target.value.slice(0, 2000))}
            placeholder="Describe the maintenance work"
          />
        </div>
      </fieldset>

      <fieldset className="form-section">
        <legend className="form-section__legend">Assignment</legend>
        <div className="form-row">
          <div className="form-field">
            <label className="field-label" htmlFor={`${formId}-technician`}>Technician *</label>
            <input
              className={fieldClass('technician')}
              id={`${formId}-technician`}
              type="text"
              value={form.technician}
              onChange={(e) => handleChange('technician', e.target.value.slice(0, 255))}
              required
              aria-invalid={Boolean(errors.technician)}
            />
            {errors.technician && <span className="error-text">{errors.technician}</span>}
          </div>
          <div className="form-field">
            <label className="field-label" htmlFor={`${formId}-priority`}>Priority</label>
            <select className="input" id={`${formId}-priority`} value={form.priority} onChange={(e) => handleChange('priority', e.target.value)}>
              {PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-field">
            <label className="field-label" htmlFor={`${formId}-estimated-cost`}>Estimated cost (ZMW)</label>
            <input
              className={fieldClass('estimated_cost')}
              id={`${formId}-estimated-cost`}
              type="number"
              min="0"
              step="0.01"
              value={form.estimated_cost}
              onChange={(e) => handleChange('estimated_cost', e.target.value)}
              aria-invalid={Boolean(errors.estimated_cost)}
            />
            {errors.estimated_cost && <span className="error-text">{errors.estimated_cost}</span>}
            <span className="field-hint">Budget for this job, used in cost reporting</span>
          </div>
          <div className="form-field">
            <label className="field-label" htmlFor={`${formId}-status`}>Status</label>
            <select className="input" id={`${formId}-status`} value={form.status} onChange={(e) => handleChange('status', e.target.value)}>
              {STATUSES.map((status) => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor={`${formId}-reminder-days`}>Reminder days before</label>
          <input
            className="input"
            id={`${formId}-reminder-days`}
            type="number"
            min="0"
            value={form.reminder_days}
            onChange={(e) => handleChange('reminder_days', e.target.value)}
          />
        </div>
      </fieldset>

      <fieldset className="form-section">
        <legend className="form-section__legend">Repeat</legend>
        <div className="form-row">
          <div className="form-field">
            <label className="field-label" htmlFor={`${formId}-recurrence`}>Frequency</label>
            <select
              className="input"
              id={`${formId}-recurrence`}
              value={form.recurrence_frequency}
              onChange={(e) => handleChange('recurrence_frequency', e.target.value)}
            >
              {RECURRENCE_FREQUENCIES.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          {form.recurrence_frequency !== 'none' && (
            <>
              <div className="form-field">
                <label className="field-label" htmlFor={`${formId}-recurrence-interval`}>Every</label>
                <input
                  className={fieldClass('recurrence_interval')}
                  id={`${formId}-recurrence-interval`}
                  type="number"
                  min="1"
                  max="60"
                  value={form.recurrence_interval}
                  onChange={(e) => handleChange('recurrence_interval', e.target.value)}
                  aria-invalid={Boolean(errors.recurrence_interval)}
                />
                {errors.recurrence_interval && <span className="error-text">{errors.recurrence_interval}</span>}
                <span className="field-hint">
                  {form.recurrence_frequency === 'monthly' ? 'month(s)'
                    : form.recurrence_frequency === 'quarterly' ? 'quarter(s)' : 'year(s)'}
                </span>
              </div>
              <div className="form-field">
                <label className="field-label" htmlFor={`${formId}-recurrence-end`}>Repeat until</label>
                <input
                  className={fieldClass('recurrence_end_at')}
                  id={`${formId}-recurrence-end`}
                  type="datetime-local"
                  value={form.recurrence_end_at}
                  onChange={(e) => handleChange('recurrence_end_at', e.target.value)}
                  aria-invalid={Boolean(errors.recurrence_end_at)}
                />
                {errors.recurrence_end_at && <span className="error-text">{errors.recurrence_end_at}</span>}
                <span className="field-hint">Leave blank for the default window</span>
              </div>
            </>
          )}
        </div>
      </fieldset>

      <div className="form-actions">
        <button className="button button--primary" type="submit" disabled={loading}>
          {loading ? 'Saving...' : (submitLabel || 'Save')}
        </button>
        <button className="button button--secondary" type="button" onClick={onCancel} disabled={loading}>Cancel</button>
      </div>
    </form>
  );
}

export { SlotPicker };
