import React, { useState } from 'react';

export default function ServiceMaintenanceForm({ schedule, onSubmit, onCancel }) {
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

  const validate = () => {
    const e = {};
    if (!form.work_performed) e.work_performed = 'Work performed is required';
    if (!form.signer_name) e.signer_name = 'Signer name is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => { const n = { ...prev }; delete n[field]; return n; });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    onSubmit(form);
  };

  const style = (field) => ({
    ...styles.field,
    borderColor: errors[field] ? '#dc2626' : '#d1d5db',
  });

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <div style={styles.infoBox}>
        <strong>Schedule:</strong> {schedule?.description || `${schedule?.asset_type} - ${schedule?.room}`} | <strong>Date:</strong> {schedule?.date} | <strong>Technician:</strong> {schedule?.technician}
      </div>
      <div style={styles.field}>
        <label style={styles.label}>Work Performed *</label>
        <textarea value={form.work_performed} onChange={(e) => handleChange('work_performed', e.target.value)} style={styles.textarea} placeholder="Describe the work performed" rows={4} required />
        {errors.work_performed && <span style={styles.errorText}>{errors.work_performed}</span>}
      </div>
      <div style={styles.row}>
        <div style={styles.half}>
          <label style={styles.label}>Outcome</label>
          <input type="text" value={form.outcome} onChange={(e) => handleChange('outcome', e.target.value)} style={style('outcome')} placeholder="Result of maintenance" />
        </div>
        <div style={styles.half}>
          <label style={styles.label}>Follow-up</label>
          <input type="text" value={form.follow_up} onChange={(e) => handleChange('follow_up', e.target.value)} style={style('follow_up')} placeholder="Any follow-up actions" />
        </div>
      </div>
      <div style={styles.row}>
        <div style={styles.half}>
          <label style={styles.label}>Signer Name *</label>
          <input type="text" value={form.signer_name} onChange={(e) => handleChange('signer_name', e.target.value)} style={style('signer_name')} required />
          {errors.signer_name && <span style={styles.errorText}>{errors.signer_name}</span>}
        </div>
        <div style={styles.half}>
          <label style={styles.label}>Signer Date</label>
          <input type="date" value={form.signer_date} onChange={(e) => handleChange('signer_date', e.target.value)} style={style('signer_date')} />
        </div>
      </div>
      <div style={styles.field}>
        <label style={styles.label}>Signature</label>
        <div ref={(el) => { setForm((f) => ({ ...f, _canvasRef: el })); }}></div>
        <p style={styles.hint}>Signature pad will be integrated below the canvas</p>
      </div>
      <div style={styles.actions}>
        <button type="submit" style={styles.submitBtn}>Sign & Complete</button>
        <button type="button" onClick={onCancel} style={styles.cancelBtn}>Cancel</button>
      </div>
    </form>
  );
}

const styles = {
  form: { display: 'flex', flexDirection: 'column', gap: '4px' },
  infoBox: { padding: '12px', backgroundColor: '#fff7ed', borderRadius: '6px', marginBottom: '12px', fontSize: '14px', color: '#9a3412' },
  row: { display: 'flex', gap: '16px' },
  half: { flex: 1, display: 'flex', flexDirection: 'column' },
  field: { marginBottom: '12px' },
  label: { fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '4px' },
  input: { padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', outline: 'none' },
  textarea: { padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', outline: 'none', resize: 'vertical', fontFamily: 'inherit' },
  errorText: { color: '#dc2626', fontSize: '12px', marginTop: '2px' },
  hint: { fontSize: '12px', color: '#9ca3af' },
  actions: { display: 'flex', gap: '12px', marginTop: '16px' },
  submitBtn: { padding: '12px 24px', backgroundColor: '#F97316', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '15px', fontWeight: '600', cursor: 'pointer' },
  cancelBtn: { padding: '12px 24px', backgroundColor: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '15px', fontWeight: '500', cursor: 'pointer' },
};
