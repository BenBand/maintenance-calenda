import { useCallback, useState } from 'react';
import { useAuth } from '../services/auth';
import { apiFetch, readApiData } from '../services/api';
import { useApiData } from '../hooks/useApiData';
import Calendar from '../components/Calendar';
import MaintenanceForm from '../components/MaintenanceForm';
import Modal from '../components/Modal';
import { EmptyState, ErrorState, SkeletonPage } from '../components/AsyncState';

export default function CalendarPage() {
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [filterDept, setFilterDept] = useState('');
  const [filterAssetType, setFilterAssetType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');

  const loadPage = useCallback(async () => {
    const [schedulesRes, departmentsRes] = await Promise.all([
      apiFetch('/maintenance', {}),
      apiFetch('/maintenance/departments', {}),
    ]);
    return {
      schedules: await readApiData(schedulesRes),
      departments: await readApiData(departmentsRes),
    };
  }, []);

  const { data, loading, error, reload } = useApiData(loadPage);
  const schedules = data?.schedules || [];
  const departments = data?.departments || [];
  const filtered = schedules.filter((schedule) => {
    if (filterDept && schedule.department !== filterDept) return false;
    if (filterAssetType && schedule.asset_type !== filterAssetType) return false;
    if (filterStatus && schedule.status !== filterStatus) return false;
    return true;
  });

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to cancel this schedule?')) return;
    setFormError('');
    setFormLoading(true);
    try {
      await apiFetch(`/maintenance/${id}`, { method: 'DELETE' });
      await reload();
    } catch (err) {
      setFormError(err.message || 'Unable to cancel schedule');
    } finally {
      setFormLoading(false);
    }
  };

  const handleSubmit = async (formData) => {
    setFormError('');
    setFormLoading(true);
    try {
      if (editingSchedule) {
        await apiFetch(`/maintenance/${editingSchedule.id}`, { method: 'PUT', body: JSON.stringify(formData) });
      } else {
        await apiFetch('/maintenance', { method: 'POST', body: JSON.stringify(formData) });
      }
      setShowForm(false);
      setEditingSchedule(null);
      await reload();
    } catch (err) {
      setFormError(err.message || 'Unable to save schedule');
    } finally {
      setFormLoading(false);
    }
  };

  if (loading && !data) return <SkeletonPage label="Loading maintenance calendar..." />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="page" aria-busy={loading}>
      <header className="page-header">
        <div>
          <h1 className="page-title">Maintenance Calendar</h1>
          <p className="page-subtitle">Lusaka City Council - Schedule Management</p>
        </div>
        {user?.role === 'admin' && <button className="button button--primary" type="button" onClick={() => { setEditingSchedule(null); setShowForm(true); }}>+ Add Schedule</button>}
      </header>

      {(error || formError) && <div className="inline-alert" role="alert"><span>{error || formError}</span>{error && <button className="button button--secondary button--small" type="button" onClick={reload}>Retry</button>}</div>}
      {formLoading && <div className="refresh-indicator" role="status"><span className="spinner spinner--small" aria-hidden="true" />Saving schedule...</div>}

      <div className="filters" aria-label="Calendar filters">
        <div className="filter-group">
          <label className="sr-only" htmlFor="filter-department">Department</label>
          <select className="input" id="filter-department" value={filterDept} onChange={(event) => setFilterDept(event.target.value)}>
            <option value="">All Departments</option>
            {departments.map((department) => <option key={department} value={department}>{department}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label className="sr-only" htmlFor="filter-asset-type">Asset type</label>
          <select className="input" id="filter-asset-type" value={filterAssetType} onChange={(event) => setFilterAssetType(event.target.value)}>
            <option value="">All Asset Types</option>
            <option value="laptop">Laptop</option>
            <option value="desktop">Desktop</option>
            <option value="network_equipment">Network Equipment</option>
            <option value="printer">Printer</option>
          </select>
        </div>
        <div className="filter-group">
          <label className="sr-only" htmlFor="filter-status">Status</label>
          <select className="input" id="filter-status" value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)}>
            <option value="">All Status</option>
            <option value="scheduled">Scheduled</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="overdue">Overdue</option>
          </select>
        </div>
      </div>

      <section className="calendar-card" aria-label="Maintenance calendar">
        <Calendar schedules={filtered} />
      </section>

      <section aria-labelledby="all-schedules-title">
        <h2 className="section-title" id="all-schedules-title">All Schedules</h2>
        <div className="table-wrap">
          <table className="data-table">
            <caption className="sr-only">All maintenance schedules</caption>
            <thead>
              <tr><th scope="col">Date</th><th scope="col">Department</th><th scope="col">Room</th><th scope="col">Asset Type</th><th scope="col">Technician</th><th scope="col">Priority</th><th scope="col">Status</th>{user?.role === 'admin' && <th scope="col">Actions</th>}</tr>
            </thead>
            <tbody>
              {filtered.map((schedule) => (
                <tr key={schedule.id}>
                  <td>{schedule.date}</td>
                  <td>{schedule.department}</td>
                  <td>{schedule.room}</td>
                  <td>{schedule.asset_type.replace(/_/g, ' ')}</td>
                  <td>{schedule.technician}</td>
                  <td><span className={`badge badge--${schedule.priority}`}>{schedule.priority}</span></td>
                  <td><span className={`badge badge--status-${schedule.status}`}>{schedule.status.replace(/_/g, ' ')}</span></td>
                  {user?.role === 'admin' && (
                    <td>
                      <button className="button button--primary button--small" type="button" onClick={() => { setEditingSchedule(schedule); setShowForm(true); }} aria-label={`Edit schedule ${schedule.id}`}>Edit</button>
                      <button className="button button--danger button--small" type="button" onClick={() => handleDelete(schedule.id)} disabled={formLoading} aria-label={`Cancel schedule ${schedule.id}`}>Cancel</button>
                    </td>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={user?.role === 'admin' ? 8 : 7}><EmptyState>No schedules found</EmptyState></td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {showForm && (
        <Modal title={editingSchedule ? 'Edit Maintenance Schedule' : 'Add Maintenance Schedule'} onClose={() => { setShowForm(false); setEditingSchedule(null); }}>
          <MaintenanceForm initialData={editingSchedule} onSubmit={handleSubmit} onCancel={() => { setShowForm(false); setEditingSchedule(null); }} submitLabel={editingSchedule ? 'Update' : 'Add Schedule'} loading={formLoading} />
        </Modal>
      )}
    </div>
  );
}
