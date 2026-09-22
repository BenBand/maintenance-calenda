import { useCallback, useState } from 'react';
import { useAuth } from '../services/auth';
import { apiFetch, readApiData } from '../services/api';
import { useApiData } from '../hooks/useApiData';
import MaintenanceForm from '../components/MaintenanceForm';
import ServiceMaintenanceForm from '../components/ServiceMaintenanceForm';
import Modal from '../components/Modal';
import { EmptyState, ErrorState, SkeletonPage } from '../components/AsyncState';

export default function Dashboard() {
  const { user } = useAuth();
  const [showAddForm, setShowAddForm] = useState(false);
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [actionError, setActionError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const loadDashboard = useCallback(async () => {
    const [allRes, upcomingRes, overdueRes, servicesRes] = await Promise.all([
      apiFetch('/maintenance', {}),
      apiFetch('/maintenance/upcoming', {}),
      apiFetch('/maintenance/overdue', {}),
      apiFetch('/services', {}),
    ]);

    return {
      schedules: await readApiData(allRes),
      upcoming: await readApiData(upcomingRes),
      overdue: await readApiData(overdueRes),
      serviceRecords: await readApiData(servicesRes),
    };
  }, []);

  const { data, loading, error, reload } = useApiData(loadDashboard);
  const schedules = data?.schedules || [];
  const upcoming = data?.upcoming || [];
  const overdue = data?.overdue || [];
  const serviceRecords = data?.serviceRecords || [];

  const handleAddSubmit = async (formData) => {
    setActionError('');
    setActionLoading(true);
    try {
      await apiFetch('/maintenance', { method: 'POST', body: JSON.stringify(formData) });
      setShowAddForm(false);
      await reload();
    } catch (err) {
      setActionError(err.message || 'Unable to add schedule');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure?')) return;
    setActionError('');
    setActionLoading(true);
    try {
      await apiFetch(`/maintenance/${id}`, { method: 'DELETE' });
      await reload();
    } catch (err) {
      setActionError(err.message || 'Unable to cancel schedule');
    } finally {
      setActionLoading(false);
    }
  };

  const handleServiceSubmit = async (formData) => {
    setActionError('');
    setActionLoading(true);
    try {
      await apiFetch('/services', { method: 'POST', body: JSON.stringify(formData) });
      setShowServiceForm(false);
      setSelectedSchedule(null);
      await reload();
    } catch (err) {
      setActionError(err.message || 'Unable to complete service record');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading && !data) return <SkeletonPage label="Loading dashboard..." />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="page" aria-busy={loading}>
      <header className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Welcome, {user?.username || 'team member'}</p>
        </div>
        {user?.role === 'admin' && (
          <button className="button button--primary" type="button" onClick={() => setShowAddForm(true)}>+ Add Schedule</button>
        )}
      </header>

      {(error || actionError) && (
        <div className="inline-alert" role="alert">
          <span>{error || actionError}</span>
          {error && <button className="button button--secondary button--small" type="button" onClick={reload}>Retry</button>}
        </div>
      )}
      {actionLoading && <div className="refresh-indicator" role="status"><span className="spinner spinner--small" aria-hidden="true" />Saving changes...</div>}

      <div className="stats-grid" aria-label="Maintenance summary">
        <div className="stat-card"><div className="stat-card__number">{schedules.length}</div><div className="stat-card__label">Total Schedules</div></div>
        <div className="stat-card stat-card--danger"><div className="stat-card__number">{overdue.length}</div><div className="stat-card__label">Overdue</div></div>
        <div className="stat-card stat-card--success"><div className="stat-card__number">{upcoming.filter((schedule) => schedule.status === 'scheduled').length}</div><div className="stat-card__label">Upcoming</div></div>
        <div className="stat-card stat-card--info"><div className="stat-card__number">{serviceRecords.length}</div><div className="stat-card__label">Service Records</div></div>
      </div>

      {overdue.length > 0 && (
        <section className="section-block" aria-labelledby="overdue-title">
          <h2 className="section-title" id="overdue-title">Overdue Reminders <span className="count-badge">{overdue.length}</span></h2>
          <div className="alert-list">
            {overdue.map((schedule) => (
              <article className="alert-card" key={schedule.id}>
                <div className="alert-card__title"><span className="text-capitalize">{schedule.asset_type.replace(/_/g, ' ')}</span> - {schedule.description || schedule.room}</div>
                <div className="alert-card__detail">Date: {schedule.date} | Dept: {schedule.department} | Technician: {schedule.technician}</div>
                <div className="alert-card__actions">
                  <button className="button button--primary button--small" type="button" onClick={() => { setSelectedSchedule(schedule); setShowServiceForm(true); }}>Service Now</button>
                  {user?.role === 'admin' && <button className="button button--danger button--small" type="button" onClick={() => handleDelete(schedule.id)} disabled={actionLoading}>Cancel</button>}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="section-block" aria-labelledby="upcoming-title">
        <h2 className="section-title" id="upcoming-title">Upcoming Reminders <span className="count-badge">{upcoming.length}</span></h2>
        {upcoming.length === 0 ? <EmptyState>No upcoming maintenance scheduled</EmptyState> : (
          <div className="event-list">
            {upcoming.slice(0, 5).map((schedule) => (
              <article className="event-item" key={schedule.id}>
                <div className="event-item__title">{schedule.date} - {schedule.department} ({schedule.room})</div>
                <div className="event-item__meta">{schedule.asset_type.replace(/_/g, ' ')} - {schedule.description || ''}</div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="section-block" aria-labelledby="records-title">
        <h2 className="section-title" id="records-title">Recent Service Records</h2>
        <div className="table-wrap">
          <table className="data-table">
            <caption className="sr-only">Recent service records</caption>
            <thead><tr><th scope="col">Date</th><th scope="col">Asset</th><th scope="col">Work Performed</th><th scope="col">Outcome</th><th scope="col">Signer</th></tr></thead>
            <tbody>
              {serviceRecords.slice(0, 10).map((record) => (
                <tr key={record.id}>
                  <td>{record.signer_date || record.created_at?.split('T')[0] || '-'}</td>
                  <td>{record.asset_type?.replace(/_/g, ' ') || '-'}</td>
                  <td>{record.work_performed?.substring(0, 60)}{record.work_performed?.length > 60 ? '...' : ''}</td>
                  <td>{record.outcome || '-'}</td>
                  <td>{record.signed_by || '-'}</td>
                </tr>
              ))}
              {serviceRecords.length === 0 && <tr><td colSpan="5"><EmptyState>No service records yet</EmptyState></td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {showAddForm && (
        <Modal title="Add Maintenance Schedule" onClose={() => setShowAddForm(false)}>
          <MaintenanceForm onSubmit={handleAddSubmit} onCancel={() => setShowAddForm(false)} submitLabel="Add Schedule" loading={actionLoading} />
        </Modal>
      )}
      {showServiceForm && selectedSchedule && (
        <Modal title={`Service Maintenance - ${selectedSchedule.description || selectedSchedule.asset_type}`} onClose={() => { setShowServiceForm(false); setSelectedSchedule(null); }}>
          <ServiceMaintenanceForm schedule={selectedSchedule} onSubmit={handleServiceSubmit} onCancel={() => { setShowServiceForm(false); setSelectedSchedule(null); }} loading={actionLoading} />
        </Modal>
      )}
    </div>
  );
}
