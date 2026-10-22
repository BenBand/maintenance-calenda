import { useCallback, useMemo, useState } from 'react';
import { useAuth } from '../services/auth';
import { PERMISSIONS } from '../services/permissions';
import { apiFetch, readApiArray, readApiData } from '../services/api';
import { useApiData } from '../hooks/useApiData';
import Calendar from '../components/Calendar';
import MaintenanceForm from '../components/MaintenanceForm';
import DowntimeForm from '../components/DowntimeForm';
import Modal from '../components/Modal';
import ServiceMaintenanceForm from '../components/ServiceMaintenanceForm';
import { EmptyState, ErrorState, SkeletonPage } from '../components/AsyncState';
import {
  formatShortDate, formatTimeRange, humanizeKey, startOfDay, toLocalDateKey,
} from '../utils/datetime';
import './calendar-page.css';

const STATUSES = ['scheduled', 'in_progress', 'completed', 'cancelled', 'overdue'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];

export default function CalendarPage() {
  const { can } = useAuth();
  const canWrite = can(PERMISSIONS.MAINTENANCE_WRITE);
  const canDelete = can(PERMISSIONS.MAINTENANCE_DELETE);
  const canWriteServices = can(PERMISSIONS.SERVICE_WRITE);

  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [showForm, setShowForm] = useState(false);
  const [showDowntimeForm, setShowDowntimeForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [serviceSchedule, setServiceSchedule] = useState(null);
  const [prefill, setPrefill] = useState(null);
  const [filterDept, setFilterDept] = useState('');
  const [filterAssetType, setFilterAssetType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTechnician, setFilterTechnician] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');

  // Window covering the visible grid, so the calendar only fetches what it shows.
  const range = useMemo(() => {
    const start = new Date(anchor);
    start.setDate(start.getDate() - 31);
    const end = new Date(anchor);
    end.setDate(end.getDate() + 62);
    return { start: start.toISOString(), end: end.toISOString() };
  }, [anchor]);

  const loadPage = useCallback(async () => {
    const params = new URLSearchParams({
      start_date: range.start,
      end_date: range.end,
      include_recurrences: 'true',
      limit: '200',
    });
    if (filterDept) params.set('department', filterDept);

    const [schedulesRes, departmentsRes, windowsRes, availabilityRes] = await Promise.all([
      apiFetch(`/maintenance?${params.toString()}`, {}),
      apiFetch('/maintenance/departments', {}),
      apiFetch(`/downtime/windows?from=${encodeURIComponent(range.start)}&to=${encodeURIComponent(range.end)}`, {}),
      apiFetch(`/downtime/availability?date=${encodeURIComponent(toLocalDateKey(anchor))}${filterDept ? `&department=${encodeURIComponent(filterDept)}` : ''}`, {}),
    ]);

    return {
      schedules: await readApiArray(schedulesRes, 'data'),
      recurrences: await readApiArray(schedulesRes, 'recurrences'),
      departments: await readApiArray(departmentsRes),
      downtimeWindows: await readApiArray(windowsRes),
      availability: availabilityRes.ok ? await availabilityRes.json() : null,
    };
  }, [range, filterDept, anchor]);

  const { data, loading, error, reload } = useApiData(loadPage);

  const allSchedules = useMemo(() => {
    const primary = data?.schedules || [];
    const recurrences = (data?.recurrences || []).map((row) => ({ ...row, is_occurrence: true }));
    return [...primary, ...recurrences].sort(
      (a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at),
    );
  }, [data]);

  const filtered = useMemo(() => allSchedules.filter((schedule) => {
    if (filterDept && schedule.department !== filterDept) return false;
    if (filterAssetType && schedule.asset_type !== filterAssetType) return false;
    if (filterStatus && schedule.status !== filterStatus) return false;
    if (filterTechnician && schedule.technician !== filterTechnician) return false;
    return true;
  }), [allSchedules, filterDept, filterAssetType, filterStatus, filterTechnician]);

  const technicians = useMemo(() => {
    const set = new Set(allSchedules.map((schedule) => schedule.technician).filter(Boolean));
    return [...set].sort();
  }, [allSchedules]);

  const assetTypes = useMemo(() => {
    const set = new Set(allSchedules.map((schedule) => schedule.asset_type).filter(Boolean));
    return [...set].sort();
  }, [allSchedules]);

  const conflictIds = useMemo(() => {
    const ids = new Set();
    (data?.availability?.conflicts || []).forEach((conflict) => {
      ids.add(conflict.schedule_id);
      ids.add(conflict.conflicts_with);
    });
    return ids;
  }, [data]);

  const downtimeWindows = data?.downtimeWindows || [];
  const technicianLoad = data?.availability?.technician_load || [];
  const departments = data?.departments || [];

  const handleSlotClick = (schedule) => {
    setServiceSchedule(schedule);
  };

  const openCreateAt = (isoStart) => {
    setEditingSchedule(null);
    setPrefill({ scheduled_at: isoStart });
    setShowForm(true);
  };

  const handleSubmit = async (formData) => {
    setFormError('');
    setFormLoading(true);
    try {
      if (editingSchedule) {
        await apiFetch(`/maintenance/${editingSchedule.id}`, { method: 'PUT', body: JSON.stringify(formData) });
        // A changed recurrence rule needs its occurrences rebuilt.
        if (formData.recurrence_rule && formData.recurrence_rule !== 'none') {
          await apiFetch(`/maintenance/${editingSchedule.id}/generate-recurrences`, { method: 'POST' });
        }
      } else {
        const created = await apiFetch('/maintenance', { method: 'POST', body: JSON.stringify(formData) });
        // Occurrences live in their own table, so materialise them explicitly
        // or the new rule never appears on the grid.
        if (formData.recurrence_rule && formData.recurrence_rule !== 'none') {
          const scheduleId = await readApiData(created);
          if (scheduleId?.id) {
            await apiFetch(`/maintenance/${scheduleId.id}/generate-recurrences`, { method: 'POST' });
          }
        }
      }
      setShowForm(false);
      setEditingSchedule(null);
      setPrefill(null);
      await reload();
    } catch (err) {
      setFormError(err.message || 'Unable to save schedule');
    } finally {
      setFormLoading(false);
    }
  };

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

  const handleServiceSubmit = async (formData) => {
    setFormError('');
    setFormLoading(true);
    try {
      await apiFetch('/services', { method: 'POST', body: JSON.stringify(formData) });
      setServiceSchedule(null);
      await reload();
    } catch (err) {
      setFormError(err.message || 'Unable to complete service record');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDowntimeSubmit = async (formData) => {
    setFormError('');
    setFormLoading(true);
    try {
      await apiFetch('/downtime/windows', { method: 'POST', body: JSON.stringify(formData) });
      setShowDowntimeForm(false);
      await reload();
    } catch (err) {
      setFormError(err.message || 'Unable to save downtime window');
    } finally {
      setFormLoading(false);
    }
  };

  if (loading && !data) return <SkeletonPage label="Loading maintenance calendar..." />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="page page--wide calendar-page" aria-busy={loading}>
      <header className="page-header">
        <div>
          <h1 className="page-title">Maintenance Schedule</h1>
          <p className="page-subtitle">Book time slots and coordinate around downtime windows</p>
        </div>
        <div className="page-header-actions">
          {canWrite && (
            <button className="button button--secondary" type="button" onClick={() => setShowDowntimeForm(true)}>
              + Downtime Window
            </button>
          )}
          {canWrite && (
            <button
              className="button button--primary"
              type="button"
              onClick={() => { setEditingSchedule(null); setPrefill(null); setShowForm(true); }}
            >
              + Add Schedule
            </button>
          )}
        </div>
      </header>

      {(error || formError) && (
        <div className="inline-alert" role="alert">
          <span>{error || formError}</span>
          {error && <button className="button button--secondary button--small" type="button" onClick={reload}>Retry</button>}
        </div>
      )}
      {formLoading && (
        <div className="refresh-indicator" role="status">
          <span className="spinner spinner--small" aria-hidden="true" />Saving changes...
        </div>
      )}

      {conflictIds.size > 0 && (
        <div className="inline-alert inline-alert--warning" role="status">
          <span>
            {conflictIds.size} slot{conflictIds.size === 1 ? '' : 's'} conflict with another booking for the same
            technician or room. They are highlighted in red.
          </span>
        </div>
      )}

      <div className="filters" aria-label="Calendar filters">
        <div className="filter-group">
          <label className="sr-only" htmlFor="filter-department">Department</label>
          <select className="input" id="filter-department" value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
            <option value="">All Departments</option>
            {departments.map((department) => <option key={department} value={department}>{department}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label className="sr-only" htmlFor="filter-asset-type">Asset type</label>
          <select className="input" id="filter-asset-type" value={filterAssetType} onChange={(e) => setFilterAssetType(e.target.value)}>
            <option value="">All Asset Types</option>
            {assetTypes.map((type) => <option key={type} value={type}>{humanizeKey(type)}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label className="sr-only" htmlFor="filter-technician">Technician</label>
          <select className="input" id="filter-technician" value={filterTechnician} onChange={(e) => setFilterTechnician(e.target.value)}>
            <option value="">All Technicians</option>
            {technicians.map((tech) => <option key={tech} value={tech}>{tech}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label className="sr-only" htmlFor="filter-status">Status</label>
          <select className="input" id="filter-status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">All Status</option>
            {STATUSES.map((status) => <option key={status} value={status}>{humanizeKey(status)}</option>)}
          </select>
        </div>
      </div>

      <section className="calendar-card" aria-label="Maintenance calendar">
        <Calendar
          schedules={filtered}
          downtimeWindows={downtimeWindows}
          conflictIds={conflictIds}
          technicianLoad={technicianLoad}
          onSelectSlot={handleSlotClick}
          onSelectDateChange={openCreateAt}
          anchor={anchor}
          onAnchorChange={setAnchor}
        />
      </section>

      <section aria-labelledby="all-schedules-title">
        <h2 className="section-title" id="all-schedules-title">
          Scheduled Slots <span className="count-badge">{filtered.length}</span>
        </h2>
        <div className="table-wrap">
          <table className="data-table">
            <caption className="sr-only">All maintenance slots</caption>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Duration</th>
                <th scope="col">Department</th>
                <th scope="col">Room</th>
                <th scope="col">Asset</th>
                <th scope="col">Technician</th>
                <th scope="col">Priority</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((schedule) => {
                const key = `${schedule.parent_schedule_id || 's'}-${schedule.id}`;
                const hasConflict = conflictIds.has(schedule.id);
                const isOccurrence = Boolean(schedule.is_occurrence);
                return (
                  <tr key={key} className={hasConflict ? 'row--conflict' : undefined}>
                    <td data-label="When">
                      {formatShortDate(schedule.scheduled_at)}
                      <span className="cell-subtitle">{formatTimeRange(schedule.scheduled_at, schedule.scheduled_end)}</span>
                    </td>
                    <td data-label="Duration">{schedule.duration_minutes || 60} min</td>
                    <td data-label="Department">{schedule.department}</td>
                    <td data-label="Room">{schedule.room}</td>
                    <td data-label="Asset">
                      {schedule.registry_asset_identifier || schedule.asset_identifier || humanizeKey(schedule.asset_type)}
                    </td>
                    <td data-label="Technician">{schedule.technician}</td>
                    <td data-label="Priority">
                      <span className={`badge badge--${schedule.priority}`}>{schedule.priority}</span>
                    </td>
                    <td data-label="Status">
                      <span className={`badge badge--status-${schedule.status}`}>{humanizeKey(schedule.status)}</span>
                      {hasConflict && <span className="slot-card__flag">Conflict</span>}
                    </td>
                    <td data-label="Actions">
                      <div className="table-actions">
                        {!isOccurrence && canWriteServices && schedule.status !== 'completed' && (
                          <button
                            className="button button--primary button--small"
                            type="button"
                            onClick={() => setServiceSchedule(schedule)}
                          >
                            Service
                          </button>
                        )}
                        {!isOccurrence && canWrite && (
                          <button
                            className="button button--secondary button--small"
                            type="button"
                            onClick={() => { setEditingSchedule(schedule); setPrefill(null); setShowForm(true); }}
                            aria-label={`Edit slot ${schedule.id}`}
                          >
                            Edit
                          </button>
                        )}
                        {!isOccurrence && canDelete && (
                          <button
                            className="button button--danger button--small"
                            type="button"
                            onClick={() => handleDelete(schedule.id)}
                            disabled={formLoading}
                            aria-label={`Cancel slot ${schedule.id}`}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan="9"><EmptyState>No slots match these filters</EmptyState></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showForm && (
        <Modal
          title={editingSchedule ? 'Edit Maintenance Slot' : 'Add Maintenance Slot'}
          onClose={() => { setShowForm(false); setEditingSchedule(null); setPrefill(null); }}
        >
          <MaintenanceForm
            initialData={editingSchedule}
            prefill={prefill}
            availability={data?.availability}
            departments={departments}
            technicians={technicians}
            onSubmit={handleSubmit}
            onCancel={() => { setShowForm(false); setEditingSchedule(null); setPrefill(null); }}
            submitLabel={editingSchedule ? 'Update' : 'Add Schedule'}
            loading={formLoading}
          />
        </Modal>
      )}

      {showDowntimeForm && (
        <Modal title="Declare Downtime Window" onClose={() => setShowDowntimeForm(false)}>
          <DowntimeForm
            departments={departments}
            onSubmit={handleDowntimeSubmit}
            onCancel={() => setShowDowntimeForm(false)}
            loading={formLoading}
          />
        </Modal>
      )}

      {serviceSchedule && !serviceSchedule.is_occurrence && (
        <Modal
          title={`Service Maintenance - ${serviceSchedule.description || humanizeKey(serviceSchedule.asset_type)}`}
          onClose={() => setServiceSchedule(null)}
        >
          <ServiceMaintenanceForm
            schedule={serviceSchedule}
            onSubmit={handleServiceSubmit}
            onCancel={() => setServiceSchedule(null)}
            loading={formLoading}
          />
        </Modal>
      )}
    </div>
  );
}

export { PRIORITIES };
