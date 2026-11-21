import { useCallback, useState } from 'react';
import { useAuth } from '../services/auth';
import { PERMISSIONS } from '../services/permissions';
import { apiFetch, downloadPdf, readApiData } from '../services/api';
import { useApiData } from '../hooks/useApiData';
import { BarChart } from '../components/Charts';
import { ErrorState, SkeletonPage } from '../components/AsyncState';
import { formatPercent } from '../utils/datetime';

const PERIODS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

export default function TechnicianReportPage() {
  const { can } = useAuth();
  const [period, setPeriod] = useState('monthly');

  const loadReport = useCallback(async () => {
    const query = `period=${encodeURIComponent(period)}`;
    const response = await apiFetch(`/analytics/technician-report?${query}`, {});
    return readApiData(response);
  }, [period]);

  const { data, loading, error, reload } = useApiData(loadReport);

  const technicians = data?.technicians || [];
  const range = data?.range || {};

  const grandTotals = technicians.reduce(
    (acc, t) => ({
      resolved: acc.resolved + t.totals.resolved,
      closed: acc.closed + t.totals.closed,
      rating_count: acc.rating_count + t.totals.rating_count,
    }),
    { resolved: 0, closed: 0, rating_count: 0 }
  );

  const overallAvgRating = technicians.length > 0
    ? formatPercent(technicians.reduce((sum, t) => sum + t.totals.avg_rating, 0) / technicians.length, 1)
    : 0;

  const chartData = technicians.map((t) => ({
    label: t.technician,
    resolved: t.totals.resolved,
    closed: t.totals.closed,
  }));

  const handleDownloadCsv = () => {
    const headers = ['Technician', 'Period', 'Resolved', 'Closed', 'Total Resolved', 'Ratings', 'Avg Rating'];
    const rows = technicians.flatMap((t) =>
      t.buckets.map((b) => [
        t.technician,
        b.period,
        b.resolved,
        b.closed,
        b.total_resolved,
        b.rating_count,
        b.avg_rating,
      ])
    );
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => String(c).includes(',') ? `"${String(c).replace(/"/g, '""')}"` : String(c)).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `technician-report-${period}-${String(range.from || '').slice(0, 10)}_to_${String(range.to || '').slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const handleDownloadPdf = async () => {
    try {
      await downloadPdf(
        `/analytics/technician-report.pdf?period=${encodeURIComponent(period)}`,
        `technician-report-${period}.pdf`
      );
    } catch (err) {
      // Fallback: if PDF endpoint not available, just show the CSV download
      handleDownloadCsv();
    }
  };

  if (loading && !data) return <SkeletonPage label="Loading technician report..." />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="page page--wide" aria-busy={loading}>
      <header className="page-header">
        <div>
          <h1 className="page-title">Technician Performance Report</h1>
          <p className="page-subtitle">Issues resolved and ratings by technician, broken down by period</p>
        </div>
        <div className="page-header-actions">
          <div className="filter-group">
            <label className="sr-only" htmlFor="report-period">Report period</label>
            <select
              className="input"
              id="report-period"
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
            >
              {PERIODS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <button className="button button--primary" type="button" onClick={handleDownloadPdf}>
            Download PDF
          </button>
          <button className="button button--secondary" type="button" onClick={handleDownloadCsv}>
            Download CSV
          </button>
        </div>
      </header>

      {error && (
        <div className="inline-alert" role="alert">
          <span>{error}</span>
          <button className="button button--secondary button--small" type="button" onClick={reload}>Retry</button>
        </div>
      )}

      <div className="stats-grid stats-grid--secondary" aria-label="Report summary">
        <div className="stat-card stat-card--compact stat-card--success">
          <div className="stat-card__number">{grandTotals.resolved + grandTotals.closed}</div>
          <div className="stat-card__label">Total Issues Resolved</div>
          <div className="stat-card__hint">{grandTotals.resolved} resolved · {grandTotals.closed} closed</div>
        </div>
        <div className="stat-card stat-card--compact stat-card--info">
          <div className="stat-card__number">{technicians.length}</div>
          <div className="stat-card__label">Technicians</div>
          <div className="stat-card__hint">With activity in this period</div>
        </div>
        <div className="stat-card stat-card--compact stat-card--warning">
          <div className="stat-card__number">{grandTotals.rating_count}</div>
          <div className="stat-card__label">Total Ratings</div>
          <div className="stat-card__hint">Received from users</div>
        </div>
        <div className="stat-card stat-card--compact">
          <div className="stat-card__number">{overallAvgRating}</div>
          <div className="stat-card__label">Average Rating</div>
          <div className="stat-card__hint">Across all technicians</div>
        </div>
      </div>

      <div className="analytics-grid">
        <section className="panel" aria-labelledby="technician-chart-title">
          <header className="panel__header">
            <h2 className="panel__title" id="technician-chart-title">Issues Resolved by Technician</h2>
            <p className="panel__subtitle">Total resolved ({period}) across the reporting period</p>
          </header>
          <div className="panel__body">
            {technicians.length === 0 ? (
              <p className="chart-empty">No technician activity in this period</p>
            ) : (
              <>
                <BarChart
                  data={chartData}
                  series={[
                    { key: 'resolved', label: 'Resolved', color: '#16a34a' },
                    { key: 'closed', label: 'Closed', color: '#dc2626' },
                  ]}
                  caption="Issues resolved by technician"
                />
                <table className="data-table data-table--compact" style={{ marginTop: '1rem' }}>
                  <thead>
                    <tr>
                      <th scope="col">Technician</th>
                      <th scope="col">Resolved</th>
                      <th scope="col">Closed</th>
                      <th scope="col">Total</th>
                      <th scope="col">Ratings</th>
                      <th scope="col">Avg Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {technicians.map((t) => (
                      <tr key={t.technician_id}>
                        <td data-label="Technician">{t.technician}</td>
                        <td data-label="Resolved">{t.totals.resolved}</td>
                        <td data-label="Closed">{t.totals.closed}</td>
                        <td data-label="Total">{t.totals.total_resolved}</td>
                        <td data-label="Ratings">{t.totals.rating_count}</td>
                        <td data-label="Avg Rating">{t.totals.avg_rating.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </section>

        <section className="panel" aria-labelledby="technician-detail-title">
          <header className="panel__header">
            <h2 className="panel__title" id="technician-detail-title">Technician Detail by Period</h2>
            <p className="panel__subtitle">Breakdown of resolutions and ratings per technician per {period}</p>
          </header>
          <div className="panel__body">
            {technicians.length === 0 ? (
              <p className="chart-empty">No technician activity in this period</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table data-table--compact data-table--responsive">
                  <caption className="sr-only">Technician detail by period</caption>
                  <thead>
                    <tr>
                      <th scope="col">Technician</th>
                      <th scope="col">Period</th>
                      <th scope="col">Resolved</th>
                      <th scope="col">Closed</th>
                      <th scope="col">Total Resolved</th>
                      <th scope="col">Ratings</th>
                      <th scope="col">Avg Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {technicians.flatMap((t) =>
                      t.buckets.map((b) => (
                        <tr key={`${t.technician_id}-${b.period}`}>
                          <td data-label="Technician">{t.technician}</td>
                          <td data-label="Period">{String(b.period).slice(0, 10)}</td>
                          <td data-label="Resolved">{b.resolved}</td>
                          <td data-label="Closed">{b.closed}</td>
                          <td data-label="Total Resolved">{b.total_resolved}</td>
                          <td data-label="Ratings">{b.rating_count}</td>
                          <td data-label="Avg Rating">{b.avg_rating.toFixed(1)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>

      <p className="page-subtitle" style={{ marginTop: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        Reporting range: {String(range.from || '').slice(0, 10)} to {String(range.to || '').slice(0, 10)} · Period: {period}
      </p>
    </div>
  );
}
