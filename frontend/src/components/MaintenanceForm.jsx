import { useId, useState } from 'react';

const ASSET_TYPES = ['laptop', 'desktop', 'network_equipment', 'printer'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const STATUSES = ['scheduled', 'in_progress', 'completed', 'cancelled', 'overdue'];
const RECURRENCE_FREQUENCIES = ['none', 'monthly', 'quarterly'];

function toDateTimeLocal(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function toIsoDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

export default function MaintenanceForm({ initialData, onSubmit, onCancel, submitLabel, loading = false }) {
  const initialScheduledAt = initialData?.scheduled_at || initialData?.date || '';
  const [form, setForm] = useState({
    date: initialData?.date || '',
    scheduled_at: toDateTimeLocal(initialScheduledAt),
    department: initialData?.department || '', room: initialData?.room || '', asset_type: initialData?.asset_type || 'laptop', asset_identifier: initialData?.asset_identifier || '',
    description: initialData?.description || '', technician: initialData?.technician || '', priority: initialData?.priority || 'medium', reminder_days: initialData?.reminder_days || '1', status: initialData?.status || 'scheduled',
    recurrence_frequency: initialData?.recurrence_frequency || (initialData?.recurrence_rule ? initialData.recurrence_rule : 'none'),
    recurrence_interval: initialData?.recurrence_interval || '1',
    recurrence_end_at: toDateTimeLocal(initialData?.recurrence_end_at || initialData?.recurrence_end || initialData?.recurrence_end_date),
  });
  const [errors, setErrors] = useState({});
  const formId = useId();

  const validate = () => {
    const nextErrors = {};
    if (!form.scheduled_at) nextErrors.scheduled_at = 'Date and time are required';
    if (!form.department || !form.department.trim()) nextErrors.department = 'Department is required';
    else if (form.department.length > 255) nextErrors.department = 'Must be 255 characters or fewer';
    if (!form.room || !form.room.trim()) nextErrors.room = 'Room is required';
    else if (form.room.length > 255) nextErrors.room = 'Must be 255 characters or fewer';
    if (!form.technician || !form.technician.trim()) nextErrors.technician = 'Technician is required';
    else if (form.technician.length > 255) nextErrors.technician = 'Must be 255 characters or fewer';
    if (form.asset_identifier && form.asset_identifier.length > 255) nextErrors.asset_identifier = 'Must be 255 characters or fewer';
    if (form.description && form.description.length > 2000) nextErrors.description = 'Must be 2000 characters or fewer';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

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

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!validate()) return;
    const scheduledAt = toIsoDateTime(form.scheduled_at);
    const recurrenceFrequency = form.recurrence_frequency === 'none' ? 'none' : form.recurrence_frequency;
    const recurrenceEndAt = toIsoDateTime(form.recurrence_end_at);
    onSubmit({
      ...form,
      date: scheduledAt,
      scheduled_at: scheduledAt,
      recurrence_rule: recurrenceFrequency,
      recurrence_end: recurrenceEndAt || null,
      recurrence_end_at: recurrenceEndAt || null,
      recurrence_interval: recurrenceFrequency === 'none' ? null : Number(form.recurrence_interval) || 1,
    });
  };

  const fieldClass = (field) => `input${errors[field] ? ' input--error' : ''}`;
  const errorId = (field) => `${formId}-${field}-error`;

  return (
    <form className="form-stack" onSubmit={handleSubmit} aria-busy={loading}>
      <div className="form-row">
        <div className="form-field">
          <label className="field-label" htmlFor={`${formId}-scheduled-at`}>Scheduled date and time *</label>
          <input className={fieldClass('scheduled_at')} id={`${formId}-scheduled-at`} type="datetime-local" value={form.scheduled_at} onChange={(event) => handleChange('scheduled_at', event.target.value)} required aria-invalid={Boolean(errors.scheduled_at)} aria-describedby={errors.scheduled_at ? errorId('scheduled_at') : undefined} />
          {errors.scheduled_at && <span className="error-text" id={errorId('scheduled_at')}>{errors.scheduled_at}</span>}
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor={`${formId}-department`}>Department *</label>
          <input className={fieldClass('department')} id={`${formId}-department`} type="text" value={form.department} onChange={(event) => handleChange('department', event.target.value.slice(0, 255))} placeholder="e.g. IT, Finance, HR" required aria-invalid={Boolean(errors.department)} aria-describedby={errors.department ? errorId('department') : undefined} />
          {errors.department && <span className="error-text" id={errorId('department')}>{errors.department}</span>}
        </div>
      </div>
      <div className="form-row">
        <div className="form-field">
          <label className="field-label" htmlFor={`${formId}-room`}>Room *</label>
          <input className={fieldClass('room')} id={`${formId}-room`} type="text" value={form.room} onChange={(event) => handleChange('room', event.target.value.slice(0, 255))} required aria-invalid={Boolean(errors.room)} aria-describedby={errors.room ? errorId('room') : undefined} />
          {errors.room && <span className="error-text" id={errorId('room')}>{errors.room}</span>}
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor={`${formId}-asset-type`}>Asset Type *</label>
          <select className={fieldClass('asset_type')} id={`${formId}-asset-type`} value={form.asset_type} onChange={(event) => handleChange('asset_type', event.target.value)} aria-invalid={Boolean(errors.asset_type)}>
            {ASSET_TYPES.map((type) => <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-field">
          <label className="field-label" htmlFor={`${formId}-asset-identifier`}>Asset Identifier</label>
          <input className={fieldClass('asset_identifier')} id={`${formId}-asset-identifier`} type="text" value={form.asset_identifier} onChange={(event) => handleChange('asset_identifier', event.target.value.slice(0, 255))} placeholder="Serial no, tag, etc." aria-invalid={Boolean(errors.asset_identifier)} aria-describedby={errors.asset_identifier ? errorId('asset_identifier') : undefined} />
          {errors.asset_identifier && <span className="error-text" id={errorId('asset_identifier')}>{errors.asset_identifier}</span>}
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor={`${formId}-technician`}>Technician *</label>
          <input className={fieldClass('technician')} id={`${formId}-technician`} type="text" value={form.technician} onChange={(event) => handleChange('technician', event.target.value.slice(0, 255))} required aria-invalid={Boolean(errors.technician)} aria-describedby={errors.technician ? errorId('technician') : undefined} />
          {errors.technician && <span className="error-text" id={errorId('technician')}>{errors.technician}</span>}
        </div>
      </div>
      <div className="form-row">
        <div className="form-field">
          <label className="field-label" htmlFor={`${formId}-description`}>Description</label>
          <textarea className="input" id={`${formId}-description`} value={form.description} onChange={(event) => handleChange('description', event.target.value.slice(0, 2000))} placeholder="Describe the maintenance work" rows={3} />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor={`${formId}-priority`}>Priority</label>
          <select className="input" id={`${formId}-priority`} value={form.priority} onChange={(event) => handleChange('priority', event.target.value)}>
            {PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-field">
          <label className="field-label" htmlFor={`${formId}-reminder-days`}>Reminder Days</label>
          <input className="input" id={`${formId}-reminder-days`} type="number" min="0" value={form.reminder_days} onChange={(event) => handleChange('reminder_days', event.target.value)} />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor={`${formId}-status`}>Status</label>
          <select className="input" id={`${formId}-status`} value={form.status} onChange={(event) => handleChange('status', event.target.value)}>
            {STATUSES.map((status) => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
      </div>
      <div className="form-actions">
        <button className="button button--primary" type="submit" disabled={loading}>{loading ? 'Saving...' : (submitLabel || 'Save')}</button>
        <button className="button button--secondary" type="button" onClick={onCancel} disabled={loading}>Cancel</button>
      </div>
    </form>
  );
}
