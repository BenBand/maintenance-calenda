import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ReportIncidentForm from '../components/ReportIncidentForm';
import { BarChart, DonutChart } from '../components/Charts';
import { apiFetch, readApiData } from '../services/api';

function sanitize(value) {
  return (value || '').toString().slice(0, 255);
}

function titleCase(value) {
  if (!value) return '';
  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

const TRACK_STAGES = [
  { key: 'open', label: 'Reported' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'closed', label: 'Closed' },
];

function stageIndex(status) {
  const index = TRACK_STAGES.findIndex((stage) => stage.key === status);
  return index === -1 ? 0 : index;
}

function ProgressStamp({ status }) {
  const current = stageIndex(status);
  return (
    <ol className="incident-stages__track" aria-label={`Progress: ${titleCase(status || 'reported')}`}>
      {TRACK_STAGES.map((stage, index) => {
        const state = index < current ? 'done' : index === current ? 'current' : 'todo';
        return (
          <li className={`incident-stages__step incident-stages__step--${state}`} key={stage.key}>
            <span className="incident-stages__dot" aria-hidden="true" />
            <span className="incident-stages__label">{stage.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function PublicIncidentTracker({ initialTicket }) {
  const [ticketInput, setTicketInput] = useState(initialTicket || '');
  const [incident, setIncident] = useState(null);
  const [lookupError, setLookupError] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [ratings, setRatings] = useState([]);
  const [ratingValue, setRatingValue] = useState(0);
  const [technicianName, setTechnicianName] = useState('');
  const [feedback, setFeedback] = useState('');
  const [ratingError, setRatingError] = useState('');
  const [ratingSaving, setRatingSaving] = useState(false);
  const [confirmError, setConfirmError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState('');

  const loadRatings = useCallback(async (incidentId) => {
    if (!incidentId) return;
    try {
      const response = await apiFetch(`/public/incidents/${incidentId}/ratings`, {}, { skipAuth: true, skipRefresh: true, retry: false });
      const payload = await readApiData(response);
      setRatings(payload?.ratings || []);
    } catch {
      // keep tracker usable even if ratings fail to load
    }
  }, []);

  const lookup = useCallback(async (ticket, { silent = false } = {}) => {
    const normalized = (ticket || '').trim();
    if (!normalized) {
      if (!silent) setLookupError('Enter a ticket number to track your report.');
      return;
    }
    setLookupError('');
    setNotice('');
    if (!silent) setLookupLoading(true);
    try {
      const response = await apiFetch(`/public/incidents/track/${encodeURIComponent(normalized)}`, {}, { skipAuth: true, skipRefresh: true, retry: false });
      const data = await readApiData(response);
      setIncident(data);
      setTechnicianName((current) => current || data?.assigned_to_name || '');
      await loadRatings(data?.id);
    } catch (err) {
      setIncident(null);
      setRatings([]);
      setLookupError(err?.status === 404 ? 'No report found for that ticket number.' : (err?.message || 'Unable to load report status.'));
    } finally {
      if (!silent) setLookupLoading(false);
    }
  }, [loadRatings]);

  useEffect(() => {
    if (initialTicket) {
      setTicketInput(initialTicket);
      lookup(initialTicket);
    }
  }, [initialTicket, lookup]);

  const handleRate = async (event) => {
    event.preventDefault();
    if (!incident?.id) return;
    if (ratingValue < 1 || ratingValue > 5) {
      setRatingError('Select a rating from 1 to 5 stars.');
      return;
    }
    if (!technicianName.trim()) {
      setRatingError('Technician name is required to submit a rating.');
      return;
    }
    setRatingError('');
    setNotice('');
    setRatingSaving(true);
    try {
      await apiFetch(`/public/incidents/${incident.id}/ratings`, {
        method: 'POST',
        body: JSON.stringify({ rating: ratingValue, technician_name: technicianName.trim(), feedback: feedback || null }),
      }, { skipAuth: true, skipRefresh: true, noQueue: true });
      setNotice('Thank you. Your rating and feedback were submitted.');
      setFeedback('');
      await lookup(incident.ticket_no, { silent: true });
    } catch (err) {
      setRatingError(err?.message || 'Unable to submit rating.');
    } finally {
      setRatingSaving(false);
    }
  };

  const handleConfirmFix = async () => {
    if (!incident?.ticket_no) return;
    setConfirmError('');
    setNotice('');
    setConfirming(true);
    try {
      await apiFetch(`/public/incidents/track/${encodeURIComponent(incident.ticket_no)}/confirm-fix`, {
        method: 'POST',
      }, { skipAuth: true, skipRefresh: true, noQueue: true });
      setNotice('Fix confirmed. Thank you for confirming the issue was resolved.');
      await lookup(incident.ticket_no, { silent: true });
    } catch (err) {
      setConfirmError(err?.message || 'Unable to confirm the fix.');
    } finally {
      setConfirming(false);
    }
  };

  const canRate = incident && ['resolved', 'closed'].includes(incident.status);
  const canConfirm = incident && incident.status === 'resolved';

  return (
    <section className="panel public-tracker" aria-label="Track your report">
      <div className="panel__body">
        <p className="panel__subtitle">Use your ticket number to check progress, rate the service, and confirm when the fix is done.</p>
        <form className="tracker-lookup" onSubmit={(event) => { event.preventDefault(); lookup(ticketInput); }}>
          <label className="field-label" htmlFor="track-ticket">Ticket number</label>
          <div className="tracker-lookup__row">
            <input
              className="input"
              id="track-ticket"
              type="text"
              value={ticketInput}
              onChange={(event) => setTicketInput(event.target.value)}
              placeholder="e.g. LCC-INC-2026-0001"
              autoComplete="off"
            />
            <button className="button button--primary" type="submit" disabled={lookupLoading}>
              {lookupLoading ? 'Checking...' : 'Track report'}
            </button>
          </div>
        </form>

        {lookupError && <div className="inline-alert" role="alert"><span>{lookupError}</span></div>}
        {notice && <div className="inline-alert inline-alert--success" role="status"><span>{notice}</span></div>}

        {incident && (
          <div className="tracker-result">
            <div className="tracker-result__head">
              <div>
                <p className="tracker-ticket"><strong>Ticket:</strong> {incident.ticket_no}</p>
                <p className="field-hint">{incident.title}</p>
              </div>
              <span className={`badge badge--${incident.status === 'closed' ? 'success' : incident.status === 'resolved' ? 'info' : incident.status === 'in_progress' ? 'warning' : 'secondary'}`}>
                {titleCase(incident.status)}
              </span>
            </div>

            <ProgressStamp status={incident.status} />

            <dl className="report-review__list" style={{ marginTop: '12px' }}>
              <div className="report-review__item"><dt className="report-review__label">Priority</dt><dd className="report-review__value">{titleCase(incident.priority) || 'Not set'}</dd></div>
              <div className="report-review__item"><dt className="report-review__label">Assigned technician</dt><dd className="report-review__value">{incident.assigned_to_name || <span className="text-muted">Not assigned yet</span>}</dd></div>
              <div className="report-review__item"><dt className="report-review__label">Reported</dt><dd className="report-review__value">{incident.created_at ? String(incident.created_at).slice(0, 10) : '-'}</dd></div>
              {incident.resolution_notes && <div className="report-review__item"><dt className="report-review__label">Resolution notes</dt><dd className="report-review__value">{incident.resolution_notes}</dd></div>}
            </dl>

            {Number(incident.rating_count) > 0 && (
              <p className="field-hint" style={{ marginTop: '10px' }}>
                Average rating: {'★'.repeat(Math.max(0, Math.round(Number(incident.average_rating) || 0)))} ({incident.average_rating}) from {incident.rating_count} rating{Number(incident.rating_count) === 1 ? '' : 's'}.
              </p>
            )}

            {canConfirm && (
              <div className="tracker-actions">
                <p className="field-hint">If the issue is fixed to your satisfaction, confirm it below.</p>
                {confirmError && <div className="inline-alert" role="alert"><span>{confirmError}</span></div>}
                <button className="button button--primary" type="button" onClick={handleConfirmFix} disabled={confirming}>
                  {confirming ? 'Confirming...' : 'Confirm fix is done'}
                </button>
              </div>
            )}

            {incident.status === 'closed' && (
              <div className="inline-alert inline-alert--success" role="status" style={{ marginTop: '12px' }}>
                <span>This report is closed. Thank you for confirming the fix.</span>
              </div>
            )}

            {canRate ? (
              <form className="form-stack" onSubmit={handleRate} style={{ marginTop: '16px' }} aria-busy={ratingSaving}>
                <h3 className="panel__title">Rate the service</h3>
                {ratingError && <div className="inline-alert" role="alert"><span>{ratingError}</span></div>}
                <div className="form-field">
                  <span className="field-label" id="public-rating-label">Rating</span>
                  <div className="rating-input" role="radiogroup" aria-labelledby="public-rating-label">
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
                        ★
                      </button>
                    ))}
                  </div>
                </div>
                <div className="form-field">
                  <label className="field-label" htmlFor="public-rating-tech">Technician name *</label>
                  <input
                    className="input"
                    id="public-rating-tech"
                    type="text"
                    value={technicianName}
                    onChange={(event) => setTechnicianName(event.target.value)}
                    placeholder="Name of technician who handled the fix"
                    maxLength={255}
                    required
                  />
                </div>
                <div className="form-field">
                  <label className="field-label" htmlFor="public-rating-feedback">Feedback (optional)</label>
                  <textarea
                    className="input"
                    id="public-rating-feedback"
                    value={feedback}
                    onChange={(event) => setFeedback(event.target.value)}
                    placeholder="Tell us about the service"
                    rows={3}
                    maxLength={2000}
                  />
                </div>
                <div className="form-actions">
                  <button className="button button--primary" type="submit" disabled={ratingSaving}>
                    {ratingSaving ? 'Submitting...' : 'Submit rating'}
                  </button>
                </div>
              </form>
            ) : (
              <p className="field-hint" style={{ marginTop: '12px' }}>Rating becomes available once the issue is resolved or closed.</p>
            )}

            {ratings.length > 0 && (
              <div style={{ marginTop: '12px' }}>
                <h3 className="field-label">Submitted ratings</h3>
                <ul className="simple-list">
                  {ratings.map((rating) => (
                    <li key={rating.id || `${rating.created_at}-${rating.rating}`} className="simple-list__item" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                      <span>{'★'.repeat(rating.rating)}{'☆'.repeat(5 - rating.rating)} {rating.technician_name ? `· ${rating.technician_name}` : ''}</span>
                      {rating.feedback && <span className="text-muted">{rating.feedback}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}


function PublicStatsPanel({ stats, loading, error, onRetry }) {
  if (loading) {
    return <p className="field-hint" role="status">Loading system statistics...</p>;
  }
  if (error) {
    return (
      <div className="inline-alert" role="alert">
        <span>{error}</span>
        <button className="button button--secondary button--small" type="button" onClick={onRetry}>Retry</button>
      </div>
    );
  }
  if (!stats) return null;

  const statusData = (stats.reported_issues?.by_status || []).map((item) => ({
    label: titleCase(item.status),
    count: item.count,
  }));
  const monthData = (stats.reported_issues?.by_month || []).map((item) => ({
    label: item.label || item.month,
    reported: item.reported,
  }));
  const ratingData = (stats.ratings || []).map((item) => ({
    label: item.technician,
    average: Number(item.average_rating || 0),
    count: item.rating_count || 0,
  }));

  return (
    <section className="public-stats" aria-labelledby="public-stats-title">
      <div className="section-block">
        <h2 className="section-title" id="public-stats-title">System overview</h2>
        <p className="field-hint">Reported issues, fixes, technicians, and ratings (highest rated first).</p>

        <div className="stats-grid" aria-label="System summary">
          <div className="stat-card">
            <div className="stat-card__number">{stats.reported_issues?.total ?? 0}</div>
            <div className="stat-card__label">Reported Issues</div>
          </div>
          <div className="stat-card stat-card--success">
            <div className="stat-card__number">{stats.fixes?.resolved_incidents ?? 0}</div>
            <div className="stat-card__label">Resolved/Closed Issues</div>
          </div>
          <div className="stat-card stat-card--info">
            <div className="stat-card__number">{stats.fixes?.service_records ?? 0}</div>
            <div className="stat-card__label">Service Records (Fixes Logged)</div>
          </div>
          <div className="stat-card">
            <div className="stat-card__number">{stats.technicians?.length ?? 0}</div>
            <div className="stat-card__label">Technicians in System</div>
          </div>
        </div>
      </div>

      <div className="public-stats__charts">
        <section className="panel" aria-labelledby="reported-graph-title">
          <header className="panel__header">
            <div>
              <h3 className="panel__title" id="reported-graph-title">Reported issues (last 12 months)</h3>
            </div>
          </header>
          <div className="panel__body">
            <BarChart
              data={monthData}
              series={[{ key: 'reported', label: 'Reported', color: '#f97316' }]}
              caption="Reported issues by month"
              emptyMessage="No reported issues yet"
            />
          </div>
        </section>

        <section className="panel" aria-labelledby="status-graph-title">
          <header className="panel__header">
            <div>
              <h3 className="panel__title" id="status-graph-title">Reported issues by status</h3>
            </div>
          </header>
          <div className="panel__body">
            {statusData.length > 0 ? (
              <DonutChart
                data={statusData.map((item, index) => ({
                  label: item.label || 'Unknown',
                  value: item.count,
                  color: ['#2563eb', '#f97316', '#16a34a', '#7c3aed', '#dc2626'][index % 5],
                }))}
                caption="Reported issues by status"
                centerLabel="issues"
                centerValue={String(stats.reported_issues?.total ?? 0)}
              />
            ) : (
              <p className="chart-empty">No reported issues yet</p>
            )}
          </div>
        </section>
      </div>

      <div className="public-stats__lists">
        <section className="panel" aria-labelledby="technicians-title">
          <header className="panel__header">
            <div>
              <h3 className="panel__title" id="technicians-title">Technicians</h3>
              <p className="panel__subtitle">Registered technicians and IT staff</p>
            </div>
          </header>
          <div className="panel__body">
            {(stats.technicians || []).length === 0 ? (
              <p className="chart-empty">No technicians listed</p>
            ) : (
              <ul className="simple-list">
                {stats.technicians.map((tech) => (
                  <li key={tech.id || tech.username} className="simple-list__item">
                    <span>{tech.username}</span>
                    <span className="text-muted">{titleCase(tech.role)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="panel" aria-labelledby="ratings-title">
          <header className="panel__header">
            <div>
              <h3 className="panel__title" id="ratings-title">Technician ratings</h3>
              <p className="panel__subtitle">Average feedback rating, highest first</p>
            </div>
          </header>
          <div className="panel__body">
            {ratingData.length === 0 ? (
              <p className="chart-empty">No ratings submitted yet</p>
            ) : (
              <ul className="simple-list">
                {ratingData.map((item) => (
                  <li key={item.label} className="simple-list__item">
                    <span>{item.label}</span>
                    <span>
                      {'★'.repeat(Math.max(0, Math.round(item.average)))}{'☆'.repeat(Math.max(0, 5 - Math.round(item.average)))}
                      {' '}
                      <span className="text-muted">({item.average.toFixed(1)} · {item.count} rating{item.count === 1 ? '' : 's'})</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

export default function PublicReportPage() {
  const [searchParams] = useSearchParams();
  const prefill = useMemo(() => ({
    title: '',
    description: '',
    department: sanitize(searchParams.get('department')),
    room: sanitize(searchParams.get('room')),
    asset_type: sanitize(searchParams.get('asset_type')),
    asset_identifier: sanitize(searchParams.get('asset_identifier')),
    priority: 'medium',
    status: 'open',
  }), [searchParams]);

  const [form, setForm] = useState(prefill);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [submitted, setSubmitted] = useState(null);
  const [formKey, setFormKey] = useState(0);
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState('');

  const loadStats = async () => {
    setStatsLoading(true);
    setStatsError('');
    try {
      const response = await apiFetch('/public/stats', {}, { skipAuth: true, skipRefresh: true, retry: false });
      const data = await readApiData(response);
      setStats(data || null);
    } catch (err) {
      setStatsError(err?.message || 'Unable to load system statistics');
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    setForm(prefill);
  }, [prefill]);

  useEffect(() => {
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (submitted) loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted]);

  const handleChangeWrapped = (updater) => {
    setErrors({});
    setActionError('');
    setForm(updater);
  };

  const handleSubmit = async () => {
    setActionError('');
    setErrors({});
    setLoading(true);
    const payload = {
      title: (form.title || '').trim(),
      description: (form.description || '').trim(),
      department: (form.department || '').trim(),
      room: (form.room || '').trim(),
      asset_type: (form.asset_type || '').trim(),
      asset_identifier: (form.asset_identifier || '').trim(),
      priority: form.priority || 'medium',
    };

    try {
      const response = await apiFetch('/public/incidents', {
        method: 'POST',
        body: JSON.stringify(payload),
      }, { skipAuth: true, skipRefresh: true, noQueue: true });
      const data = await readApiData(response);
      setSubmitted(data || { ok: true });
    } catch (err) {
      const data = err?.data || {};
      const fieldErrors = {};
      if (data.fields && typeof data.fields === 'object' && !Array.isArray(data.fields)) {
        Object.entries(data.fields).forEach(([field, message]) => {
          if (message) fieldErrors[field] = String(message);
        });
      }
      if (Object.keys(fieldErrors).length === 0 && Array.isArray(data.details)) {
        data.details.forEach((detail) => {
          const field = detail?.field || detail?.path || detail?.param;
          const message = detail?.message || detail?.msg;
          if (field && message && !fieldErrors[field]) fieldErrors[field] = String(message);
        });
      }
      setErrors(fieldErrors);
      const message = data.error || data.message || err?.message || 'Unable to submit report. Please try again.';
      setActionError(Object.keys(fieldErrors).length > 0 ? 'Please fix the highlighted fields and try again.' : message);
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <main className="login-page" id="main-content" tabIndex="-1">
        <div className="watermark" aria-hidden="true" />
        <section className="login-card login-card--wide" aria-labelledby="report-sent-title">
          <h1 className="login-title" id="report-sent-title">Report submitted successfully</h1>
          <p className="login-subtitle" role="status">Your fault report has been received by the IT team. Thank you for submitting it.</p>
          {submitted.ticket_no && (
            <div className="inline-alert inline-alert--success" role="status" style={{ marginTop: '1rem' }}>
              <span><strong>Confirmation:</strong> Ticket {submitted.ticket_no} was submitted successfully.</span>
            </div>
          )}
          {!submitted.ticket_no && (
            <div className="inline-alert inline-alert--success" role="status" style={{ marginTop: '1rem' }}>
              <span><strong>Confirmation:</strong> Your report was submitted successfully.</span>
            </div>
          )}
          <p className="field-hint" style={{ marginTop: '1rem' }}>
            Save your ticket number. Use it below to track progress, rate the service, or confirm the fix is done.
          </p>

          <PublicIncidentTracker initialTicket={submitted.ticket_no || ''} />
          <PublicStatsPanel stats={stats} loading={statsLoading} error={statsError} onRetry={loadStats} />

          <div className="form-actions" style={{ marginTop: '1rem' }}>
            <button className="button button--primary" type="button" onClick={() => { setSubmitted(null); setForm(prefill); setErrors({}); setActionError(''); setFormKey((k) => k + 1); }}>
              Report another issue
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="login-page" id="main-content" tabIndex="-1">
      <div className="watermark" aria-hidden="true" />
      <section className="login-card login-card--wide" aria-labelledby="report-title">
        <h1 className="login-title" id="report-title">Report a Fault</h1>
        <p className="login-subtitle">No account needed. Complete each step to submit your report.</p>
        <PublicIncidentTracker initialTicket="" />
        <ReportIncidentForm
          key={formKey}
          editingId={null}
          form={form}
          setForm={handleChangeWrapped}
          errors={errors}
          loading={loading}
          actionError={actionError}
          departments={[]}
          onSubmit={handleSubmit}
          onClose={() => { setForm(prefill); setErrors({}); setActionError(''); setFormKey((k) => k + 1); }}
          canWriteIncidents={false}
          wizard
        />
      </section>
    </main>
  );
}
