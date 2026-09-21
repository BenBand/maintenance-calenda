import React, { useEffect, useState } from 'react';
import { useAuth, apiFetch } from '../services/auth';

const ASSET_TYPES = ['laptop', 'desktop', 'network_equipment', 'printer'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const STATUSES = ['open', 'in_progress', 'resolved', 'closed'];

export default function IncidentsPage() {
  const { token, user } = useAuth();
  const [incidents, setIncidents] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ title: '', description: '', department: '', room: '', asset_type: '', asset_identifier: '', priority: 'medium', status: 'open' });
  const [errors, setErrors] = useState({});
  const [filters, setFilters] = useState({ status: '', priority: '', department: '', search: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadIncidents(); loadDepartments(); }, []);

  const loadIncidents = async () => {
    try {
      const res = await apiFetch('/incidents', {}, token);
      if (res.ok) {
        const data = await res.json();
        setIncidents(data.data || data);
      }
    } catch (err) { console.error('Failed to load incidents', err); }
  };

  const loadDepartments = async () => {
    try {
      const res = await apiFetch('/maintenance/departments', {}, token);
      if (res.ok) setDepartments(await res.json());
    } catch (err) { console.error('Failed to load departments', err); }
  };

  const validate = () => {
    const e = {};
    if (!form.title) e.title = 'Title is required';
    if (!form.description) e.description = 'Description is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      if (editingId) {
        await apiFetch(`/incidents/${editingId}`, { method: 'PUT', body: JSON.stringify(form) }, token);
      } else {
        await apiFetch('/incidents', { method: 'POST', body: JSON.stringify(form) }, token);
      }
      setShowForm(false);
      setEditingId(null);
      setForm({ title: '', description: '', department: '', room: '', asset_type: '', asset_identifier: '', priority: 'medium', status: 'open' });
      setErrors({});
      loadIncidents();
    } catch (err) { console.error('Failed to save incident', err); }
    finally { setLoading(false); }
  };

  const handleEdit = (inc) => {
    setEditingId(inc.id);
    setForm({ title: inc.title, description: inc.description, department: inc.department || '', room: inc.room || '', asset_type: inc.asset_type || '', asset_identifier: inc.asset_identifier || '', priority: inc.priority || 'medium', status: inc.status || 'open' });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this incident?')) return;
    try {
      const res = await apiFetch(`/incidents/${id}`, { method: 'DELETE' }, token);
      if (res) { loadIncidents(); }
    } catch (err) { console.error('Failed to delete incident', err); }
  };

  const handleQuickStatus = async (inc, newStatus) => {
    try {
      await apiFetch(`/incidents/${inc.id}`, { method: 'PUT', body: JSON.stringify({ status: newStatus }) }, token);
      loadIncidents();
    } catch (err) { console.error('Failed to update status', err); }
  };

  const data = Array.isArray(incidents) ? incidents : (incidents?.data || []);

  const filtered = data.filter((r) => {
    if (filters.status && r.status !== filters.status) return false;
    if (filters.priority && r.priority !== filters.priority) return false;
    if (filters.department && r.department !== filters.department) return false;
    if (filters.search && !(r.title?.toLowerCase().includes(filters.search.toLowerCase()) || r.description?.toLowerCase().includes(filters.search.toLowerCase()))) return false;
    return true;
  });

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm({ title: '', description: '', department: '', room: '', asset_type: '', asset_identifier: '', priority: 'medium', status: 'open' });
    setErrors({});
  };

  return (
    <div>
      <div style={styles.header}>
        <div>
          <h1 style={styles.heading}>Incidents</h1>
          <p style={styles.subtitle}>Report and track maintenance incidents</p>
        </div>
        <button style={styles.addBtn} onClick={() => setShowForm(true)}>+ Report Incident</button>
      </div>

      <div style={styles.filters}>
        <input type="text" placeholder="Search incidents..." value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} style={styles.searchInput} />
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} style={styles.filterSelect}>
          <option value="">All Status</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <select value={filters.priority} onChange={(e) => setFilters({ ...filters, priority: e.target.value })} style={styles.filterSelect}>
          <option value="">All Priority</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={filters.department} onChange={(e) => setFilters({ ...filters, department: e.target.value })} style={styles.filterSelect}>
          <option value="">All Departments</option>
          {departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Reported</th>
              <th style={styles.th}>Title</th>
              <th style={styles.th}>Description</th>
              <th style={styles.th}>Asset</th>
              <th style={styles.th}>Priority</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Reported By</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td style={styles.td}>{r.created_at?.split('T')[0] || '-'}</td>
                <td style={styles.td}>{r.title}</td>
                <td style={styles.td}>{r.description?.substring(0, 60)}{r.description?.length > 60 ? '...' : ''}</td>
                <td style={styles.td}>{r.asset_type ? r.asset_type.replace(/_/g, ' ') : '-'}</td>
                <td style={styles.td}>
                  <span style={{ ...styles.badge, ...priorityColor(r.priority) }}>{r.priority}</span>
                </td>
                <td style={styles.td}>
                  <select value={r.status} onChange={(e) => handleQuickStatus(r, e.target.value)} style={{ ...styles.statusSelect, ...statusColor(r.status) }}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                  </select>
                </td>
                <td style={styles.td}>{r.reported_by_name || user?.username}</td>
                <td style={styles.td}>
                  <button style={styles.editBtn} onClick={() => handleEdit(r)}>Edit</button>
                  <button style={styles.deleteBtn} onClick={() => handleDelete(r.id)}>Delete</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', color: '#6b7280', padding: '24px' }}>No incidents found</td></tr>}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div style={styles.modalOverlay} onClick={closeForm}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>{editingId ? 'Edit Incident' : 'Report Incident'}</h3>
            <form onSubmit={handleSubmit} style={styles.form}>
              <div style={styles.field}>
                <label style={styles.label}>Title *</label>
                <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={{ ...styles.input, borderColor: errors.title ? '#dc2626' : '#d1d5db' }} required />
                {errors.title && <span style={styles.errorText}>{errors.title}</span>}
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Description *</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ ...styles.textarea, borderColor: errors.description ? '#dc2626' : '#d1d5db' }} placeholder="Describe the incident" rows={3} required />
                {errors.description && <span style={styles.errorText}>{errors.description}</span>}
              </div>
              <div style={styles.row}>
                <div style={styles.half}>
                  <label style={styles.label}>Department</label>
                  <select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} style={styles.input}>
                    <option value="">Select department</option>
                    {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div style={styles.half}>
                  <label style={styles.label}>Room</label>
                  <input type="text" value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} style={styles.input} />
                </div>
              </div>
              <div style={styles.row}>
                <div style={styles.half}>
                  <label style={styles.label}>Asset Type</label>
                  <select value={form.asset_type} onChange={(e) => setForm({ ...form, asset_type: e.target.value })} style={styles.input}>
                    <option value="">None</option>
                    {ASSET_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
                <div style={styles.half}>
                  <label style={styles.label}>Asset Identifier</label>
                  <input type="text" value={form.asset_identifier} onChange={(e) => setForm({ ...form, asset_identifier: e.target.value })} style={styles.input} placeholder="Serial/tag" />
                </div>
              </div>
              <div style={styles.row}>
                <div style={styles.half}>
                  <label style={styles.label}>Priority</label>
                  <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} style={styles.input}>
                    {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div style={styles.half}>
                  <label style={styles.label}>Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={styles.input}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
              </div>
              <div style={styles.actions}>
                <button type="submit" style={{ ...styles.submitBtn, opacity: loading ? 0.7 : 1 }} disabled={loading}>{loading ? 'Saving...' : (editingId ? 'Update Incident' : 'Report Incident')}</button>
                <button type="button" onClick={closeForm} style={styles.cancelBtn}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function priorityColor(priority) {
  const map = {
    low: { color: '#166534', backgroundColor: '#dcfce7' },
    medium: { color: '#1e40af', backgroundColor: '#dbeafe' },
    high: { color: '#92400e', backgroundColor: '#fef3c7' },
    critical: { color: '#991b1b', backgroundColor: '#fee2e2' },
  };
  return map[priority] || {};
}

function statusColor(status) {
  const map = {
    open: { color: '#1e40af', backgroundColor: '#dbeafe' },
    in_progress: { color: '#92400e', backgroundColor: '#fef3c7' },
    resolved: { color: '#15803d', backgroundColor: '#dcfce7' },
    closed: { color: '#6b7280', backgroundColor: '#f3f4f6' },
  };
  return map[status] || {};
}

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' },
  heading: { margin: 0, fontSize: '28px', color: '#1f2937', fontWeight: '700' },
  subtitle: { margin: '4px 0 0 0', color: '#6b7280', fontSize: '14px' },
  addBtn: { padding: '10px 20px', backgroundColor: '#F97316', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' },
  filters: { display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' },
  searchInput: { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', minWidth: '240px' },
  filterSelect: { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', backgroundColor: '#fff', minWidth: '160px' },
  tableWrap: { borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  table: { width: '100%', borderCollapse: 'collapse', backgroundColor: '#fff' },
  th: { textAlign: 'left', padding: '10px', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '13px', fontWeight: '600', color: '#374151' },
  td: { padding: '10px', borderBottom: '1px solid #e5e7eb', fontSize: '13px', color: '#374151' },
  badge: { padding: '3px 8px', borderRadius: '9999px', fontSize: '11px', fontWeight: '600', textTransform: 'capitalize' },
  statusSelect: { padding: '3px 8px', borderRadius: '9999px', fontSize: '11px', fontWeight: '600', textTransform: 'capitalize', border: '1px solid #e5e7eb', backgroundColor: '#fff', cursor: 'pointer' },
  editBtn: { padding: '4px 10px', backgroundColor: '#F97316', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', marginRight: '6px' },
  deleteBtn: { padding: '4px 10px', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
  modalContent: { backgroundColor: '#fff', borderRadius: '12px', padding: '24px', maxWidth: '700px', width: '100%', maxHeight: '90vh', overflowY: 'auto' },
  modalTitle: { margin: '0 0 16px 0', fontSize: '20px', color: '#1f2937' },
  form: { display: 'flex', flexDirection: 'column', gap: '4px' },
  row: { display: 'flex', gap: '16px', marginBottom: '4px' },
  half: { flex: 1, display: 'flex', flexDirection: 'column' },
  field: { marginBottom: '12px' },
  label: { fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '4px' },
  input: { padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', outline: 'none', backgroundColor: '#fff' },
  textarea: { padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', outline: 'none', resize: 'vertical', fontFamily: 'inherit' },
  errorText: { color: '#dc2626', fontSize: '12px', marginTop: '2px' },
  actions: { display: 'flex', gap: '12px', marginTop: '16px' },
  submitBtn: { padding: '12px 24px', backgroundColor: '#F97316', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '15px', fontWeight: '600', cursor: 'pointer' },
  cancelBtn: { padding: '12px 24px', backgroundColor: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '15px', fontWeight: '500', cursor: 'pointer' },
};
