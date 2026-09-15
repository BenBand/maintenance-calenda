import React, { useState } from 'react';

const ASSET_TYPES = ['laptop', 'desktop', 'network_equipment', 'printer'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const STATUSES = ['scheduled', 'in_progress', 'completed', 'cancelled', 'overdue'];

export default function MaintenanceForm({ initialData, onSubmit, onCancel, submitLabel }) {
  const [form, setForm] = useState(initialData || {
    date: '', department: '', room: '', asset_type: 'laptop', asset_identifier: '',
    description: '', technician: '', priority: 'medium', reminder_days: '1', status: 'scheduled',
  });
  const [errors, setErrors] = useState({});

  const validate = () => {
    const e = {};
    if (!form.date) e.date = 'Date is required';
    if (!form.department) e.department = 'Department is required';
    if (!form.room) e.room = 'Room is required';
    if (!form.technician) e.technician = 'Technician is required';
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
      <div style={styles.row}>
        <div style={styles.half}>
          <label style={styles.label}>Date *</label>
          <input type="date" value={form.date} onChange={(e) => handleChange('date', e.target.value)} style={style('date')} required />
          {errors.date && <span style={styles.errorText}>{errors.date}</span>}
        </div>
        <div style={styles.half}>
          <label style={styles.label}>Department *</label>
          <input type="text" value={form.department} onChange={(e) => handleChange('department', e.target.value)} style={style('department')} placeholder="e.g. IT, Finance, HR" required />
          {errors.department && <span style={styles.errorText}>{errors.department}</span>}
        </div>
      </div>
      <div style={styles.row}>
        <div style={styles.half}>
          <label style={styles.label}>Room *</label>
          <input type="text" value={form.room} onChange={(e) => handleChange('room', e.target.value)} style={style('room')} required />
          {errors.room && <span style={styles.errorText}>{errors.room}</span>}
        </div>
        <div style={styles.half}>
          <label style={styles.label}>Asset Type *</label>
          <select value={form.asset_type} onChange={(e) => handleChange('asset_type', e.target.value)} style={style('asset_type')}>
            {ASSET_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
      </div>
      <div style={styles.row}>
        <div style={styles.half}>
          <label style={styles.label}>Asset Identifier</label>
          <input type="text" value={form.asset_identifier} onChange={(e) => handleChange('asset_identifier', e.target.value)} style={style('asset_identifier')} placeholder="Serial no, tag, etc." />
        </div>
        <div style={styles.half}>
          <label style={styles.label}>Technician *</label>
          <input type="text" value={form.technician} onChange={(e) => handleChange('technician', e.target.value)} style={style('technician')} required />
          {errors.technician && <span style={styles.errorText}>{errors.technician}</span>}
        </div>
      </div>
      <div style={styles.row}>
        <div style={styles.half}>
          <label style={styles.label}>Description</label>
          <textarea value={form.description} onChange={(e) => handleChange('description', e.target.value)} style={styles.textarea} placeholder="Describe the maintenance work" rows={3} />
        </div>
        <div style={styles.half}>
          <label style={styles.label}>Priority</label>
          <select value={form.priority} onChange={(e) => handleChange('priority', e.target.value)} style={style('priority')}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>
      <div style={styles.row}>
        <div style={styles.half}>
          <label style={styles.label}>Reminder Days</label>
          <input type="number" min="0" value={form.reminder_days} onChange={(e) => handleChange('reminder_days', e.target.value)} style={style('reminder_days')} />
        </div>
        <div style={styles.half}>
          <label style={styles.label}>Status</label>
          <select value={form.status} onChange={(e) => handleChange('status', e.target.value)} style={style('status')}>
            {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
      </div>
      <div style={styles.actions}>
        <button type="submit" style={styles.submitBtn}>{submitLabel || 'Save'}</button>
        <button type="button" onClick={onCancel} style={styles.cancelBtn}>Cancel</button>
      </div>
    </form>
  );
}

const styles = {
  form: { display: 'flex', flexDirection: 'column', gap: '4px' },
  row: { display: 'flex', gap: '16px' },
  half: { flex: 1, display: 'flex', flexDirection: 'column' },
  field: { marginBottom: '12px' },
  label: { fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '4px' },
  input: { padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', outline: 'none' },
  textarea: { padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', outline: 'none', resize: 'vertical', fontFamily: 'inherit' },
  select: { padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', outline: 'none', backgroundColor: '#fff' },
  errorText: { color: '#dc2626', fontSize: '12px', marginTop: '2px' },
  actions: { display: 'flex', gap: '12px', marginTop: '16px' },
  submitBtn: { padding: '12px 24px', backgroundColor: '#F97316', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '15px', fontWeight: '600', cursor: 'pointer' },
  cancelBtn: { padding: '12px 24px', backgroundColor: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '15px', fontWeight: '500', cursor: 'pointer' },
};
