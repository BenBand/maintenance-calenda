import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../services/auth';
import Calendar from '../components/Calendar';
import MaintenanceForm from '../components/MaintenanceForm';
import { apiFetch } from '../services/auth';

export default function CalendarPage() {
  const { token, csrfToken, user } = useAuth();
  const navigate = useNavigate();
  const [schedules, setSchedules] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [filterDept, setFilterDept] = useState('');
  const [filterAssetType, setFilterAssetType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [departments, setDepartments] = useState([]);

  useEffect(() => { loadSchedules(); loadDepartments(); }, []);

  const loadSchedules = async () => {
    try {
      const res = await apiFetch('/maintenance', {}, token, csrfToken);
      if (res.ok) {
        const data = await res.json();
        setSchedules(data.data || data);
      }
    } catch (err) { console.error('Failed to load schedules', err); }
  };

  const loadDepartments = async () => {
    try {
      const res = await apiFetch('/maintenance/departments', {}, token, csrfToken);
      if (res.ok) setDepartments(await res.json());
    } catch (err) { console.error('Failed to load departments', err); }
  };

  const filtered = schedules.filter((s) => {
    if (filterDept && s.department !== filterDept) return false;
    if (filterAssetType && s.asset_type !== filterAssetType) return false;
    if (filterStatus && s.status !== filterStatus) return false;
    return true;
  });

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to cancel this schedule?')) return;
    try {
      const res = await apiFetch(`/maintenance/${id}`, { method: 'DELETE' }, token, csrfToken);
      if (res.ok) { loadSchedules(); }
    } catch (err) { console.error('Failed to delete', err); }
  };

  const handleEdit = (s) => { setEditingSchedule(s); setShowForm(true); };

  return (
    <div>
      <div style={styles.header}>
        <div>
          <h1 style={styles.heading}>Maintenance Calendar</h1>
          <p style={styles.subtitle}>Lusaka City Council - Schedule Management</p>
        </div>
        {user?.role === 'admin' && (
          <button style={styles.addBtn} onClick={() => { setEditingSchedule(null); setShowForm(true); }}>+ Add Schedule</button>
        )}
      </div>
      <div style={styles.filters}>
        <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)} style={styles.filterSelect}>
          <option value="">All Departments</option>
          {departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={filterAssetType} onChange={(e) => setFilterAssetType(e.target.value)} style={styles.filterSelect}>
          <option value="">All Asset Types</option>
          <option value="laptop">Laptop</option>
          <option value="desktop">Desktop</option>
          <option value="network_equipment">Network Equipment</option>
          <option value="printer">Printer</option>
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={styles.filterSelect}>
          <option value="">All Status</option>
          <option value="scheduled">Scheduled</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="overdue">Overdue</option>
        </select>
      </div>
      <div style={styles.calendarWrap}>
        <Calendar schedules={filtered} />
      </div>
      <h3 style={styles.listTitle}>All Schedules</h3>
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Date</th>
              <th style={styles.th}>Department</th>
              <th style={styles.th}>Room</th>
              <th style={styles.th}>Asset Type</th>
              <th style={styles.th}>Technician</th>
              <th style={styles.th}>Priority</th>
              <th style={styles.th}>Status</th>
              {user?.role === 'admin' && <th style={styles.th}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id}>
                <td style={styles.td}>{s.date}</td>
                <td style={styles.td}>{s.department}</td>
                <td style={styles.td}>{s.room}</td>
                <td style={styles.td}>{s.asset_type.replace(/_/g, ' ')}</td>
                <td style={styles.td}>{s.technician}</td>
                <td style={styles.td}><span style={{ ...styles.badge, backgroundColor: s.priority === 'critical' ? '#fee2e2' : s.priority === 'high' ? '#fef3c7' : s.priority === 'medium' ? '#dbeafe' : '#dcfce7', color: s.priority === 'critical' ? '#991b1b' : s.priority === 'high' ? '#92400e' : s.priority === 'medium' ? '#1e40af' : '#166534' }}>{s.priority}</span></td>
                <td style={styles.td}><span style={{ ...styles.badge2, backgroundColor: s.status === 'completed' ? '#dcfce7' : s.status === 'cancelled' ? '#f3f4f6' : s.status === 'overdue' ? '#fee2e2' : '#dbeafe', color: s.status === 'completed' ? '#166534' : s.status === 'cancelled' ? '#6b7280' : s.status === 'overdue' ? '#991b1b' : '#1e40af' }}>{s.status.replace(/_/g, ' ')}</span></td>
                {user?.role === 'admin' && (
                  <td style={styles.td}>
                    <button style={styles.editBtn} onClick={() => handleEdit(s)}>Edit</button>
                    <button style={styles.deleteBtn} onClick={() => handleDelete(s.id)}>Cancel</button>
                  </td>
                )}
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center', color: '#6b7280', padding: '24px' }}>No schedules found</td></tr>}
          </tbody>
        </table>
      </div>
      {showForm && (
        <div style={styles.modalOverlay} onClick={() => { setShowForm(false); setEditingSchedule(null); }}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <MaintenanceForm
              initialData={editingSchedule}
              onSubmit={async (form) => {
                if (editingSchedule) {
                  await apiFetch(`/maintenance/${editingSchedule.id}`, { method: 'PUT', body: JSON.stringify(form) }, token, csrfToken);
                } else {
                  await apiFetch('/maintenance', { method: 'POST', body: JSON.stringify(form) }, token, csrfToken);
                }
                setShowForm(false);
                setEditingSchedule(null);
                loadSchedules();
              }}
              onCancel={() => { setShowForm(false); setEditingSchedule(null); }}
              submitLabel={editingSchedule ? 'Update' : 'Add Schedule'}
            />
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' },
  heading: { margin: 0, fontSize: '28px', color: '#1f2937', fontWeight: '700' },
  subtitle: { margin: '4px 0 0 0', color: '#6b7280', fontSize: '14px' },
  addBtn: { padding: '10px 20px', backgroundColor: '#F97316', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' },
  filters: { display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' },
  filterSelect: { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', backgroundColor: '#fff' },
  calendarWrap: { backgroundColor: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e5e7eb', marginBottom: '32px' },
  listTitle: { fontSize: '18px', color: '#1f2937', fontWeight: '600' },
  tableWrap: { borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginTop: '12px' },
  table: { width: '100%', borderCollapse: 'collapse', backgroundColor: '#fff' },
  th: { textAlign: 'left', padding: '10px', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '13px', fontWeight: '600', color: '#374151', whiteSpace: 'nowrap' },
  td: { padding: '10px', borderBottom: '1px solid #e5e7eb', fontSize: '13px', color: '#374151', whiteSpace: 'nowrap' },
  badge: { padding: '3px 8px', borderRadius: '9999px', fontSize: '11px', fontWeight: '600', textTransform: 'capitalize' },
  badge2: { padding: '3px 8px', borderRadius: '9999px', fontSize: '11px', fontWeight: '600', textTransform: 'capitalize' },
  editBtn: { padding: '4px 10px', backgroundColor: '#F97316', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', marginRight: '6px' },
  deleteBtn: { padding: '4px 10px', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
  modalContent: { backgroundColor: '#fff', borderRadius: '12px', padding: '24px', maxWidth: '700px', width: '100%', maxHeight: '90vh', overflowY: 'auto' },
};
