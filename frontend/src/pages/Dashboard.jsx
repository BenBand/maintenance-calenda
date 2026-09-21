import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../services/auth';
import { apiFetch } from '../services/auth';

export default function Dashboard() {
  const { user, token } = useAuth();
  const [schedules, setSchedules] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [overdue, setOverdue] = useState([]);
  const [serviceRecords, setServiceRecords] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [formData, setFormData] = useState({ date: '', department: '', room: '', asset_type: 'laptop', asset_identifier: '', description: '', technician: '', priority: 'medium', reminder_days: '1', status: 'scheduled' });
  const [errors, setErrors] = useState({});

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [allRes, upRes, overRes, svcRes] = await Promise.all([
        apiFetch('/maintenance', {}, token),
        apiFetch('/maintenance/upcoming', {}, token),
        apiFetch('/maintenance/overdue', {}, token),
        apiFetch('/services', {}, token),
      ]);
      if (allRes.ok) setSchedules(await allRes.json());
      if (upRes.ok) setUpcoming(await upRes.json());
      if (overRes.ok) setOverdue(await overRes.json());
      if (svcRes.ok) setServiceRecords(await svcRes.json());
    } catch (err) { console.error('Failed to load dashboard data', err); }
  };

  const data = Array.isArray(schedules) ? schedules : (schedules?.data || []);
  const upcomingData = Array.isArray(upcoming) ? upcoming : (upcoming?.data || []);
  const overdueData = Array.isArray(overdue) ? overdue : (overdue?.data || []);
  const recordsData = Array.isArray(serviceRecords) ? serviceRecords : (serviceRecords?.data || []);

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    const e2 = {};
    if (!formData.date) e2.date = 'Required';
    if (!formData.department) e2.department = 'Required';
    if (!formData.room) e2.room = 'Required';
    if (!formData.technician) e2.technician = 'Required';
    setErrors(e2);
    if (Object.keys(e2).length > 0) return;
    const res = await apiFetch('/maintenance', { method: 'POST', body: JSON.stringify(formData) }, token);
    if (res.ok) { setShowAddForm(false); setFormData({ date: '', department: '', room: '', asset_type: 'laptop', asset_identifier: '', description: '', technician: '', priority: 'medium', reminder_days: '1', status: 'scheduled' }); loadData(); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure?')) return;
    try {
      const res = await apiFetch(`/maintenance/${id}`, { method: 'DELETE' }, token);
      if (res.ok) loadData();
    } catch (err) { console.error('Failed to delete', err); }
  };

  return (
    <div>
      <div style={styles.header}>
        <div>
          <h1 style={styles.heading}>Dashboard</h1>
          <p style={styles.subtitle}>Welcome, {user?.username}</p>
        </div>
        {user?.role === 'admin' && (
          <button style={styles.addBtn} onClick={() => setShowAddForm(true)}>+ Add Schedule</button>
        )}
      </div>
      <div style={styles.statsGrid}>
        <div style={styles.statCard}><div style={styles.statNumber}>{data.length}</div><div style={styles.statLabel}>Total Schedules</div></div>
        <div style={styles.statCard}><div style={{ ...styles.statNumber, color: '#dc2626' }}>{overdueData.length}</div><div style={styles.statLabel}>Overdue</div></div>
        <div style={styles.statCard}><div style={{ ...styles.statNumber, color: '#16a34a' }}>{upcomingData.filter(s => s.status === 'scheduled').length}</div><div style={styles.statLabel}>Upcoming</div></div>
        <div style={styles.statCard}><div style={{ ...styles.statNumber, color: '#2563eb' }}>{recordsData.length}</div><div style={styles.statLabel}>Service Records</div></div>
      </div>
      {overdueData.length > 0 && (
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Overdue Reminders <span style={styles.countBadge}>{overdueData.length}</span></h3>
          {overdueData.map((s) => (
            <div key={s.id} style={styles.alertCard}>
              <div style={styles.alertTitle}><span style={{ textTransform: 'capitalize' }}>{s.asset_type.replace(/_/g, ' ')}</span> - {s.description || s.room}</div>
              <div style={styles.alertDetail}>Date: {s.date} | Dept: {s.department} | Technician: {s.technician}</div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button style={styles.actionBtn} onClick={() => { setSelectedSchedule(s); setShowServiceForm(true); }}>Service Now</button>
                {user?.role === 'admin' && <button style={styles.deleteBtn} onClick={() => handleDelete(s.id)}>Cancel</button>}
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Upcoming Reminders <span style={styles.countBadge}>{upcomingData.length}</span></h3>
        {upcomingData.length === 0 ? <p style={styles.emptyText}>No upcoming maintenance scheduled</p> : upcomingData.slice(0, 5).map((s) => (
          <div key={s.id} style={styles.eventItem}>
            <div style={styles.eventTitle}>{s.date} - {s.department} ({s.room})</div>
            <div style={styles.eventMeta}>{s.asset_type.replace(/_/g, ' ')} - {s.description || ''}</div>
          </div>
        ))}
      </div>
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Recent Service Records</h3>
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead><tr><th style={styles.th}>Date</th><th style={styles.th}>Asset</th><th style={styles.th}>Work Performed</th><th style={styles.th}>Outcome</th><th style={styles.th}>Signer</th></tr></thead>
            <tbody>
              {recordsData.slice(0, 10).map((r) => (
                <tr key={r.id}>
                  <td style={styles.td}>{r.signer_date || r.created_at?.split('T')[0] || '-'}</td>
                  <td style={styles.td}>{r.asset_type?.replace(/_/g, ' ') || '-'}</td>
                  <td style={styles.td}>{r.work_performed?.substring(0, 60)}{r.work_performed?.length > 60 ? '...' : ''}</td>
                  <td style={styles.td}>{r.outcome || '-'}</td>
                  <td style={styles.td}>{r.signed_by || '-'}</td>
                </tr>
              ))}
              {recordsData.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: '#6b7280', padding: '16px' }}>No service records yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {showAddForm && (
        <div style={styles.modalOverlay} onClick={() => setShowAddForm(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Add Maintenance Schedule</h3>
            <form onSubmit={handleAddSubmit}>
              <div style={styles.row}>
                <div style={styles.half}><label style={styles.label}>Date *</label><input type="date" value={formData.date} onChange={(e) => setFormData({...formData, date: e.target.value})} style={{ ...styles.input, borderColor: errors.date ? '#dc2626' : '#d1d5db' }} required />{errors.date && <span style={styles.errorText}>{errors.date}</span>}</div>
                <div style={styles.half}><label style={styles.label}>Department *</label><input type="text" value={formData.department} onChange={(e) => setFormData({...formData, department: e.target.value})} style={{ ...styles.input, borderColor: errors.department ? '#dc2626' : '#d1d5db' }} placeholder="IT, Finance" required />{errors.department && <span style={styles.errorText}>{errors.department}</span>}</div>
              </div>
              <div style={styles.row}>
                <div style={styles.half}><label style={styles.label}>Room *</label><input type="text" value={formData.room} onChange={(e) => setFormData({...formData, room: e.target.value})} style={{ ...styles.input, borderColor: errors.room ? '#dc2626' : '#d1d5db' }} required />{errors.room && <span style={styles.errorText}>{errors.room}</span>}</div>
                <div style={styles.half}><label style={styles.label}>Asset Type</label><select value={formData.asset_type} onChange={(e) => setFormData({...formData, asset_type: e.target.value})} style={styles.input}><option value="laptop">Laptop</option><option value="desktop">Desktop</option><option value="network_equipment">Network Equipment</option><option value="printer">Printer</option></select></div>
              </div>
              <div style={styles.row}>
                <div style={styles.half}><label style={styles.label}>Asset Identifier</label><input type="text" value={formData.asset_identifier} onChange={(e) => setFormData({...formData, asset_identifier: e.target.value})} style={styles.input} placeholder="Serial/tag" /></div>
                <div style={styles.half}><label style={styles.label}>Technician *</label><input type="text" value={formData.technician} onChange={(e) => setFormData({...formData, technician: e.target.value})} style={{ ...styles.input, borderColor: errors.technician ? '#dc2626' : '#d1d5db' }} required />{errors.technician && <span style={styles.errorText}>{errors.technician}</span>}</div>
              </div>
              <div style={styles.row}>
                <div style={styles.half}><label style={styles.label}>Description</label><input type="text" value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} style={styles.input} /></div>
                <div style={styles.half}><label style={styles.label}>Priority</label><select value={formData.priority} onChange={(e) => setFormData({...formData, priority: e.target.value})} style={styles.input}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></div>
              </div>
              <button type="submit" style={styles.submitBtn}>Add Schedule</button>
            </form>
          </div>
        </div>
      )}
      {showServiceForm && selectedSchedule && (
        <div style={styles.modalOverlay} onClick={() => { setShowServiceForm(false); setSelectedSchedule(null); }}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Service Maintenance - {selectedSchedule.description || selectedSchedule.asset_type}</h3>
            <ServiceRecordForm schedule={selectedSchedule} onSubmit={async (form) => {
              const res = await apiFetch('/services', { method: 'POST', body: JSON.stringify(form) }, token);
              if (res.ok) { setShowServiceForm(false); setSelectedSchedule(null); loadData(); }
            }} onCancel={() => { setShowServiceForm(false); setSelectedSchedule(null); }} />
          </div>
        </div>
      )}
    </div>
  );
}

function ServiceRecordForm({ schedule, onSubmit, onCancel }) {
  const [form, setForm] = useState({ schedule_id: schedule?.id || '', work_performed: '', outcome: '', follow_up: '', signer_name: '', signer_date: '' });
  const [errors, setErrors] = useState({});

  const validate = () => {
    const e = {};
    if (!form.work_performed) e.work_performed = 'Required';
    if (!form.signer_name) e.signer_name = 'Required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleChange = (field, value) => { setForm({...form, [field]: value}); if (errors[field]) setErrors({...errors, [field]: null}); };

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!validate()) return; onSubmit(form); }}>
      <div style={styles.infoBox}>Schedule: {schedule?.description || `${schedule?.asset_type} - ${schedule?.room}`} | Date: {schedule?.date} | Tech: {schedule?.technician}</div>
      <div style={styles.field}><label style={styles.label}>Work Performed *</label><textarea value={form.work_performed} onChange={(e) => handleChange('work_performed', e.target.value)} style={styles.textarea} placeholder="Describe work performed" rows={3} required />{errors.work_performed && <span style={styles.errorText}>{errors.work_performed}</span>}</div>
      <div style={styles.row}>
        <div style={styles.half}><label style={styles.label}>Outcome</label><input type="text" value={form.outcome} onChange={(e) => handleChange('outcome', e.target.value)} style={styles.input} /></div>
        <div style={styles.half}><label style={styles.label}>Follow-up</label><input type="text" value={form.follow_up} onChange={(e) => handleChange('follow_up', e.target.value)} style={styles.input} /></div>
      </div>
      <div style={styles.row}>
        <div style={styles.half}><label style={styles.label}>Signer Name *</label><input type="text" value={form.signer_name} onChange={(e) => handleChange('signer_name', e.target.value)} style={{ ...styles.input, borderColor: errors.signer_name ? '#dc2626' : '#d1d5db' }} required />{errors.signer_name && <span style={styles.errorText}>{errors.signer_name}</span>}</div>
        <div style={styles.half}><label style={styles.label}>Signer Date</label><input type="date" value={form.signer_date} onChange={(e) => handleChange('signer_date', e.target.value)} style={styles.input} /></div>
      </div>
      <div style={styles.actions}>
        <button type="submit" style={styles.submitBtn}>Sign & Complete</button>
        <button type="button" onClick={onCancel} style={styles.cancelBtn}>Cancel</button>
      </div>
    </form>
  );
}

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' },
  heading: { margin: 0, fontSize: '28px', color: '#1f2937', fontWeight: '700' },
  subtitle: { margin: '4px 0 0 0', color: '#6b7280', fontSize: '14px' },
  addBtn: { padding: '10px 20px', backgroundColor: '#F97316', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' },
  statCard: { backgroundColor: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '1px solid #e5e7eb' },
  statNumber: { fontSize: '32px', fontWeight: '700', color: '#F97316' },
  statLabel: { fontSize: '14px', color: '#6b7280', marginTop: '4px' },
  section: { marginBottom: '32px' },
  sectionTitle: { fontSize: '18px', margin: '0 0 12px 0', color: '#1f2937', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' },
  countBadge: { fontSize: '13px', backgroundColor: '#F97316', color: '#fff', padding: '2px 10px', borderRadius: '9999px' },
  alertCard: { backgroundColor: '#fff', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #dc2626', marginBottom: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  alertTitle: { fontWeight: '600', color: '#1f2937', fontSize: '14px' },
  alertDetail: { fontSize: '13px', color: '#6b7280', marginTop: '4px' },
  actionBtn: { padding: '6px 14px', backgroundColor: '#F97316', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' },
  deleteBtn: { padding: '6px 14px', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' },
  eventItem: { padding: '12px', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', marginBottom: '8px' },
  eventTitle: { fontWeight: '600', color: '#1f2937', fontSize: '14px' },
  eventMeta: { fontSize: '13px', color: '#6b7280' },
  emptyText: { color: '#6b7280' },
  tableWrap: { borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  table: { width: '100%', borderCollapse: 'collapse', backgroundColor: '#fff' },
  th: { textAlign: 'left', padding: '10px', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '13px', fontWeight: '600', color: '#374151' },
  td: { padding: '10px', borderBottom: '1px solid #e5e7eb', fontSize: '13px', color: '#374151' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
  modalContent: { backgroundColor: '#fff', borderRadius: '12px', padding: '24px', maxWidth: '700px', width: '100%', maxHeight: '90vh', overflowY: 'auto' },
  modalTitle: { margin: '0 0 16px 0', fontSize: '20px', color: '#1f2937' },
  row: { display: 'flex', gap: '16px', marginBottom: '4px' },
  half: { flex: 1, display: 'flex', flexDirection: 'column' },
  field: { marginBottom: '12px' },
  label: { fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '4px' },
  input: { padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', outline: 'none' },
  textarea: { padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', outline: 'none', resize: 'vertical', fontFamily: 'inherit' },
  errorText: { color: '#dc2626', fontSize: '12px', marginTop: '2px' },
  infoBox: { padding: '12px', backgroundColor: '#fff7ed', borderRadius: '6px', marginBottom: '12px', fontSize: '14px', color: '#9a3412' },
  actions: { display: 'flex', gap: '12px', marginTop: '16px' },
  submitBtn: { padding: '12px 24px', backgroundColor: '#F97316', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '15px', fontWeight: '600', cursor: 'pointer' },
  cancelBtn: { padding: '12px 24px', backgroundColor: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '15px', fontWeight: '500', cursor: 'pointer' },
};
