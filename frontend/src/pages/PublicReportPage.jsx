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
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    setForm(prefill);
  }, [prefill]);

  const handleChangeWrapped = (updater) => {
    setErrors({});
    setActionError('');
    setForm(updater);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setActionError('');
    setErrors({});
    setLoading(true);
    try {
      const response = await apiFetch('/public/incidents', {
        method: 'POST',
        body: JSON.stringify({
          title: (form.title || '').trim(),
          description: (form.description || '').trim(),
          department: (form.department || '').trim() || null,
          room: (form.room || '').trim() || null,
          asset_type: (form.asset_type || '').trim() || null,
          asset_identifier: (form.asset_identifier || '').trim() || null,
          priority: form.priority || 'medium',
        }),
      }, { skipAuth: true, skipRefresh: true, noQueue: true });
      const data = await readApiData(response);
      setSubmitted(data || { ok: true });
    } catch (err) {
      const details = err?.data?.details;
      if (Array.isArray(details) && details.length > 0) {
        const fieldErrors = {};
        details.forEach((detail) => {
          if (detail?.field && detail?.message && !fieldErrors[detail.field]) {
            fieldErrors[detail.field] = detail.message;
          }
        });
        setErrors(fieldErrors);
        setActionError('Please fix the highlighted fields and try again.');
      } else {
        setActionError(err?.message || 'Unable to submit report. Please try again.');
      }
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
