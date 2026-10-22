import { useState } from 'react';
import { useAuth } from '../services/auth';
import { PERMISSIONS } from '../services/permissions';
import { apiFetch, readApiData } from '../services/api';
import { useApiData } from '../hooks/useApiData';
import Modal from '../components/Modal';
import { EmptyState, ErrorState, SkeletonPage } from '../components/AsyncState';

export default function NoticesPage() {
  const { user, can } = useAuth();
  const canManage = can(PERMISSIONS.MAINTENANCE_WRITE);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: '', message: '', notice_type: 'planned_outage', 
    affected_directorates: '', affected_departments: '', start_time: '', end_time: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadNotices = async () => {
    const res = await apiFetch('/notices', {});
    const data = await readApiData(res);
    return Array.isArray(data) ? data : [];
  };

  const { data: notices, loading: pageLoading, error: pageError, reload } = useApiData(loadNotices);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const payload = {
        ...form,
        affected_directorates: form.affected_directorates ? form.affected_directorates.split(',').map(s => s.trim()) : [],
        affected_departments: form.affected_departments ? form.affected_departments.split(',').map(s => s.trim()) : [],
      };
      await apiFetch('/notices', { method: 'POST', body: JSON.stringify(payload) });
      setShowForm(false);
      setForm({ title: '', message: '', notice_type: 'planned_outage', affected_directorates: '', affected_departments: '', start_time: '', end_time: '' });
      await reload();
    } catch (err) {
      setError(err.message || 'Failed to create notice');
    } finally {
      setLoading(false);
    }
  };

  const handlePublish = async (id) => {
    try {
      await apiFetch(`/notices/${id}/publish`, { method: 'POST' });
      await reload();
    } catch (err) {
      alert(err.message || 'Failed to publish');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this notice?')) return;
    try {
      await apiFetch(`/notices/${id}`, { method: 'DELETE' });
      await reload();
    } catch (err) {
      alert(err.message || 'Failed to delete');
    }
  };

  if (pageLoading) return <SkeletonPage />;
  if (pageError) return <ErrorState message={pageError} onRetry={reload} />;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Planned Maintenance Notices</h1>
          <p>Communicate scheduled outages and maintenance to all departments</p>
        </div>
        {canManage && (
          <button className="button button--primary" onClick={() => setShowForm(true)}>
            Create Notice
          </button>
        )}
      </header>

      <section className="card">
        {notices?.length === 0 ? (
          <EmptyState title="No notices" description="Create a notice to inform departments about planned maintenance or outages" />
        ) : (
          <div className="list-stack">
            {notices.map((notice) => (
              <article key={notice.id} className="card" style={{ margin: 0 }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div>
                    <h3 style={{ margin: 0 }}>{notice.title}</h3>
                    <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
                      Type: {notice.notice_type.replace('_', ' ')} | Starts: {new Date(notice.start_time).toLocaleString()}
                      {notice.end_time && ` | Ends: ${new Date(notice.end_time).toLocaleString()}`}
                    </div>
                  </div>
                  <span className={`pill ${notice.published ? 'pill--success' : 'pill--warning'}`}>
                    {notice.published ? 'Published' : 'Draft'}
                  </span>
                </header>
                <p style={{ whiteSpace: 'pre-wrap' }}>{notice.message}</p>
                {(notice.affected_directorates?.length > 0 || notice.affected_departments?.length > 0) && (
                  <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '8px' }}>
                    {notice.affected_directorates?.length > 0 && <div>Affected Directorates: {notice.affected_directorates.join(', ')}</div>}
                    {notice.affected_departments?.length > 0 && <div>Affected Departments: {notice.affected_departments.join(', ')}</div>}
                  </div>
                )}
                {canManage && (
                  <footer style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                    {!notice.published && (
                      <button className="button button--small" onClick={() => handlePublish(notice.id)}>Publish</button>
                    )}
                    <button className="button button--small button--danger" onClick={() => handleDelete(notice.id)}>Delete</button>
                  </footer>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Create Maintenance Notice">
        <form onSubmit={handleSubmit} className="form-stack">
          {error && <div className="inline-alert"><span>{error}</span></div>}
          <div className="form-field">
            <label className="field-label">Title *</label>
            <input className="input" value={form.title} onChange={(e) => setForm({...form, title: e.target.value})} required />
          </div>
          <div className="form-field">
            <label className="field-label">Notice Type</label>
            <select className="select" value={form.notice_type} onChange={(e) => setForm({...form, notice_type: e.target.value})}>
              <option value="planned_outage">Planned Outage</option>
              <option value="emergency">Emergency</option>
              <option value="general">General</option>
              <option value="advisory">Advisory</option>
            </select>
          </div>
          <div className="form-grid">
            <div className="form-field">
              <label className="field-label">Start Time *</label>
              <input type="datetime-local" className="input" value={form.start_time} onChange={(e) => setForm({...form, start_time: e.target.value})} required />
            </div>
            <div className="form-field">
              <label className="field-label">End Time</label>
              <input type="datetime-local" className="input" value={form.end_time} onChange={(e) => setForm({...form, end_time: e.target.value})} />
            </div>
          </div>
          <div className="form-field">
            <label className="field-label">Affected Directorates (comma separated)</label>
            <input className="input" value={form.affected_directorates} onChange={(e) => setForm({...form, affected_directorates: e.target.value})} placeholder="e.g., Finance, Human Resources" />
          </div>
          <div className="form-field">
            <label className="field-label">Affected Departments (comma separated)</label>
            <input className="input" value={form.affected_departments} onChange={(e) => setForm({...form, affected_departments: e.target.value})} placeholder="e.g., IT, Accounts" />
          </div>
          <div className="form-field">
            <label className="field-label">Message *</label>
            <textarea className="textarea" rows={4} value={form.message} onChange={(e) => setForm({...form, message: e.target.value})} required />
          </div>
          <div className="form-actions">
            <button type="button" className="button" onClick={() => setShowForm(false)}>Cancel</button>
            <button type="submit" className="button button--primary" disabled={loading}>{loading ? 'Creating...' : 'Create'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
