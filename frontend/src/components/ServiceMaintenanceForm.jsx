import { useRef, useState } from 'react';
import SignatureCanvas from './SignatureCanvas';

export default function ServiceMaintenanceForm({ schedule, onSubmit, onCancel, loading = false }) {
  const [form, setForm] = useState({
    schedule_id: schedule?.id || '',
    work_performed: '',
    outcome: '',
    follow_up: '',
    signer_name: '',
    signer_date: '',
    signature_data: null,
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
    onSubmit({ ...form, signature_data: signatureData });
  };

  return (
    <form className="form-stack" onSubmit={handleSubmit} aria-busy={loading}>
      <div className="info-box">
        <strong>Schedule:</strong> {schedule?.description || `${schedule?.asset_type} - ${schedule?.room}`} | <strong>Date:</strong> {schedule?.date} | <strong>Technician:</strong> {schedule?.technician}
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
