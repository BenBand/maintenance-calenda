import { useCallback, useState } from 'react';
import { apiFetch, readApiData } from '../services/api';
import { useApiData } from '../hooks/useApiData';
import { ErrorState, SkeletonPage } from '../components/AsyncState';
import { BarChart, DonutChart, LineChart, Meter } from '../components/Charts';
import {
  formatMinutes, formatPercent, humanizeKey,
} from '../utils/datetime';
import './analytics.css';

const PERIODS = [
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: '6m', label: '6 months' },
  { value: '12m', label: '12 months' },
  { value: 'ytd', label: 'Year to date' },
];

const TREND_INTERVALS = [
  { value: 'week', label: 'Weekly' },
  { value: 'day', label: 'Daily' },
];

const SERIES_COLORS = {
  laptop: '#2563eb',
  desktop: '#7c3aed',
  network_equipment: '#0891b2',
  printer: '#ea580c',
  completed: '#16a34a',
  missed: '#dc2626',
  cancelled: '#9ca3af',
  maintenance: '#f97316',
  procurement: '#6366f1',
  time_spent: '#0ea5e9',
};

function colorFor(key, fallbackIndex = 0) {
  if (SERIES_COLORS[key]) return SERIES_COLORS[key];
  const palette = ['#f97316', '#2563eb', '#16a34a', '#7c3aed', '#0891b2', '#dc2626', '#ea580c', '#0f766e'];
  return palette[fallbackIndex % palette.length];
}

function ChartCard({ title, subtitle, children, action, id }) {
  return (
    <section className="panel" aria-labelledby={id}>
      <header className="panel__header">
        <div>
          <h2 className="panel__title" id={id}>{title}</h2>
          {subtitle && <p className="panel__subtitle">{subtitle}</p>}
        </div>
        {action}
      </header>
      <div className="panel__body">{children}</div>
    </section>
  );
}

