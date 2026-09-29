import { useCallback, useState } from 'react';
import { useAuth } from '../services/auth';
import { PERMISSIONS } from '../services/permissions';
import { apiFetch, readApiData } from '../services/api';
import { useApiData } from '../hooks/useApiData';
import Modal from '../components/Modal';
import { EmptyState, ErrorState, SkeletonPage } from '../components/AsyncState';

const ASSET_TYPES = ['laptop', 'desktop', 'network_equipment', 'printer'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
// A fix can only be judged once the team has actually finished the work.
const RATEABLE_STATUSES = ['resolved', 'closed'];

export default function IncidentsPage() {
  const { user, can } = useAuth();
  const canWriteIncidents = can(PERMISSIONS.INCIDENT_WRITE);
  const canDeleteIncidents = can(PERMISSIONS.INCIDENT_DELETE);
  const canRate = can(PERMISSIONS.RATING_WRITE);
  const canReadRatings = can(PERMISSIONS.RATING_READ);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ title: '', description: '', department: '', room: '', asset_type: '', asset_identifier: '', priority: 'medium', status: 'open' });
  const [errors, setErrors] = useState({});
  const [filters, setFilters] = useState({ status: '', priority: '', department: '', search: '' });
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const [ratingIncident, setRatingIncident] = useState(null);
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingFeedback, setRatingFeedback] = useState('');
  const [ratingError, setRatingError] = useState('');
  const [ratingSaving, setRatingSaving] = useState(false);
  const [ratingsByIncident, setRatingsByIncident] = useState({});

  const loadPage = useCallback(async () => {
    const [incidentsRes, departmentsRes] = await Promise.all([
      apiFetch('/incidents', {}),
      apiFetch('/maintenance/departments', {}),
    ]);
    return {
      incidents: await readApiData(incidentsRes),
      departments: await readApiData(departmentsRes),
    };
  }, []);

  const { data, loading: pageLoading, error, reload } = useApiData(loadPage);
  const incidents = data?.incidents || [];
  const departments = data?.departments || [];

  const filtered = incidents.filter((incident) => {
    if (filters.status && incident.status !== filters.status) return false;
    if (filters.priority && incident.priority !== filters.priority) return false;
    if (filters.department && incident.department !== filters.department) return false;
    if (filters.search && !(incident.title?.toLowerCase().includes(filters.search.toLowerCase()) || incident.description?.toLowerCase().includes(filters.search.toLowerCase()))) return false;
    return true;
  });

  // Ratings arrive with the incident row (count + average). The full list is
  // fetched only when someone opens the rating dialog for that incident.
  const loadRatings = useCallback(async (incidentId) => {
    if (!canReadRatings) return;
    const response = await apiFetch(`/ratings/incident/${incidentId}`, {});
    const payload = await readApiData(response);
    setRatingsByIncident((current) => ({ ...current, [incidentId]: payload?.ratings || [] }));
  }, [canReadRatings]);

  const openRating = async (incident) => {
    setActionError('');
    setRatingError('');
    setRatingValue(0);
    setRatingFeedback('');
    setRatingIncident(incident);
    await loadRatings(incident.id);
  };

  const closeRating = () => {
    setRatingIncident(null);
    setRatingValue(0);
    setRatingFeedback('');
    setRatingError('');
  };

  const handleRateSubmit = async (event) => {
    event.preventDefault();
    if (!ratingIncident) return;
    if (ratingValue < 1 || ratingValue > 5) {
      setRatingError('Choose a rating from 1 to 5 stars');
      return;
    }
    setRatingError('');
    setRatingSaving(true);
    try {
      await apiFetch(`/ratings/incident/${ratingIncident.id}`, {
        method: 'POST',
        body: JSON.stringify({ rating: ratingValue, feedback: ratingFeedback || null }),
      });
      closeRating();
      await loadRatings(ratingIncident.id);
      await reload();
    } catch (err) {
      setRatingError(err.message || 'Unable to save rating');
    } finally {
      setRatingSaving(false);
    }
  };

  const validate = () => {
    const nextErrors = {};
    if (!form.title || !form.title.trim()) nextErrors.title = 'Title is required';
    else if (form.title.length > 255) nextErrors.title = 'Title must be 255 characters or fewer';
    if (!form.description || !form.description.trim()) nextErrors.description = 'Description is required';
    else if (form.description.length > 2000) nextErrors.description = 'Description must be 2000 characters or fewer';
    if (form.room && form.room.length > 255) nextErrors.room = 'Room must be 255 characters or fewer';
    if (form.asset_identifier && form.asset_identifier.length > 255) nextErrors.asset_identifier = 'Asset identifier must be 255 characters or fewer';
    if (form.department && form.department.length > 255) nextErrors.department = 'Department must be 255 characters or fewer';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validate()) return;
    setActionError('');
    setLoading(true);
    try {
      if (editingId) {
        await apiFetch(`/incidents/${editingId}`, { method: 'PUT', body: JSON.stringify(form) });
      } else {
        await apiFetch('/incidents', { method: 'POST', body: JSON.stringify(form) });
      }
      closeForm();
      await reload();
    } catch (err) {
      setActionError(err.message || 'Unable to save incident');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (incident) => {
    setEditingId(incident.id);
    setForm({ title: incident.title, description: incident.description, department: incident.department || '', room: incident.room || '', asset_type: incident.asset_type || '', asset_identifier: incident.asset_identifier || '', priority: incident.priority || 'medium', status: incident.status || 'open' });
    setErrors({});
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this incident?')) return;
    setActionError('');
    setActionLoadingId(id);
    try {
      await apiFetch(`/incidents/${id}`, { method: 'DELETE' });
      await reload();
    } catch (err) {
      setActionError(err.message || 'Unable to delete incident');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleQuickStatus = async (incident, newStatus) => {
    setActionError('');
    setActionLoadingId(incident.id);
    try {
      await apiFetch(`/incidents/${incident.id}`, { method: 'PUT', body: JSON.stringify({ status: newStatus }) });
      await reload();
    } catch (err) {
      setActionError(err.message || 'Unable to update incident status');
    } finally {
      setActionLoadingId(null);
    }
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm({ title: '', description: '', department: '', room: '', asset_type: '', asset_identifier: '', priority: 'medium', status: 'open' });
    setErrors({});
  };

  if (pageLoading && !data) return <SkeletonPage label="Loading incidents..." />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;

  const showActions = canWriteIncidents || canDeleteIncidents || canRate;
  const columnCount = 8 + (showActions ? 1 : 0) + 1;

  return (
    <div className="page" aria-busy={pageLoading}>
      <header className="page-header">
        <div>
          <h1 className="page-title">Incidents</h1>
          <p className="page-subtitle">Report an issue, follow its progress, and rate the fix</p>
        </div>
        {canWriteIncidents && <button className="button button--primary" type="button" onClick={() => setShowForm(true)}>+ Report Incident</button>}
      </header>

      {(error || actionError) && <div className="inline-alert" role="alert"><span>{error || actionError}</span>{error && <button className="button button--secondary button--small" type="button" onClick={reload}>Retry</button>}</div>}
      {actionLoadingId && <div className="refresh-indicator" role="status"><span className="spinner spinner--small" aria-hidden="true" />Saving incident...</div>}

      <div className="filters" aria-label="Incident filters">
        <div className="filter-group filter-group--search">
          <label className="sr-only" htmlFor="incident-search">Search incidents</label>
          <input className="input" id="incident-search" type="search" placeholder="Search incidents..." value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
        </div>
        <div className="filter-group">
          <label className="sr-only" htmlFor="incident-status">Status</label>
          <select className="input" id="incident-status" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
            <option value="">All Status</option>
            {STATUSES.map((status) => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label className="sr-only" htmlFor="incident-priority">Priority</label>
          <select className="input" id="incident-priority" value={filters.priority} onChange={(event) => setFilters({ ...filters, priority: event.target.value })}>
            <option value="">All Priority</option>
            {PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label className="sr-only" htmlFor="incident-department">Department</label>
          <select className="input" id="incident-department" value={filters.department} onChange={(event) => setFilters({ ...filters, department: event.target.value })}>
            <option value="">All Departments</option>
            {departments.map((department) => <option key={department} value={department}>{department}</option>)}
          </select>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table data-table--responsive">
          <caption className="sr-only">Reported issues and their progress</caption>
          <thead>
            <tr>
              <th scope="col">Reported</th>
              <th scope="col">Title</th>
              <th scope="col">Description</th>
              <th scope="col">Asset</th>
              <th scope="col">Priority</th>
              <th scope="col">Status</th>
              <th scope="col">Reported By</th>
              {canReadRatings && <th scope="col">Rating</th>}
              {showActions && <th scope="col">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((incident) => (
              <tr key={incident.id}>
                <td data-label="Reported">{incident.created_at?.split('T')[0] || '-'}</td>
                <td data-label="Title">{incident.title}</td>
                <td data-label="Description">{incident.description?.substring(0, 60)}{incident.description?.length > 60 ? '...' : ''}</td>
                <td data-label="Asset">{incident.asset_type ? incident.asset_type.replace(/_/g, ' ') : '-'}</td>
                <td data-label="Priority"><span className={`badge badge--${incident.priority}`}>{incident.priority}</span></td>
                <td data-label="Status">
                  <label className="sr-only" htmlFor={`status-${incident.id}`}>Status for {incident.title}</label>
                  <select className="status-select" id={`status-${incident.id}`} value={incident.status} onChange={(event) => handleQuickStatus(incident, event.target.value)} disabled={!canWriteIncidents || actionLoadingId === incident.id} aria-label={`Status for ${incident.title}`}>
                    {STATUSES.map((status) => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}
                  </select>
                </td>
                <td data-label="Reported by">{incident.reported_by_name || user?.username}</td>
                {canReadRatings && (
                  <td data-label="Rating">
                    {Number(incident.rating_count) > 0
                      ? <span title={`${incident.rating_count} rating(s)`}>{'★'.repeat(Math.round(Number(incident.average_rating) || 0))} <span className="text-muted">({incident.average_rating})</span></span>
                      : <span className="text-muted">Not rated</span>}
                  </td>
                )}
                {showActions && (
                  <td data-label="Actions">
                    <div className="table-actions">
                      {canRate && RATEABLE_STATUSES.includes(incident.status) && (
                        <button className="button button--secondary button--small" type="button" onClick={() => openRating(incident)} aria-label={`Rate service for incident ${incident.id}`}>
                          {Number(incident.rating_count) > 0 ? 'Edit Rating' : 'Rate'}
                        </button>
                      )}
                      {canWriteIncidents && <button className="button button--primary button--small" type="button" onClick={() => handleEdit(incident)} aria-label={`Edit incident ${incident.id}`}>Edit</button>}
                      {canDeleteIncidents && <button className="button button--danger button--small" type="button" onClick={() => handleDelete(incident.id)} disabled={actionLoadingId === incident.id} aria-label={`Delete incident ${incident.id}`}>Delete</button>}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={columnCount}><EmptyState>No incidents found</EmptyState></td></tr>}
          </tbody>
        </table>
      </div>

      {showForm && canWriteIncidents && (
        <Modal title={editingId ? 'Edit Incident' : 'Report Incident'} onClose={closeForm}>
          <form className="form-stack" onSubmit={handleSubmit} aria-busy={loading}>
            <div className="form-field">
              <label className="field-label" htmlFor="incident-title">Title *</label>
              <input className={`input${errors.title ? ' input--error' : ''}`} id="incident-title" type="text" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required aria-invalid={Boolean(errors.title)} aria-describedby={errors.title ? 'incident-title-error' : undefined} />
              {errors.title && <span className="error-text" id="incident-title-error">{errors.title}</span>}
            </div>
            <div className="form-field">
              <label className="field-label" htmlFor="incident-description">Description *</label>
              <textarea className={`input${errors.description ? ' input--error' : ''}`} id="incident-description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Describe the incident" rows={3} required aria-invalid={Boolean(errors.description)} aria-describedby={errors.description ? 'incident-description-error' : undefined} />
              {errors.description && <span className="error-text" id="incident-description-error">{errors.description}</span>}
            </div>
            <div className="form-row">
              <div className="form-field">
                <label className="field-label" htmlFor="incident-department-form">Department</label>
                <select className="input" id="incident-department-form" value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })}>
                  <option value="">Select department</option>
                  {departments.map((department) => <option key={department} value={department}>{department}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label className="field-label" htmlFor="incident-room">Room</label>
                <input className="input" id="incident-room" type="text" value={form.room} onChange={(event) => setForm({ ...form, room: event.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-field">
                <label className="field-label" htmlFor="incident-asset-type">Asset Type</label>
                <select className="input" id="incident-asset-type" value={form.asset_type} onChange={(event) => setForm({ ...form, asset_type: event.target.value })}>
                  <option value="">None</option>
                  {ASSET_TYPES.map((type) => <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label className="field-label" htmlFor="incident-asset-identifier">Asset Identifier</label>
                <input className={`input${errors.asset_identifier ? ' input--error' : ''}`} id="incident-asset-identifier" type="text" value={form.asset_identifier} onChange={(event) => setForm({ ...form, asset_identifier: event.target.value })} placeholder="Serial/tag" aria-invalid={Boolean(errors.asset_identifier)} aria-describedby={errors.asset_identifier ? 'incident-asset-identifier-error' : undefined} />
                {errors.asset_identifier && <span className="error-text" id="incident-asset-identifier-error">{errors.asset_identifier}</span>}
              </div>
            </div>
            <div className="form-row">
              <div className="form-field">
                <label className="field-label" htmlFor="incident-priority-form">Priority</label>
                <select className="input" id="incident-priority-form" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
                  {PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label className="field-label" htmlFor="incident-status-form">Status</label>
                <select className="input" id="incident-status-form" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                  {STATUSES.map((status) => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
            </div>
            <div className="form-actions">
              <button className="button button--primary" type="submit" disabled={loading}>{loading ? 'Saving...' : (editingId ? 'Update Incident' : 'Report Incident')}</button>
              <button className="button button--secondary" type="button" onClick={closeForm} disabled={loading}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {ratingIncident && (
        <Modal title={`Rate Service - ${ratingIncident.title}`} onClose={closeRating}>
          <form className="form-stack" onSubmit={handleRateSubmit} aria-busy={ratingSaving}>
            {ratingError && <div className="inline-alert" role="alert"><span>{ratingError}</span></div>}

            <div className="form-field">
              <span className="field-label" id="rating-label">How was the fix for &ldquo;{ratingIncident.title}&rdquo;?</span>
              <div className="rating-input" role="radiogroup" aria-labelledby="rating-label">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`rating-star${value <= ratingValue ? ' rating-star--active' : ''}`}
                    role="radio"
                    aria-checked={value === ratingValue}
                    aria-label={`${value} star${value > 1 ? 's' : ''}`}
                    onClick={() => setRatingValue(value)}
                  >
                    {'★'}
                  </button>
                ))}
              </div>
              <p className="field-hint">1 = poor, 5 = excellent</p>
            </div>

            <div className="form-field">
              <label className="field-label" htmlFor="rating-feedback">Feedback (optional)</label>
              <textarea
                className="input"
                id="rating-feedback"
                value={ratingFeedback}
                onChange={(event) => setRatingFeedback(event.target.value)}
                placeholder="Tell us what went well or what could be better"
                rows={3}
                maxLength={2000}
              />
            </div>

            {canReadRatings && ratingsByIncident[ratingIncident.id]?.length > 0 && (
              <div className="form-field">
                <span className="field-label">Previous ratings</span>
                <ul className="rating-list">
                  {ratingsByIncident[ratingIncident.id].map((rating) => (
                    <li key={rating.id} className="rating-list__item">
                      <span className="rating-list__stars" aria-label={`${rating.rating} out of 5`}>
                        {'★'.repeat(rating.rating)}{'☆'.repeat(5 - rating.rating)}
                      </span>
                      <span className="rating-list__meta">
                        {rating.rated_by_name || 'Unknown'} &middot; {rating.created_at?.split('T')[0] || '-'}
                      </span>
                      {rating.feedback && <span className="rating-list__comment">{rating.feedback}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="form-actions">
              <button className="button button--primary" type="submit" disabled={ratingSaving}>
                {ratingSaving ? 'Saving...' : 'Submit Rating'}
              </button>
              <button className="button button--secondary" type="button" onClick={closeRating} disabled={ratingSaving}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
