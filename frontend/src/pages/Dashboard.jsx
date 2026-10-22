import { useCallback, useState } from 'react';
import { useAuth } from '../services/auth';
import NoticeBanner from '../components/NoticeBanner';
import { PERMISSIONS } from '../services/permissions';
import { apiFetch, readApiData, readApiArray } from '../services/api';
import { useApiData } from '../hooks/useApiData';
import MaintenanceForm from '../components/MaintenanceForm';
import ServiceMaintenanceForm from '../components/ServiceMaintenanceForm';
import Modal from '../components/Modal';
import { EmptyState, ErrorState, SkeletonPage } from '../components/AsyncState';
import { formatSlotRange, formatMinutes } from '../utils/datetime';

export default function Dashboard() {
  const { user, can } = useAuth();
  const [showAddForm, setShowAddForm] = useState(false);
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [actionError, setActionError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const canReadServices = can(PERMISSIONS.SERVICE_READ);
  const canWriteSchedules = can(PERMISSIONS.MAINTENANCE_WRITE);
  const canDeleteSchedules = can(PERMISSIONS.MAINTENANCE_DELETE);
  const canWriteServices = can(PERMISSIONS.SERVICE_WRITE);
  const canReadAnalytics = can(PERMISSIONS.ANALYTICS_READ);
  const canReadAssets = can(PERMISSIONS.ASSET_READ);

  const loadDashboard = useCallback(async () => {
    // Staff cannot read service records, so only fetch them when permitted.
    // `/upcoming` and `/overdue` answer with `{ schedules, recurrences }`, so
    // they must be read as lists rather than through readApiData.
    const [allRes, upcomingRes, overdueRes, servicesRes, overviewRes] = await Promise.all([
      apiFetch('/maintenance', { limit: 200 }),
      apiFetch('/maintenance/upcoming', { days: 14 }),
      apiFetch('/maintenance/overdue', {}),
      canReadServices ? apiFetch('/services', { limit: 10 }) : Promise.resolve(null),
      canReadAnalytics ? apiFetch('/analytics/overview?period=90d', {}, { retry: false }) : Promise.resolve(null),
    ]);

    const [upcoming, upcomingRecurrences] = await Promise.all([
      readApiArray(upcomingRes, 'schedules'),
      readApiArray(upcomingRes, 'recurrences'),
    ]);
    const [overdue, overdueRecurrences] = await Promise.all([
      readApiArray(overdueRes, 'schedules'),
      readApiArray(overdueRes, 'recurrences'),
    ]);

    let overview = null;
    if (overviewRes && overviewRes.ok) {
      overview = await readApiData(overviewRes);
    }

    return {
      schedules: await readApiArray(allRes, 'data'),
      // Generated recurrence occurrences are real upcoming work, so merge them
      // in and tag them so the UI can label their origin.
      upcoming: [...upcoming, ...upcomingRecurrences.map((r) => ({ ...r, is_occurrence: true }))],
      overdue: [...overdue, ...overdueRecurrences.map((r) => ({ ...r, is_occurrence: true }))],
      serviceRecords: servicesRes ? await readApiArray(servicesRes, 'data') : [],
      overview,
    };
  }, [canReadServices, canReadAnalytics]);

  const { data, loading, error, reload } = useApiData(loadDashboard);
  const schedules = data?.schedules || [];
  const upcoming = data?.upcoming || [];
  const overdue = data?.overdue || [];
  const serviceRecords = data?.serviceRecords || [];
  const overview = data?.overview || null;

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

  const summary = overview?.schedules;
  const assets = overview?.assets;

  return (
    <div className="page page--wide" aria-busy={loading}>
      <header className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Welcome, {user?.username || 'team member'}</p>
        </div>
        {canWriteSchedules && (
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
        <div className="stat-card"><div className="stat-card__number">{summary ? summary.total : schedules.length}</div><div className="stat-card__label">Total Schedules</div></div>
        <div className="stat-card stat-card--danger"><div className="stat-card__number">{summary ? summary.overdue : overdue.length}</div><div className="stat-card__label">Overdue</div></div>
        <div className="stat-card stat-card--success"><div className="stat-card__number">{upcoming.length}</div><div className="stat-card__label">Next 14 Days</div></div>
        <div className="stat-card stat-card--info"><div className="stat-card__number">{canReadServices ? serviceRecords.length : '-'}</div><div className="stat-card__label">Service Records</div></div>
      </div>

      {summary && (
        <div className="stats-grid stats-grid--secondary" aria-label="Performance summary">
          <div className="stat-card stat-card--compact">
            <div className="stat-card__number">{summary.completion_rate}%</div>
            <div className="stat-card__label">Completion Rate</div>
            <div className="stat-card__hint">last 90 days</div>
          </div>
          {canReadAssets && assets && (
            <div className="stat-card stat-card--compact">
              <div className="stat-card__number">{assets.in_service}</div>
              <div className="stat-card__label">Assets In Service</div>
              <div className="stat-card__hint">
                {assets.warranty_expiring} warranty expiring
                {assets.end_of_life_soon ? `, ${assets.end_of_life_soon} end-of-life` : ''}
              </div>
            </div>
          )}
          {summary.avg_resolution_hours != null && (
            <div className="stat-card stat-card--compact">
              <div className="stat-card__number">{Math.round(summary.avg_resolution_hours)}h</div>
              <div className="stat-card__label">Avg Resolution</div>
              <div className="stat-card__hint">schedule to service record</div>
            </div>
          )}
        </div>
      )}

      {canReadAnalytics && (
        <section className="section-block" aria-labelledby="quick-links-title">
          <h2 className="section-title" id="quick-links-title">Detailed Reporting</h2>
          <div className="quick-links">
            <a className="quick-link" href="/analytics">
              <span className="quick-link__title">Analytics</span>
              <span className="quick-link__meta">Maintenance frequency, technician workload, overdue trend, time tracking, uptime</span>
            </a>
            {canReadAssets && (
              <a className="quick-link" href="/assets">
                <span className="quick-link__title">Asset Registry</span>
                <span className="quick-link__meta">Procurement to disposal, warranty and end-of-life tracking</span>
              </a>
            )}
          </div>
        </section>
      )}

      {overdue.length > 0 && (
        <section className="section-block" aria-labelledby="overdue-title">
          <h2 className="section-title" id="overdue-title">Overdue Reminders <span className="count-badge">{overdue.length}</span></h2>
          <div className="alert-list">
            {overdue.map((schedule) => (
              <article className="alert-card" key={`${schedule.parent_schedule_id || 's'}-${schedule.id}`}>
                <div className="alert-card__title"><span className="text-capitalize">{String(schedule.asset_type || '').replace(/_/g, ' ')}</span> - {schedule.description || schedule.room}</div>
                <div className="alert-card__detail">
                  {formatSlotRange(schedule.scheduled_at, schedule.scheduled_end)}
                  {' | '}Dept: {schedule.department}
                  {' | '}Technician: {schedule.technician}
                  {schedule.hours_overdue != null && <span className="alert-card__late"> · {Math.round(schedule.hours_overdue)}h late</span>}
                </div>
                <div className="alert-card__actions">
                  {!schedule.is_occurrence && canWriteServices && (
                    <button className="button button--primary button--small" type="button" onClick={() => { setSelectedSchedule(schedule); setShowServiceForm(true); }}>Service Now</button>
                  )}
                  {!schedule.is_occurrence && canDeleteSchedules && (
                    <button className="button button--danger button--small" type="button" onClick={() => handleDelete(schedule.id)} disabled={actionLoading}>Cancel</button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="section-block" aria-labelledby="upcoming-title">
        <h2 className="section-title" id="upcoming-title">Upcoming Slots <span className="count-badge">{upcoming.length}</span></h2>
        {upcoming.length === 0 ? <EmptyState>No upcoming maintenance scheduled</EmptyState> : (
          <div className="event-list">
            {upcoming.slice(0, 6).map((schedule) => (
              <article className="event-item" key={`${schedule.parent_schedule_id || 's'}-${schedule.id}`}>
                <div className="event-item__title">
                  <span className="event-item__time">{formatSlotRange(schedule.scheduled_at, schedule.scheduled_end)}</span>
                  {schedule.department} ({schedule.room})
                </div>
                <div className="event-item__meta">
                  {String(schedule.asset_type || '').replace(/_/g, ' ')} - {schedule.description || ''}
                  {schedule.technician ? ` - ${schedule.technician}` : ''}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {canReadServices && (
        <section className="section-block" aria-labelledby="records-title">
          <h2 className="section-title" id="records-title">Recent Service Records</h2>
          <div className="table-wrap">
            <table className="data-table data-table--responsive">
              <caption className="sr-only">Recent service records</caption>
              <thead><tr><th scope="col">Date</th><th scope="col">Asset</th><th scope="col">Work Performed</th><th scope="col">Outcome</th><th scope="col">Time Spent</th><th scope="col">Signer</th></tr></thead>
              <tbody>
                {serviceRecords.slice(0, 10).map((record) => (
                  <tr key={record.id}>
                    <td data-label="Date">{record.signer_date || record.created_at?.split('T')[0] || '-'}</td>
                    <td data-label="Asset">{record.registry_asset_identifier || record.asset_identifier || record.asset_type?.replace(/_/g, ' ') || '-'}</td>
                    <td data-label="Work performed">{record.work_performed?.substring(0, 60)}{record.work_performed?.length > 60 ? '...' : ''}</td>
                    <td data-label="Outcome">{record.outcome || '-'}</td>
                    <td data-label="Time Spent">{record.time_spent_minutes > 0 ? formatMinutes(record.time_spent_minutes) : '-'}</td>
                    {/* `signed_by` was renamed to signer_name_legacy in migration 000004. */}
                    <td data-label="Signer">{record.signer_name || record.signed_by_name || '-'}</td>
                  </tr>
                ))}
                {serviceRecords.length === 0 && <tr><td colSpan="6"><EmptyState>No service records yet</EmptyState></td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {showAddForm && canWriteSchedules && (
        <Modal title="Add Maintenance Schedule" onClose={() => setShowAddForm(false)}>
          <MaintenanceForm
            onSubmit={handleAddSubmit}
            onCancel={() => setShowAddForm(false)}
            submitLabel="Add Schedule"
            loading={actionLoading}
            departments={[]}
            technicians={[]}
          />
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