function DataTable({ caption, headers, rows, emptyMessage }) {
  if (!rows.length) return <p className="chart-empty">{emptyMessage}</p>;
  return (
    <div className="table-wrap">
      <table className="data-table data-table--compact data-table--responsive">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>{headers.map((header) => <th key={header} scope="col">{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              {row.cells.map((cell, index) => (
                <td key={`${row.key}-${index}`} data-label={headers[index]}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState('90d');
  const [interval, setInterval] = useState('week');

  const loadAnalytics = useCallback(async () => {
    const query = `period=${encodeURIComponent(period)}${interval ? `&interval=${encodeURIComponent(interval)}` : ''}`;
    const [overviewRes, frequencyRes, workloadRes, trendRes, timeRes, uptimeRes] = await Promise.all([
      apiFetch(`/analytics/overview?${query}`, {}),
      apiFetch(`/analytics/maintenance-frequency?period=${encodeURIComponent(period === 'ytd' ? '12m' : period)}`, {}),
      apiFetch(`/analytics/technician-workload?${query}`, {}),
      apiFetch(`/analytics/overdue-trend?${query}`, {}),
      apiFetch(`/analytics/time-by-department?${query}`, {}),
      apiFetch(`/analytics/uptime?period=${encodeURIComponent(period === 'ytd' ? '12m' : period)}`, {}),
    ]);

    const results = await Promise.all(
      [overviewRes, frequencyRes, workloadRes, trendRes, timeRes, uptimeRes].map((res) => readApiData(res)),
    );
    const [overview, frequency, workload, trend, time, uptime] = results;
    return { overview, frequency, workload, trend, time, uptime };
  }, [period, interval]);

  const { data, loading, error, reload } = useApiData(loadAnalytics);

  if (loading && !data) return <SkeletonPage label="Loading analytics..." />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;

  const overview = data?.overview || {};
  const frequency = data?.frequency || {};
  const workload = data?.workload || {};
  const trend = data?.trend || {};
  const time = data?.time || {};
  const uptime = data?.uptime || {};

  const schedules = overview.schedules || {};
  const assets = overview.assets || {};
  const incidents = overview.incidents || {};

  const byAssetType = frequency.by_asset_type || [];
  const technicians = workload.technicians || [];
  const trendBuckets = trend.buckets || [];
  const timeDepartments = time.by_department || [];
  const uptimeDepartments = uptime.by_department || [];

  const frequencyChartData = byAssetType.map((row) => ({
    label: row.label,
    schedules: row.schedules,
    services: row.services_logged,
  }));

  const workloadChartData = technicians.map((row) => ({
    label: row.technician,
    completed: row.completed,
    overdue: row.overdue,
    upcoming: row.upcoming,
  }));

  const trendChartData = trendBuckets.map((bucket) => ({
    label: bucket.bucket_start ? String(bucket.bucket_start).slice(5, 10) : bucket.bucket,
    completed: bucket.completed,
    missed: bucket.missed,
  }));

  const timeChartData = timeDepartments.map((row) => ({
    label: row.department,
    time_spent: row.time_spent_minutes,
    booked: row.booked_minutes,
  }));

  const donutColors = timeDepartments.map((row, index) => colorFor(row.department, index));
  const assetTypeColors = byAssetType.map((row) => colorFor(row.code, 0));

  return (
    <div className="page page--wide" aria-busy={loading}>
      <header className="page-header">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-subtitle">Maintenance frequency, workload, time tracking and availability</p>
        </div>
      </header>

      {error && (
        <div className="inline-alert" role="alert">
          <span>{error}</span>
          <button className="button button--secondary button--small" type="button" onClick={reload}>Retry</button>
        </div>
      )}

      <div className="filters" aria-label="Reporting period">
        <div className="filter-group">
          <label className="sr-only" htmlFor="analytics-period">Reporting period</label>
          <select
            className="input"
            id="analytics-period"
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
          >
            {PERIODS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label className="sr-only" htmlFor="analytics-interval">Trend interval</label>
          <select
            className="input"
            id="analytics-interval"
            value={interval}
            onChange={(event) => setInterval(event.target.value)}
          >
            {TREND_INTERVALS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div className="filter-group filter-group--meta">
          <span className="filter-meta">
            {overview.range
              ? `${String(overview.range.from).slice(0, 10)} to ${String(overview.range.to).slice(0, 10)} · ${overview.range.timezone}`
              : ''}
          </span>
        </div>
      </div>

      <div className="stats-grid stats-grid--secondary" aria-label="Headline metrics">
        <div className="stat-card stat-card--compact">
          <div className="stat-card__number">{formatPercent(schedules.completion_rate || 0)}</div>
          <div className="stat-card__label">Completion Rate</div>
          <div className="stat-card__hint">{schedules.completed || 0} of {schedules.total || 0} jobs</div>
        </div>
        <div className="stat-card stat-card--compact stat-card--danger">
          <div className="stat-card__number">{schedules.overdue || 0}</div>
          <div className="stat-card__label">Overdue</div>
          <div className="stat-card__hint">{trend.summary ? `${formatPercent(trend.summary.overdue_rate)} missed` : ''}</div>
        </div>
        <div className="stat-card stat-card--compact stat-card--info">
          <div className="stat-card__number">{formatMinutes(time.totals?.time_spent_hours * 60 || 0)}</div>
          <div className="stat-card__label">Time Spent</div>
          <div className="stat-card__hint">{time.totals?.total_services || 0} services · {time.totals?.total_complex_services || 0} complex</div>
        </div>
        <div className="stat-card stat-card--compact stat-card--success">
          <div className="stat-card__number">{formatPercent(uptime.fleet?.availability_pct ?? 100, 2)}</div>
          <div className="stat-card__label">Fleet Availability</div>
          <div className="stat-card__hint">{uptime.fleet?.operational_assets ?? 0} assets in service</div>
        </div>
      </div>

      <div className="analytics-grid">
        <ChartCard
          id="frequency-title"
          title="Maintenance Frequency by Asset Type"
          subtitle={`${frequency.total_schedules || 0} schedules across ${byAssetType.length} categories`}
        >
          <BarChart
            data={frequencyChartData}
            series={[
              { key: 'schedules', label: 'Scheduled', color: 'var(--primary)' },
              { key: 'services', label: 'Serviced', color: 'var(--success)' },
            ]}
            caption="Maintenance frequency by asset type"
          />
          <DataTable
            caption="Maintenance frequency by asset type"
            emptyMessage="No maintenance recorded in this period"
            headers={['Asset Type', 'Assets', 'Schedules', 'Per Asset', 'Avg Gap (days)', 'Overdue']}
            rows={byAssetType.map((row) => ({
              key: row.code,
              cells: [
                row.label,
                row.assets_tracked,
                row.schedules,
                row.services_per_asset,
                row.avg_days_between_services || '—',
                row.overdue,
              ],
            }))}
          />
        </ChartCard>

        <ChartCard
          id="workload-title"
          title="Technician Workload and Completion"
          subtitle={`${technicians.length} technicians · ${formatMinutes(workload.totals?.booked_hours * 60 || 0)} booked`}
        >
          {technicians.length === 0 ? (
            <p className="chart-empty">No maintenance assigned in this period</p>
          ) : (
            <>
              <BarChart
                data={workloadChartData}
                series={[
                  { key: 'completed', label: 'Completed', color: SERIES_COLORS.completed },
                  { key: 'overdue', label: 'Overdue', color: SERIES_COLORS.missed },
                  { key: 'upcoming', label: 'Upcoming', color: 'var(--info)' },
                ]}
                caption="Technician workload"
              />
              <ul className="workload-list">
                {technicians.map((tech) => (
                  <li className="workload-item" key={tech.technician_key || tech.technician}>
                    <div className="workload-item__head">
                      <span className="workload-item__name">{tech.technician}</span>
                      <span className="workload-item__rate">{formatPercent(tech.completion_rate)}</span>
                    </div>
                    <Meter
                      label="Completion"
                      value={tech.completion_rate}
                      tone={tech.completion_rate >= 80 ? 'success' : tech.completion_rate >= 50 ? 'warning' : 'danger'}
                    />
                    <p className="workload-item__meta">
                      {tech.completed}/{tech.assigned} done · {tech.overdue} overdue · {formatMinutes(tech.booked_minutes)} booked
                      {tech.avg_resolution_hours != null ? ` · ${Math.round(tech.avg_resolution_hours)}h avg` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </ChartCard>

        <ChartCard
          id="overdue-title"
          title="Overdue Trend"
          subtitle={trend.summary ? `${formatPercent(trend.summary.overdue_rate)} of actionable jobs missed` : ''}
          action={(
            <div className="filter-group">
              <label className="sr-only" htmlFor="trend-interval">Trend interval</label>
              <select
                className="input input--small"
                id="trend-interval"
                value={interval}
                onChange={(event) => setInterval(event.target.value)}
              >
                {TREND_INTERVALS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
          )}
        >
          {trendBuckets.length === 0 ? (
            <p className="chart-empty">No scheduled work in this period</p>
          ) : (
            <>
              <LineChart
                data={trendChartData}
                series={[
                  { key: 'completed', label: 'Completed on time', color: SERIES_COLORS.completed },
                  { key: 'missed', label: 'Missed', color: SERIES_COLORS.missed },
                ]}
                caption="Overdue trend"
              />
              <DataTable
                caption="Overdue trend by bucket"
                emptyMessage="No buckets"
                headers={['Bucket', 'Due', 'Completed', 'Missed', 'Missed %', 'Avg Age']}
                rows={trendBuckets.map((bucket) => ({
                  key: bucket.bucket,
                  cells: [
                    bucket.bucket,
                    bucket.due,
                    bucket.completed,
                    bucket.missed,
                    formatPercent(bucket.overdue_rate),
                    formatMinutes(bucket.avg_age_hours * 60),
                  ],
                }))}
              />
            </>
          )}
        </ChartCard>

        <ChartCard
          id="time-title"
          title="Time Tracking by Department"
          subtitle={time.totals ? `${formatMinutes(time.totals.time_spent_hours * 60)} total · ${time.totals.total_services} services` : ''}
        >
          {timeDepartments.length === 0 ? (
            <p className="chart-empty">No time tracking data recorded</p>
          ) : (
            <>
              <BarChart
                data={timeChartData}
                series={[
                  { key: 'time_spent', label: 'Time Spent', color: SERIES_COLORS.maintenance },
                  { key: 'booked', label: 'Booked', color: 'var(--info)' },
                ]}
                valueFormatter={(v) => formatMinutes(v)}
                caption="Time spent vs booked by department"
              />
              <DonutChart
                data={timeDepartments.map((row, index) => ({
                  label: row.department,
                  value: row.time_spent_minutes,
                  color: donutColors[index],
                }))}
                valueFormatter={(v) => formatMinutes(v)}
                caption="Time spent share"
                centerLabel="hours"
                centerValue={formatMinutes(time.totals?.time_spent_hours * 60 || 0)}
              />
              <DataTable
                caption="Time tracking by department"
                emptyMessage="No time data"
                headers={['Department', 'Assets', 'Services', 'Complex', 'Booked (min)', 'Time Spent (min)', 'Avg/Service (min)', 'Share']}
                rows={timeDepartments.map((row) => ({
                  key: row.department,
                  cells: [
                    row.department,
                    row.assets,
                    row.services,
                    row.complex_services,
                    row.booked_minutes,
                    row.time_spent_minutes,
                    row.avg_time_per_service || '—',
                    formatPercent(row.share_of_time),
                  ],
                }))}
              />
            </>
          )}
        </ChartCard>

        <ChartCard
          id="uptime-title"
          title="Asset Uptime and Downtime"
          subtitle={uptime.methodology?.note}
        >
          {uptimeDepartments.length === 0 ? (
            <p className="chart-empty">No department activity in this period</p>
          ) : (
            <>
              <BarChart
                data={uptimeDepartments.map((row) => ({
                  label: row.department,
                  uptime: Number(row.uptime_pct),
                }))}
                series={[{ key: 'uptime', label: 'Uptime %', color: 'var(--success)' }]}
                valueFormatter={(v) => `${Number(v).toFixed(1)}%`}
                caption="Uptime by department"
              />
              <DataTable
                caption="Uptime and downtime by department"
                emptyMessage="No downtime recorded"
                headers={['Department', 'Uptime', 'Windows', 'Service Downtime', 'Total Downtime', 'MTTR']}
                rows={uptimeDepartments.map((row) => ({
                  key: row.department,
                  cells: [
                    row.department,
                    formatPercent(row.uptime_pct, 2),
                    row.windows,
                    formatMinutes(row.service_downtime_minutes),
                    formatMinutes(row.downtime_minutes),
                    `${row.mttr_hours}h`,
                  ],
                }))}
              />
              {Array.isArray(uptime.worst_assets) && uptime.worst_assets.filter((a) => a.downtime_minutes > 0).length > 0 && (
                <div className="subsection">
                  <h3 className="subsection__title">Assets with the most downtime</h3>
                  <DataTable
                    caption="Assets with the most recorded downtime"
                    emptyMessage="No downtime recorded"
                    headers={['Asset', 'Type', 'Department', 'Services', 'Downtime', 'Uptime']}
                    rows={uptime.worst_assets.filter((a) => a.downtime_minutes > 0).map((row) => ({
                      key: row.id,
                      cells: [
                        row.asset_identifier,
                        humanizeKey(row.asset_type),
                        row.department || '—',
                        row.services,
                        formatMinutes(row.downtime_minutes),
                        formatPercent(row.uptime_pct, 2),
                      ],
                    }))}
                  />
                </div>
              )}
            </>
          )}
        </ChartCard>

        <ChartCard id="asset-health-title" title="Asset Fleet" subtitle="Lifecycle and warranty exposure">
          <div className="fleet-grid">
            <div className="fleet-tile">
              <span className="fleet-tile__value">{assets.total ?? 0}</span>
              <span className="fleet-tile__label">Total Assets</span>
            </div>
            <div className="fleet-tile">
              <span className="fleet-tile__value">{assets.in_service ?? 0}</span>
              <span className="fleet-tile__label">In Service</span>
            </div>
            <div className="fleet-tile">
              <span className="fleet-tile__value">{assets.in_maintenance ?? 0}</span>
              <span className="fleet-tile__label">In Maintenance</span>
            </div>
            <div className="fleet-tile">
              <span className="fleet-tile__value">{assets.in_procurement ?? 0}</span>
              <span className="fleet-tile__label">In Procurement</span>
            </div>
            <div className="fleet-tile fleet-tile--warning">
              <span className="fleet-tile__value">{assets.warranty_expiring ?? 0}</span>
              <span className="fleet-tile__label">Warranty Expiring</span>
            </div>
            <div className="fleet-tile fleet-tile--danger">
              <span className="fleet-tile__value">{assets.end_of_life_soon ?? 0}</span>
              <span className="fleet-tile__label">End of Life</span>
            </div>
            <div className="fleet-tile">
              <span className="fleet-tile__value">{assets.disposed ?? 0}</span>
              <span className="fleet-tile__label">Disposed</span>
            </div>
            <div className="fleet-tile">
              <span className="fleet-tile__value">{incidents.open ?? 0}</span>
              <span className="fleet-tile__label">Open Incidents</span>
            </div>
          </div>
          {assetTypeColors.length > 0 && (
            <DonutChart
              data={byAssetType.map((row, index) => ({
                label: row.label,
                value: row.assets_tracked,
                color: assetTypeColors[index],
              }))}
              caption="Assets by type"
              centerLabel="assets"
              centerValue={String(assets.total ?? 0)}
            />
          )}
        </ChartCard>
      </div>
    </div>
  );
}
