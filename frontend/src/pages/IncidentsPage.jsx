import { useCallback, useState } from 'react';
import { useAuth } from '../services/auth';
import { PERMISSIONS } from '../services/permissions';
import { apiFetch, downloadPdf, readApiData } from '../services/api';
import { useApiData } from '../hooks/useApiData';
import Modal from '../components/Modal';
import ReportIncidentForm from '../components/ReportIncidentForm';
import { EmptyState, ErrorState, SkeletonPage } from '../components/AsyncState';

const ASSET_TYPES = ['laptop', 'desktop', 'network_equipment', 'printer'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
// A fix can only be judged once the team has actually finished the work.
const RATEABLE_STATUSES = ['resolved', 'closed'];

export default function IncidentsPage() {
  const { user, can } = useAuth();
  // Reporting is the `user` role's job. The IT roles respond and close, which
  // is INCIDENT_WRITE, so they never see the Report button.
  const canReportIncident = can(PERMISSIONS.INCIDENT_CREATE);
  const canWriteIncidents = can(PERMISSIONS.INCIDENT_WRITE);
  const canDeleteIncidents = can(PERMISSIONS.INCIDENT_DELETE);
  const canRate = can(PERMISSIONS.RATING_WRITE);
  const canReadRatings = can(PERMISSIONS.RATING_READ);
  const canReadIncidents = can(PERMISSIONS.INCIDENT_READ);
  const canComment = can(PERMISSIONS.COMMENT_WRITE);

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

  // The comment thread is how the reporter and the IT team talk to each other
  // while a fix is in progress, so it loads on demand for the open incident
  // rather than for every row in the table.
  const [threadIncident, setThreadIncident] = useState(null);
  const [threadComments, setThreadComments] = useState([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState('');
  const [commentDraft, setCommentDraft] = useState('');
  const [commentSaving, setCommentSaving] = useState(false);
  const [exportLoadingId, setExportLoadingId] = useState(null);

  const loadPage = useCallback(async () => {
    // The `user` role only ever sees their own reports — the queue belongs to
    // the IT team. Everyone else sees the full list.
    const isUserOnly = user?.role === 'user' && !canWriteIncidents;
    const incidentsRes = isUserOnly
      ? apiFetch('/incidents/mine', {})
      : apiFetch('/incidents', {});
    const [incidentsData, departmentsRes] = await Promise.all([
      readApiData(incidentsRes),
      apiFetch('/maintenance/departments', {}),
    ]);
    return {
      incidents: incidentsData?.data || incidentsData || [],
      departments: await readApiData(departmentsRes),
    };
  }, [user?.role, canWriteIncidents]);

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

  const openThread = async (incident) => {
    setActionError('');
    setThreadError('');
    setCommentDraft('');
    setThreadIncident(incident);
    setThreadLoading(true);
    try {
      const response = await apiFetch(`/comments/incident/${incident.id}`, {});
      const payload = await readApiData(response);
      setThreadComments(payload?.comments || []);
    } catch (err) {
      setThreadError(err.message || 'Unable to load the discussion');
    } finally {
      setThreadLoading(false);
    }
  };

  const closeThread = () => {
    setThreadIncident(null);
    setThreadComments([]);
    setThreadError('');
    setCommentDraft('');
  };

  const handleCommentSubmit = async (event) => {
    event.preventDefault();
    if (!threadIncident) return;
    if (!commentDraft.trim()) {
      setThreadError('Write a message before sending');
      return;
    }
    setThreadError('');
    setCommentSaving(true);
    try {
      await apiFetch(`/comments/incident/${threadIncident.id}`, {
        method: 'POST',
        body: JSON.stringify({ comment: commentDraft }),
      });
      setCommentDraft('');
      const response = await apiFetch(`/comments/incident/${threadIncident.id}`, {});
      const payload = await readApiData(response);
      setThreadComments(payload?.comments || []);
    } catch (err) {
      setThreadError(err.message || 'Unable to send your message');
    } finally {
      setCommentSaving(false);
    }
  };

  const handleCommentDelete = async (commentId) => {
    if (!window.confirm('Delete this message?')) return;
    if (!threadIncident) return;
    setThreadError('');
    try {
      await apiFetch(`/comments/${commentId}`, { method: 'DELETE' });
      setThreadComments((current) => current.filter((comment) => comment.id !== commentId));
    } catch (err) {
      setThreadError(err.message || 'Unable to delete this message');
    }
  };

  const handleExportIncident = async (incidentId) => {
    setActionError('');
    setExportLoadingId(incidentId);
    try {
      await downloadPdf(`/incidents/${incidentId}/export/pdf`, `incident-${incidentId}.pdf`);
    } catch (err) {
      setActionError(err.message || 'Unable to export the incident record');
    } finally {
      setExportLoadingId(null);
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

  // The Discuss and Export actions are available to anyone who can read an
  // incident, so the column shows even for a role with no write access.
  const showActions = canComment || canReadIncidents || canWriteIncidents || canDeleteIncidents || canRate;
  // Reported, Title, Description, Asset, Priority, Status, Reported By = 7,
  // plus Rating and Actions when those columns are rendered.
  const columnCount = 7 + (canReadRatings ? 1 : 0) + (showActions ? 1 : 0);

  return (
    <div className="page" aria-busy={pageLoading}>
      <header className="page-header">
        <div>
          <h1 className="page-title">Incidents</h1>
          <p className="page-subtitle">Report an issue, follow its progress, and rate the fix</p>
        </div>
        {canReportIncident && <button className="button button--primary" type="button" onClick={() => setShowForm(true)}>+ Report Incident</button>}
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
                      <button className="button button--secondary button--small" type="button" onClick={() => openThread(incident)} aria-label={`Open discussion for incident ${incident.id}`}>
                        Discuss
                      </button>
                      <button className="button button--secondary button--small" type="button" onClick={() => handleExportIncident(incident.id)} disabled={exportLoadingId === incident.id} aria-label={`Export incident ${incident.id} as PDF`}>
                        {exportLoadingId === incident.id ? 'Exporting...' : 'Export'}
                      </button>
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

      {/* `user` opens this to file a report; admin/manager open it to edit or
          respond to one they are handling. */}
      {showForm && (canReportIncident || canWriteIncidents) && (
        <Modal title={editingId ? 'Edit Incident' : 'Report Incident'} onClose={closeForm}>
          <ReportIncidentForm
            editingId={editingId}
            form={form}
            setForm={setForm}
            errors={errors}
            loading={loading}
            actionError={actionError}
            departments={departments}
            onSubmit={handleSubmit}
            onClose={closeForm}
            userRole={user?.role}
            canWriteIncidents={canWriteIncidents}
          />
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

      {threadIncident && (
        <Modal title={`Discussion - ${threadIncident.title}`} onClose={closeThread}>
          <div className="form-stack">
            {threadError && <div className="inline-alert" role="alert"><span>{threadError}</span></div>}

            <div className="thread" aria-busy={threadLoading}>
              {threadLoading && <p className="text-muted">Loading messages...</p>}
              {!threadLoading && threadComments.length === 0 && (
                <p className="text-muted">
                  {canComment ? 'No messages yet. Add the first update below.' : 'No messages yet.'}
                </p>
              )}
              {!threadLoading && threadComments.map((comment) => {
                const isOwn = String(comment.commented_by) === String(user?.id);
                // Deleting is restricted to the comment's author, and the admin
                // who can moderate the thread. A role with no COMMENT_WRITE can
                // never have authored one, so it never sees this control.
                const canDelete = canComment && (isOwn || user?.role === 'admin');
                return (
                  <article className="thread__message" key={comment.id}>
                    <header className="thread__meta">
                      <span className="thread__author">{comment.commented_by_name || 'Unknown'}</span>
                      <span className="thread__time">{comment.created_at?.split('T')[0] || ''}</span>
                      {canDelete && (
                        <button className="button button--danger button--small" type="button" onClick={() => handleCommentDelete(comment.id)} aria-label="Delete message">
                          Delete
                        </button>
                      )}
                    </header>
                    <p className="thread__body">{comment.comment}</p>
                  </article>
                );
              })}
            </div>

            {/* Only admin and developer hold COMMENT_WRITE. Everyone else can
                still open the thread and read the replies, which is what
                "receive feedback" means for the person who reported the issue. */}
            {canComment ? (
              <form className="form-stack" onSubmit={handleCommentSubmit} aria-busy={commentSaving}>
                <div className="form-field">
                  <label className="field-label" htmlFor="thread-comment">Add a message</label>
                  <textarea
                    className="input"
                    id="thread-comment"
                    value={commentDraft}
                    onChange={(event) => setCommentDraft(event.target.value)}
                    placeholder="Share an update or ask a question about this issue"
                    rows={3}
                    maxLength={2000}
                  />
                </div>
                <div className="form-actions">
                  <button className="button button--primary" type="submit" disabled={commentSaving}>
                    {commentSaving ? 'Sending...' : 'Send Message'}
                  </button>
                  <button className="button button--secondary" type="button" onClick={closeThread} disabled={commentSaving}>Close</button>
                </div>
              </form>
            ) : (
              <div className="form-actions">
                <button className="button button--secondary" type="button" onClick={closeThread}>Close</button>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
