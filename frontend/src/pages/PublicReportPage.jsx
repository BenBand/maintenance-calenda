import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ReportIncidentForm from '../components/ReportIncidentForm';
import { apiFetch, readApiData } from '../services/api';

function sanitize(value) {
  return (value || '').toString().slice(0, 255);
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

  useEffect(() => {
    setForm(prefill);
  }, [prefill]);

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
      const response = await apiFetch('/public/incidents', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          department: form.department || null,
          room: form.room || null,
          asset_type: form.asset_type || null,
          asset_identifier: form.asset_identifier || null,
          priority: form.priority || 'medium',
        }),
      }, { skipAuth: true, skipRefresh: true, noQueue: true });
      const data = await readApiData(response);
      setSubmitted(data || { ok: true });
    } catch (err) {
      setActionError(err?.message || 'Unable to submit report. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <main className="login-page" id="main-content" tabIndex="-1">
        <div className="watermark" aria-hidden="true" />
        <section className="login-card login-card--wide" aria-labelledby="report-sent-title">
          <h1 className="login-title" id="report-sent-title">Report submitted</h1>
          <p className="login-subtitle">Your fault report has been received by the IT team.</p>
          {submitted.ticket_no && (
            <div className="inline-alert" role="status" style={{ marginTop: '1rem' }}>
              <span><strong>Ticket:</strong> {submitted.ticket_no}</span>
            </div>
          )}
          <p className="field-hint" style={{ marginTop: '1rem' }}>
            Keep the ticket number for reference. You can close this page.
          </p>
          <div className="form-actions" style={{ marginTop: '1rem' }}>
            <button className="button button--primary" type="button" onClick={() => { setSubmitted(null); setForm(prefill); setErrors({}); setActionError(''); }}>
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
        <p className="login-subtitle">No account needed. Fill in the details and submit.</p>
        <ReportIncidentForm
          editingId={null}
          form={form}
          setForm={setForm}
          errors={errors}
          loading={loading}
          actionError={actionError}
          departments={[]}
          onSubmit={handleSubmit}
          onClose={() => { setForm(prefill); setErrors({}); setActionError(''); }}
          canWriteIncidents={false}
        />
      </section>
    </main>
  );
}
