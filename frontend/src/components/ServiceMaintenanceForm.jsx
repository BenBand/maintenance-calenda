import { useRef, useState } from 'react';
import SignatureCanvas from './SignatureCanvas';
import { formatTimeRange, humanizeKey } from '../utils/datetime';

const COMPLEXITY_LEVELS = ['simple', 'medium', 'complex'];

export default function ServiceMaintenanceForm({ schedule, onSubmit, onCancel, loading = false }) {
  const [form, setForm] = useState({
    schedule_id: schedule?.id || '',
    work_performed: '',
    outcome: '',
    follow_up: '',
    signer_name: '',
    signer_date: '',
    signature_data: null,
    // Internal tracking fields; maintenance here is internal council work
    time_spent_minutes: schedule?.duration_minutes ? String(schedule.duration_minutes) : '',
    complexity_level: 'medium',
    parts_replaced: '',
    next_maintenance_due: '',
  });
  const [errors, setErrors] = useState({});

  const signatureRef = useRef(null);

  const validate = (signatureData) => {
    const nextErrors = {};
    if (!form.work_performed || !form.work_performed.trim()) nextErrors.work_performed = 'Work performed is required';
    else if (form.work_performed.length > 5000) nextErrors.work_performed = 'Must be 5000 characters or fewer';
    if (!form.signer_name || !form.signer_name.trim()) nextErrors.signer_name = 'Signer name is required';
    else if (form.signer_name.length > 255) nextErrors.signer_name = 'Must be 255 characters or fewer';
    if (!signatureData) nextErrors.signature_data = 'Signature is required';
    if (form.outcome && form.outcome.length > 2000) nextErrors.outcome = 'Must be 2000 characters or fewer';
    if (form.follow_up && form.follow_up.length > 2000) nextErrors.follow_up = 'Must be 2000 characters or fewer';
    if (form.time_spent_minutes !== '' && Number(form.time_spent_minutes) < 0) nextErrors.time_spent_minutes = 'Cannot be negative';
    if (form.complexity_level && !COMPLEXITY_LEVELS.includes(form.complexity_level)) nextErrors.complexity_level = 'Invalid complexity level';
    if (form.parts_replaced && form.parts_replaced.length > 2000) nextErrors.parts_replaced = 'Must be 2000 characters or fewer';
    if (form.next_maintenance_due && form.next_maintenance_due < new Date().toISOString().split('T')[0]) nextErrors.next_maintenance_due = 'Must be a future date';
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
    const signatureData = signatureRef.current?.getData();
    if (!validate(signatureData)) return;
    onSubmit({
      ...form,
      time_spent_minutes: form.time_spent_minutes === '' ? 0 : Number(form.time_spent_minutes),
      complexity_level: form.complexity_level || null,
      parts_replaced: form.parts_replaced || null,
      next_maintenance_due: form.next_maintenance_due || null,
      asset_id: schedule?.asset_id || null,
      signature_data: signatureData,
    });
  };

  return (
    <form className="form-stack" onSubmit={handleSubmit} aria-busy={loading}>
      <div className="info-box">
        <strong>Schedule:</strong> {schedule?.description || `${humanizeKey(schedule?.asset_type)} - ${schedule?.room}`}
        {' | '}<strong>Slot:</strong> {formatTimeRange(schedule?.scheduled_at, schedule?.scheduled_end)}
        {' | '}<strong>Technician:</strong> {schedule?.technician}
      </div>
      <div className="form-field">
        <label className="field-label" htmlFor="service-work-performed">Work Performed *</label>
        <textarea className={`input${errors.work_performed ? ' input--error' : ''}`} id="service-work-performed" value={form.work_performed} onChange={(event) => handleChange('work_performed', event.target.value.slice(0, 5000))} placeholder="Describe the work performed" rows={4} required aria-invalid={Boolean(errors.work_performed)} aria-describedby={errors.work_performed ? 'service-work-performed-error' : undefined} />
        {errors.work_performed && <span className="error-text" id="service-work-performed-error">{errors.work_performed}</span>}
      </div>
      <div className="form-row">
        <div className="form-field">
          <label className="field-label" htmlFor="service-outcome">Outcome</label>
          <input className={`input${errors.outcome ? ' input--error' : ''}`} id="service-outcome" type="text" value={form.outcome} onChange={(event) => handleChange('outcome', event.target.value.slice(0, 2000))} placeholder="Result of maintenance" aria-invalid={Boolean(errors.outcome)} />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="service-follow-up">Follow-up</label>
          <input className={`input${errors.follow_up ? ' input--error' : ''}`} id="service-follow-up" type="text" value={form.follow_up} onChange={(event) => handleChange('follow_up', event.target.value.slice(0, 2000))} placeholder="Any follow-up actions" aria-invalid={Boolean(errors.follow_up)} />
        </div>
      </div>
      <fieldset className="form-section">
        <legend className="form-section__legend">Internal Tracking</legend>
        <div className="form-row">
          <div className="form-field">
            <label className="field-label" htmlFor="service-time-spent">Time Spent (minutes) *</label>
            <input className={`input${errors.time_spent_minutes ? ' input--error' : ''}`} id="service-time-spent" type="number" min="0" step="1" inputMode="numeric" value={form.time_spent_minutes} onChange={(event) => handleChange('time_spent_minutes', event.target.value)} aria-invalid={Boolean(errors.time_spent_minutes)} required />
            {errors.time_spent_minutes && <span className="error-text">{errors.time_spent_minutes}</span>}
            <span className="field-hint">Actual time spent on this maintenance task</span>
          </div>
          <div className="form-field">
            <label className="field-label" htmlFor="service-complexity">Complexity Level</label>
            <select className={`input${errors.complexity_level ? ' input--error' : ''}`} id="service-complexity" value={form.complexity_level} onChange={(event) => handleChange('complexity_level', event.target.value)} aria-invalid={Boolean(errors.complexity_level)}>
              {COMPLEXITY_LEVELS.map((level) => <option key={level} value={level}>{level.charAt(0).toUpperCase() + level.slice(1)}</option>)}
            </select>
            {errors.complexity_level && <span className="error-text">{errors.complexity_level}</span>}
          </div>
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="service-parts-replaced">Parts Replaced</label>
          <textarea className={`input${errors.parts_replaced ? ' input--error' : ''}`} id="service-parts-replaced" value={form.parts_replaced} onChange={(event) => handleChange('parts_replaced', event.target.value.slice(0, 2000))} placeholder="List any parts that were replaced" rows={2} aria-invalid={Boolean(errors.parts_replaced)} />
          {errors.parts_replaced && <span className="error-text">{errors.parts_replaced}</span>}
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="service-next-maintenance">Next Maintenance Due</label>
          <input className={`input${errors.next_maintenance_due ? ' input--error' : ''}`} id="service-next-maintenance" type="date" value={form.next_maintenance_due} onChange={(event) => handleChange('next_maintenance_due', event.target.value)} aria-invalid={Boolean(errors.next_maintenance_due)} />
          {errors.next_maintenance_due && <span className="error-text">{errors.next_maintenance_due}</span>}
          <span className="field-hint">Suggested date for next preventive maintenance</span>
        </div>
      </fieldset>
      <div className="form-row">
        <div className="form-field">
          <label className="field-label" htmlFor="service-signer-name">Signer Name *</label>
          <input className={`input${errors.signer_name ? ' input--error' : ''}`} id="service-signer-name" type="text" value={form.signer_name} onChange={(event) => handleChange('signer_name', event.target.value.slice(0, 255))} required aria-invalid={Boolean(errors.signer_name)} aria-describedby={errors.signer_name ? 'service-signer-name-error' : undefined} />
          {errors.signer_name && <span className="error-text" id="service-signer-name-error">{errors.signer_name}</span>}
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="service-signer-date">Signer Date</label>
          <input className={`input${errors.signer_date ? ' input--error' : ''}`} id="service-signer-date" type="date" value={form.signer_date} onChange={(event) => handleChange('signer_date', event.target.value)} aria-invalid={Boolean(errors.signer_date)} />
        </div>
      </div>
      <div className="form-field">
        <label className="field-label" id="signature-label">Signature</label>
        <SignatureCanvas
          ref={signatureRef}
          onChange={(signatureData) => handleChange('signature_data', signatureData)}
        />
        {errors.signature_data && <span className="error-text" id="signature-data-error">{errors.signature_data}</span>}
        <p className="field-hint" id="signature-hint">Use a mouse, stylus, or touch to draw your signature.</p>
      </div>
      <div className="form-actions">
        <button className="button button--primary" type="submit" disabled={loading}>{loading ? 'Saving...' : 'Sign & Complete'}</button>
        <button className="button button--secondary" type="button" onClick={onCancel} disabled={loading}>Cancel</button>
      </div>
    </form>
  );
}