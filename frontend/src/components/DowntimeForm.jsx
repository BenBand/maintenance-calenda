import { useId, useState } from 'react';
import { toDateTimeLocalInput, fromDateTimeLocalInput } from '../utils/datetime';

const WINDOW_TYPES = [
  { value: 'planned', label: 'Planned' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'unplanned', label: 'Unplanned outage' },
];

/**
 * Declares a period during which a department or room is unavailable, so
 * maintenance slots can be planned around it. Windows with no department
 * apply council-wide.
 */
export default function DowntimeForm({ departments = [], onSubmit, onCancel, loading = false, initialData }) {
  const formId = useId();
  const [form, setForm] = useState({
    title: initialData?.title || '',
    department: initialData?.department || '',
    room: initialData?.room || '',
    reason: initialData?.reason || '',
    window_type: initialData?.window_type || 'planned',
    starts_at: toDateTimeLocalInput(initialData?.starts_at) || '',
    ends_at: toDateTimeLocalInput(initialData?.ends_at) || '',
  });
  const [errors, setErrors] = useState({});

  const handleChange = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const validate = () => {
    const next = {};
    if (!form.title.trim()) next.title = 'A title is required';
    if (!form.starts_at) next.starts_at = 'A start time is required';
    if (!form.ends_at) next.ends_at = 'An end time is required';
    if (form.starts_at && form.ends_at && form.ends_at <= form.starts_at) {
      next.ends_at = 'End must be after the start time';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (submitEvent) => {
    submitEvent.preventDefault();
    if (!validate()) return;
    onSubmit({
      title: form.title,
      department: form.department || null,
      room: form.room || null,
      reason: form.reason || null,
      window_type: form.window_type,
      starts_at: fromDateTimeLocalInput(form.starts_at),
      ends_at: fromDateTimeLocalInput(form.ends_at),
    });
  };

  const fieldClass = (field) => `input${errors[field] ? ' input--error' : ''}`;

  return (
    <form className="form-stack" onSubmit={handleSubmit} aria-busy={loading}>
      <div className="form-field">
        <label className="field-label" htmlFor={`${formId}-title`}>Title *</label>
        <input
          className={fieldClass('title')}
          id={`${formId}-title`}
          type="text"
          maxLength={255}
          value={form.title}
          onChange={(e) => handleChange('title', e.target.value)}
          placeholder="e.g. Core switch replacement"
          aria-invalid={Boolean(errors.title)}
        />
        {errors.title && <span className="error-text">{errors.title}</span>}
      </div>

      <div className="form-row">
        <div className="form-field">
          <label className="field-label" htmlFor={`${formId}-department`}>Department</label>
          <select
            className="input"
            id={`${formId}-department`}
            value={form.department}
            onChange={(e) => handleChange('department', e.target.value)}
          >
            <option value="">All departments (council-wide)</option>
            {departments.map((department) => <option key={department} value={department}>{department}</option>)}
          </select>
          <span className="field-hint">Leave blank to apply the window to every department</span>
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor={`${formId}-window-type`}>Window type</label>
          <select
            className="input"
            id={`${formId}-window-type`}
            value={form.window_type}
            onChange={(e) => handleChange('window_type', e.target.value)}
          >
            {WINDOW_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
        </div>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label className="field-label" htmlFor={`${formId}-room`}>Room / location</label>
          <input
            className="input"
            id={`${formId}-room`}
            type="text"
            maxLength={255}
            value={form.room}
            onChange={(e) => handleChange('room', e.target.value)}
          />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor={`${formId}-reason`}>Reason</label>
          <input
            className="input"
            id={`${formId}-reason`}
            type="text"
            maxLength={2000}
            value={form.reason}
            onChange={(e) => handleChange('reason', e.target.value)}
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label className="field-label" htmlFor={`${formId}-starts-at`}>Starts *</label>
          <input
            className={fieldClass('starts_at')}
            id={`${formId}-starts-at`}
            type="datetime-local"
            value={form.starts_at}
            onChange={(e) => handleChange('starts_at', e.target.value)}
            aria-invalid={Boolean(errors.starts_at)}
          />
          {errors.starts_at && <span className="error-text">{errors.starts_at}</span>}
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor={`${formId}-ends-at`}>Ends *</label>
          <input
            className={fieldClass('ends_at')}
            id={`${formId}-ends-at`}
            type="datetime-local"
            value={form.ends_at}
            onChange={(e) => handleChange('ends_at', e.target.value)}
            aria-invalid={Boolean(errors.ends_at)}
          />
          {errors.ends_at && <span className="error-text">{errors.ends_at}</span>}
        </div>
      </div>

      <div className="form-actions">
        <button className="button button--primary" type="submit" disabled={loading}>
          {loading ? 'Saving...' : 'Save window'}
        </button>
        <button className="button button--secondary" type="button" onClick={onCancel} disabled={loading}>Cancel</button>
      </div>
    </form>
  );
}
