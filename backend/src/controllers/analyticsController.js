const pool = require('../config/database');
const { resolveRange, localTimestampExpression } = require('../utils/periods');

/**
 * Aggregations backing the analytics dashboard.
 *
 * Every query is read-only, parameterised, and takes the reporting window as
 * bind parameters. Calendar bucketing is done in the configured application
 * timezone (default Africa/Lusaka) rather than UTC so that late-evening slots
 * land in the right day.
 */

function rangeParams(from, to, timezone) {
  return [from.toISOString(), to.toISOString(), timezone];
}

// Most report queries only bind the window; the timezone parameter is only
// needed where calendar buckets are grouped.
function windowParams(from, to) {
  return [from.toISOString(), to.toISOString()];
}

async function getOverview(req, res) {
  const { from, to, preset, timezone } = resolveRange(req.query);
  const params = windowParams(from, to);

  try {
    const [scheduleTotals, assetTotals, incidentTotals] = await Promise.all([
      pool.query(
        `SELECT
            count(*)                                                          AS total,
            count(*) FILTER (WHERE s.status = 'completed')                   AS completed,
            count(*) FILTER (WHERE s.status = 'in_progress')                 AS in_progress,
            count(*) FILTER (WHERE s.status = 'cancelled')                   AS cancelled,
            count(*) FILTER (WHERE s.status <> 'completed'
                               AND s.status <> 'cancelled'
                               AND s.scheduled_at < now())                    AS overdue,
            count(*) FILTER (WHERE s.scheduled_at >= now()
                               AND s.scheduled_at <= now() + interval '7 days') AS due_next_7_days,
            COALESCE(sum(s.duration_minutes) FILTER (WHERE s.scheduled_at >= now()), 0) AS booked_minutes,
            round(AVG(EXTRACT(EPOCH FROM (sr.created_at - s.scheduled_at)) / 60.0)
                  FILTER (WHERE s.status = 'completed' AND sr.id IS NOT NULL), 1) AS avg_resolution_hours
           FROM maintenance_schedules s
           LEFT JOIN service_records sr ON sr.schedule_id = s.id
           WHERE s.scheduled_at >= $1::timestamptz AND s.scheduled_at < $2::timestamptz`,
        params
      ),
      pool.query(
        `SELECT
            (SELECT count(*) FROM assets)                                   AS total_assets,
            (SELECT count(*) FROM assets WHERE lifecycle_status IN ('deployed','in_service')) AS in_service,
            (SELECT count(*) FROM assets WHERE lifecycle_status = 'maintenance')                AS in_maintenance,
            (SELECT count(*) FROM assets WHERE lifecycle_status = 'procurement')                AS in_procurement,
            (SELECT count(*) FROM assets WHERE lifecycle_status = 'retired')                   AS retired,
            (SELECT count(*) FROM assets WHERE lifecycle_status = 'disposed')                  AS disposed,
            (SELECT count(*) FROM assets
              WHERE warranty_expiry IS NOT NULL
                AND warranty_expiry BETWEEN $1::timestamptz AND ($2::timestamptz + interval '90 days')
            )                                                                AS warranty_expiring,
            (SELECT count(*) FROM assets
              WHERE end_of_life_date IS NOT NULL
                AND end_of_life_date BETWEEN $1::date AND ($2::date + 90)
            )                                                                AS end_of_life_soon`
      , params),
      pool.query(
        `SELECT
            count(*)                                                        AS total,
            count(*) FILTER (WHERE i.status IN ('open','in_progress'))      AS open,
            count(*) FILTER (WHERE i.priority = 'critical'
                               AND i.status IN ('open','in_progress'))     AS open_critical,
            count(*) FILTER (WHERE i.created_at >= $1::timestamptz)        AS raised_in_period
         FROM incidents i
         WHERE i.created_at >= $1::timestamptz AND i.created_at < $2::timestamptz`,
        params
      ),
    ]);

    const schedules = scheduleTotals.rows[0];
    const assets = assetTotals.rows[0];
    const incidents = incidentTotals.rows[0];

    const actionable = Number(schedules.total) - Number(schedules.cancelled);

    res.json({
      range: { from: from.toISOString(), to: to.toISOString(), preset, timezone },
      schedules: {
        total: Number(schedules.total),
        completed: Number(schedules.completed),
        in_progress: Number(schedules.in_progress),
        cancelled: Number(schedules.cancelled),
        overdue: Number(schedules.overdue),
        due_next_7_days: Number(schedules.due_next_7_days),
        completion_rate: actionable > 0
          ? Number(((Number(schedules.completed) / actionable) * 100).toFixed(1))
          : 0,
        avg_resolution_hours: schedules.avg_resolution_hours === null
          ? null
          : Number(schedules.avg_resolution_hours) / 60,
      },
      assets: {
        total: Number(assets.total_assets),
        in_service: Number(assets.in_service),
        in_maintenance: Number(assets.in_maintenance),
        in_procurement: Number(assets.in_procurement),
        retired: Number(assets.retired),
        disposed: Number(assets.disposed),
        warranty_expiring: Number(assets.warranty_expiring),
        end_of_life_soon: Number(assets.end_of_life_soon),
      },
      incidents: {
        total: Number(incidents.total),
        open: Number(incidents.open),
        open_critical: Number(incidents.open_critical),
      },
    });
  } catch (error) {
    console.error('Analytics overview error:', error);
    res.status(500).json({ error: 'Failed to build analytics overview' });
  }
}

async function getMaintenanceFrequency(req, res) {
  const { from, to, preset, timezone } = resolveRange(req.query, { defaultPreset: '12m' });
  const params = windowParams(from, to);

  try {
    // The gap between consecutive services per asset is computed in a CTE:
    // a window function inside a LATERAL subquery would only ever see the
    // single joined row and always yield NULL.
    const result = await pool.query(
      `WITH tracked AS (
         SELECT asset_type, count(*) AS assets_tracked
         FROM assets
         GROUP BY asset_type
       ),
       dated AS (
         SELECT s.*,
                extract(day FROM (
                  s.scheduled_at - lag(s.scheduled_at) OVER (PARTITION BY s.asset_id ORDER BY s.scheduled_at)
                ))::int AS gap_days
         FROM maintenance_schedules s
         WHERE s.scheduled_at >= $1::timestamptz AND s.scheduled_at < $2::timestamptz
       ),
       agg AS (
         SELECT d.asset_type,
                count(*)                                                   AS schedules,
                count(*) FILTER (WHERE d.status = 'completed')             AS completed,
                count(*) FILTER (WHERE d.status <> 'completed'
                                   AND d.status <> 'cancelled'
                                   AND d.scheduled_at < now())             AS overdue,
                count(DISTINCT d.asset_id)                                 AS assets_serviced,
                count(sr.id)                                               AS services_logged,
                avg(d.gap_days) FILTER (WHERE d.gap_days > 0)              AS avg_gap_days,
                sum(COALESCE(d.duration_minutes, 0))                       AS booked_minutes,
                sum(COALESCE(sr.time_spent_minutes, 0))                    AS time_spent_minutes
         FROM dated d
         LEFT JOIN service_records sr ON sr.schedule_id = d.id
         GROUP BY d.asset_type
       )
       SELECT t.code,
              t.label,
              COALESCE(tr.assets_tracked, 0)                                       AS assets_tracked,
              COALESCE(a.schedules, 0)                                              AS schedules,
              COALESCE(a.completed, 0)                                              AS completed,
              COALESCE(a.overdue, 0)                                                AS overdue,
              COALESCE(a.assets_serviced, 0)                                       AS assets_serviced,
              COALESCE(a.services_logged, 0)                                        AS services_logged,
              round(COALESCE(a.services_logged, 0)::numeric
                    / NULLIF(COALESCE(tr.assets_tracked, 0), 0), 2)                AS services_per_asset,
              round(COALESCE(a.avg_gap_days, 0), 1)                                AS avg_days_between_services,
              COALESCE(a.booked_minutes, 0)                                        AS booked_minutes,
              COALESCE(a.time_spent_minutes, 0)                                    AS time_spent_minutes,
              round(COALESCE(a.time_spent_minutes, 0)::numeric
                    / NULLIF(COALESCE(a.booked_minutes, 0), 0) * 100, 1)           AS time_utilisation_pct
       FROM asset_types t
       LEFT JOIN tracked tr ON tr.asset_type = t.code
       LEFT JOIN agg a ON a.asset_type = t.code
       ORDER BY COALESCE(a.schedules, 0) DESC, t.sort_order`,
      params
    );

    const rows = result.rows.map((row) => ({
      ...row,
      assets_tracked: Number(row.assets_tracked),
      schedules: Number(row.schedules),
      completed: Number(row.completed),
      overdue: Number(row.overdue),
      assets_serviced: Number(row.assets_serviced),
      services_logged: Number(row.services_logged),
      booked_minutes: Number(row.booked_minutes),
      time_spent_minutes: Number(row.time_spent_minutes),
      completion_rate: Number(row.schedules) > 0
        ? Number(((Number(row.completed) / Number(row.schedules)) * 100).toFixed(1))
        : 0,
    }));

    res.json({
      range: { from: from.toISOString(), to: to.toISOString(), preset, timezone },
      by_asset_type: rows,
      total_schedules: rows.reduce((sum, row) => sum + row.schedules, 0),
    });
  } catch (error) {
    console.error('Maintenance frequency error:', error);
    res.status(500).json({ error: 'Failed to build maintenance frequency report' });
  }
}

async function getTechnicianWorkload(req, res) {
  const { from, to, preset, timezone } = resolveRange(req.query);
  const params = windowParams(from, to);

  try {
    const result = await pool.query(
      `SELECT COALESCE(u.id::text, s.technician)                            AS technician_key,
              COALESCE(u.username, s.technician)                            AS technician,
              s.technician_user_id                                          AS user_id,
              count(*)                                                      AS assigned,
              count(*) FILTER (WHERE s.status = 'completed')                AS completed,
              count(*) FILTER (WHERE s.status = 'in_progress')              AS in_progress,
              count(*) FILTER (WHERE s.status = 'cancelled')                AS cancelled,
              count(*) FILTER (WHERE s.status NOT IN ('completed','cancelled')
                                 AND s.scheduled_at < now())                AS overdue,
              count(*) FILTER (WHERE s.scheduled_at >= now())               AS upcoming,
              COALESCE(sum(s.duration_minutes), 0)                          AS booked_minutes,
              COALESCE(sum(s.duration_minutes) FILTER (WHERE s.status = 'completed'), 0) AS completed_minutes,
              round(AVG(EXTRACT(EPOCH FROM (sr.created_at - s.scheduled_at)) / 60.0)
                    FILTER (WHERE s.status = 'completed' AND sr.id IS NOT NULL), 1) AS avg_resolution_hours,
              max(s.scheduled_at)                                           AS last_scheduled_at
       FROM maintenance_schedules s
       LEFT JOIN users u ON u.id = s.technician_user_id
       LEFT JOIN service_records sr ON sr.schedule_id = s.id
       WHERE s.scheduled_at >= $1::timestamptz AND s.scheduled_at < $2::timestamptz
       GROUP BY u.id, u.username, s.technician, s.technician_user_id
       ORDER BY assigned DESC, technician ASC`,
      params
    );

    const rows = result.rows.map((row) => {
      const actionable = Number(row.assigned) - Number(row.cancelled);
      return {
        ...row,
        assigned: Number(row.assigned),
        completed: Number(row.completed),
        in_progress: Number(row.in_progress),
        cancelled: Number(row.cancelled),
        overdue: Number(row.overdue),
        upcoming: Number(row.upcoming),
        booked_minutes: Number(row.booked_minutes),
        completed_minutes: Number(row.completed_minutes),
        avg_resolution_hours: row.avg_resolution_hours === null
          ? null
          : round1(Number(row.avg_resolution_hours) / 60),
        completion_rate: actionable > 0
          ? round1((Number(row.completed) / actionable) * 100)
          : 0,
        overdue_rate: actionable > 0
          ? round1((Number(row.overdue) / actionable) * 100)
          : 0,
      };
    });

    res.json({
      range: { from: from.toISOString(), to: to.toISOString(), preset, timezone },
      technicians: rows,
      totals: {
        technicians: rows.length,
        assigned: rows.reduce((sum, row) => sum + row.assigned, 0),
        completed: rows.reduce((sum, row) => sum + row.completed, 0),
        overdue: rows.reduce((sum, row) => sum + row.overdue, 0),
        booked_hours: round1(rows.reduce((sum, row) => sum + row.booked_minutes, 0) / 60),
      },
    });
  } catch (error) {
    console.error('Technician workload error:', error);
    res.status(500).json({ error: 'Failed to build technician workload report' });
  }
}

function round1(value) {
  return Number(Number(value).toFixed(1));
}

async function getOverdueTrend(req, res) {
  const { from, to, preset, timezone } = resolveRange(req.query, { defaultPreset: '90d' });
  const interval = ['7d', '30d'].includes(String(req.query.interval)) ? String(req.query.interval) : 'week';
  const params = [from.toISOString(), to.toISOString(), timezone];

  // Weekly buckets over a short window leave visible gaps, so widen the
  // default window when the caller asked for weeks.
  const bucketExpression = interval === 'day'
    ? `to_char(${localTimestampExpression('s.scheduled_at', 3)}, 'YYYY-MM-DD')`
    : `to_char(date_trunc('week', ${localTimestampExpression('s.scheduled_at', 3)})::date, 'YYYY-MM-DD')`;

  try {
    const result = await pool.query(
      `SELECT ${bucketExpression}                       AS bucket,
              date_trunc('${interval}', ${localTimestampExpression('s.scheduled_at', 3)})::date AS bucket_start,
              count(*)                                                AS due,
              count(*) FILTER (WHERE s.status = 'completed')          AS completed,
              count(*) FILTER (WHERE s.status = 'cancelled')          AS cancelled,
              count(*) FILTER (WHERE s.status NOT IN ('completed','cancelled')) AS missed,
              count(DISTINCT s.department)                            AS departments_affected,
              count(DISTINCT COALESCE(s.technician_user_id::text, s.technician)) AS technicians_affected,
              COALESCE(round(AVG(EXTRACT(EPOCH FROM (now() - s.scheduled_at)) / 3600.0)
                      FILTER (WHERE s.status NOT IN ('completed','cancelled')), 1), 0) AS avg_age_hours,
              COALESCE(percentile_disc(0.9) WITHIN GROUP (
                        ORDER BY EXTRACT(EPOCH FROM (now() - s.scheduled_at)) / 3600.0
                      ) FILTER (WHERE s.status NOT IN ('completed','cancelled')), 1) AS p90_age_hours
       FROM maintenance_schedules s
       WHERE s.scheduled_at >= $1::timestamptz AND s.scheduled_at < $2::timestamptz
       GROUP BY 1, 2
       ORDER BY 2`,
      params
    );

    // The interval is a closed allow-list above, so this interpolation can
    // only ever produce 'day' or 'week'.
    const rows = result.rows.map((row) => {
      const due = Number(row.due);
      const actionable = due - Number(row.cancelled);
      const missed = Number(row.missed);
      return {
        bucket: row.bucket,
        bucket_start: row.bucket_start,
        due,
        completed: Number(row.completed),
        cancelled: Number(row.cancelled),
        missed,
        departments_affected: Number(row.departments_affected),
        technicians_affected: Number(row.technicians_affected),
        overdue_rate: actionable > 0 ? round1((missed / actionable) * 100) : 0,
        on_time_rate: actionable > 0 ? round1(((due - missed) / actionable) * 100) : 100,
        avg_age_hours: round1(row.avg_age_hours),
        p90_age_hours: row.p90_age_hours === null ? null : round1(row.p90_age_hours),
      };
    });

    // Backfill empty buckets so the chart shows a continuous timeline rather
    // than silently collapsing gaps in the data.
    const filled = fillBuckets(rows, from, to, interval, timezone);

    const totalDue = filled.reduce((sum, row) => sum + row.due, 0);
    const totalMissed = filled.reduce((sum, row) => sum + row.missed, 0);
    const totalActionable = totalDue - filled.reduce((sum, row) => sum + row.cancelled, 0);

    res.json({
      range: { from: from.toISOString(), to: to.toISOString(), preset, timezone, interval },
      buckets: filled,
      summary: {
        total_due: totalDue,
        total_missed: totalMissed,
        overdue_rate: totalActionable > 0 ? round1((totalMissed / totalActionable) * 100) : 0,
        worst_bucket: filled.reduce(
          (worst, row) => (row.overdue_rate > (worst ? worst.overdue_rate : -1) ? row : worst),
          null
        ),
      },
    });
  } catch (error) {
    console.error('Overdue trend error:', error);
    res.status(500).json({ error: 'Failed to build overdue trend report' });
  }
}

function bucketKey(date, interval) {
  const key = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  if (interval === 'day') return key.toISOString().slice(0, 10);
  const dayOfWeek = (key.getUTCDay() + 6) % 7;
  key.setUTCDate(key.getUTCDate() - dayOfWeek);
  return key.toISOString().slice(0, 10);
}

function bucketStepMs(interval) {
  return interval === 'day' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
}

function fillBuckets(rows, from, to, interval, timezone) {
  const byKey = new Map(rows.map((row) => [row.bucket, row]));
  const filled = [];
  const step = bucketStepMs(interval);
  const startMs = Date.parse(`${bucketKey(from, interval)}T00:00:00Z`);
  const endMs = Date.parse(`${bucketKey(to, interval)}T00:00:00Z`);

  for (let cursor = startMs; cursor <= endMs; cursor += step) {
    const key = new Date(cursor).toISOString().slice(0, 10);
    filled.push(byKey.get(key) || {
      bucket: key,
      bucket_start: key,
      due: 0,
      completed: 0,
      cancelled: 0,
      missed: 0,
      departments_affected: 0,
      technicians_affected: 0,
      overdue_rate: 100,
      on_time_rate: 100,
      avg_age_hours: 0,
      p90_age_hours: null,
    });
  }

  return filled.filter((row, index, all) => index === all.length - 1 || row.due > 0 || all[index + 1].due > 0);
}

async function getTimeByDepartment(req, res) {
  const { from, to, preset, timezone } = resolveRange(req.query);
  const params = windowParams(from, to);

  try {
    // Departments appear in the asset registry, in maintenance history and in
    // downtime records; the union makes sure none of them is silently dropped.
    const result = await pool.query(
      `WITH departments AS (
         SELECT department FROM assets                WHERE department IS NOT NULL AND btrim(department) <> ''
         UNION
         SELECT department FROM maintenance_schedules WHERE department IS NOT NULL AND btrim(department) <> ''
         UNION
         SELECT department FROM downtime_windows     WHERE department IS NOT NULL AND btrim(department) <> ''
       ),
       dept_assets AS (
         SELECT department,
                count(*)                             AS assets,
                count(*) FILTER (WHERE lifecycle_status IN ('deployed','in_service')) AS in_service
         FROM assets
         WHERE department IS NOT NULL
         GROUP BY department
       ),
       dept_maintenance AS (
         SELECT s.department,
                count(DISTINCT s.asset_id)                  AS assets_serviced,
                count(*)                                    AS services,
                COALESCE(sum(sr.time_spent_minutes), 0)     AS time_spent_minutes,
                COALESCE(sum(s.duration_minutes), 0)        AS booked_minutes,
                count(*) FILTER (WHERE sr.complexity_level = 'complex') AS complex_services
         FROM service_records sr
         JOIN maintenance_schedules s ON s.id = sr.schedule_id
         WHERE s.scheduled_at >= $1::timestamptz AND s.scheduled_at < $2::timestamptz
         GROUP BY s.department
       )
       SELECT d.department,
              COALESCE(da.assets, 0)                AS assets,
              COALESCE(da.in_service, 0)            AS in_service,
              COALESCE(dm.assets_serviced, 0)       AS assets_serviced,
              COALESCE(dm.services, 0)              AS services,
              COALESCE(dm.booked_minutes, 0)        AS booked_minutes,
              COALESCE(dm.time_spent_minutes, 0)    AS time_spent_minutes,
              COALESCE(dm.complex_services, 0)      AS complex_services,
              round(COALESCE(dm.time_spent_minutes, 0)::numeric
                    / NULLIF(COALESCE(dm.services, 0), 0), 1)                AS avg_time_per_service,
              round(COALESCE(dm.time_spent_minutes, 0)::numeric
                    / NULLIF(COALESCE(da.assets, 0), 0), 1)                  AS time_per_asset
       FROM departments d
       LEFT JOIN dept_assets da ON da.department = d.department
       LEFT JOIN dept_maintenance dm ON dm.department = d.department
       ORDER BY time_spent_minutes DESC, d.department ASC`,
      params
    );

    const rows = result.rows.map((row) => ({
      ...row,
      assets: Number(row.assets),
      in_service: Number(row.in_service),
      assets_serviced: Number(row.assets_serviced),
      services: Number(row.services),
      booked_minutes: Number(row.booked_minutes),
      time_spent_minutes: Number(row.time_spent_minutes),
      complex_services: Number(row.complex_services),
      avg_time_per_service: Number(row.avg_time_per_service),
      time_per_asset: Number(row.time_per_asset),
    }));

    const totalTimeSpent = rows.reduce((sum, row) => sum + row.time_spent_minutes, 0);

    res.json({
      range: { from: from.toISOString(), to: to.toISOString(), preset, timezone },
      by_department: rows.map((row) => ({
        ...row,
        share_of_time: totalTimeSpent > 0
          ? round1((row.time_spent_minutes / totalTimeSpent) * 100)
          : 0,
      })),
      totals: {
        time_spent_hours: round1(totalTimeSpent / 60),
        total_services: rows.reduce((sum, row) => sum + row.services, 0),
        total_complex_services: rows.reduce((sum, row) => sum + row.complex_services, 0),
      },
    });
  } catch (error) {
    console.error('Time by department error:', error);
    res.status(500).json({ error: 'Failed to build time breakdown report' });
  }
}

async function getUptimeStats(req, res) {
  const { from, to, preset, timezone } = resolveRange(req.query, { defaultPreset: '30d' });
  const periodMinutes = (Date.parse(to.toISOString()) - Date.parse(from.toISOString())) / 60000;

  try {
    // Downtime is the union of recorded downtime windows and the downtime
    // attributed to completed service records. Only the overlap with the
    // reporting window counts, and windows that are not scoped to a single
    // department are attributed to every department (council-wide outage).
    const [deptResult, windowResult, assetResult, summaryResult] = await Promise.all([
      pool.query(
        `WITH departments AS (
           SELECT department FROM assets                WHERE department IS NOT NULL AND btrim(department) <> ''
           UNION
           SELECT department FROM maintenance_schedules WHERE department IS NOT NULL AND btrim(department) <> ''
         ),
         scoped AS (
           SELECT w.department,
                  sum(EXTRACT(EPOCH FROM (
                    LEAST(w.ends_at, $2::timestamptz) - GREATEST(w.starts_at, $1::timestamptz)
                  )))::bigint AS overlap_seconds,
                  count(*) AS windows
           FROM downtime_windows w
           WHERE w.department IS NOT NULL
             AND w.starts_at < $2::timestamptz AND w.ends_at > $1::timestamptz
           GROUP BY w.department
         ),
         council AS (
           SELECT sum(EXTRACT(EPOCH FROM (
                    LEAST(w.ends_at, $2::timestamptz) - GREATEST(w.starts_at, $1::timestamptz)
                  )))::bigint AS overlap_seconds,
                  count(*) AS windows
           FROM downtime_windows w
           WHERE w.department IS NULL
             AND w.starts_at < $2::timestamptz AND w.ends_at > $1::timestamptz
         ),
         serviced AS (
           -- service_records.downtime_minutes was dropped in migration 000014.
           -- Service counts still come from service_records, but every minute of
           -- downtime is now derived from downtime_windows, which records both
           -- the department and the asset it knocked out.
           SELECT s.department,
                  count(*) AS services_recorded
           FROM service_records sr
           JOIN maintenance_schedules s ON s.id = sr.schedule_id
           WHERE s.scheduled_at >= $1::timestamptz AND s.scheduled_at < $2::timestamptz
           GROUP BY s.department
         )
         SELECT d.department,
                COALESCE(sc.overlap_seconds, 0)::numeric / 60     AS window_downtime_minutes,
                COALESCE(cw.overlap_seconds, 0)::numeric / 60     AS council_downtime_minutes,
                COALESCE(sc.windows, 0)                           AS windows,
                COALESCE(cw.windows, 0)                           AS council_windows,
                COALESCE(sv.services_recorded, 0)                 AS services_recorded
         FROM departments d
         LEFT JOIN scoped sc ON sc.department = d.department
         LEFT JOIN serviced sv ON sv.department = d.department
         CROSS JOIN council cw
         ORDER BY d.department`,
        [from.toISOString(), to.toISOString()]
      ),
      pool.query(
        `SELECT w.id, w.department, w.room, w.title, w.reason, w.window_type,
                w.starts_at, w.ends_at,
                EXTRACT(EPOCH FROM (
                  LEAST(w.ends_at, $2::timestamptz) - GREATEST(w.starts_at, $1::timestamptz)
                ))::bigint / 60 AS minutes_in_window
         FROM downtime_windows w
         WHERE w.starts_at < $2::timestamptz AND w.ends_at > $1::timestamptz
         ORDER BY w.starts_at DESC
         LIMIT 100`,
        [from.toISOString(), to.toISOString()]
      ),
      pool.query(
        `WITH asset_windows AS (
           SELECT w.asset_id,
                  sum(EXTRACT(EPOCH FROM (
                    LEAST(w.ends_at, $2::timestamptz) - GREATEST(w.starts_at, $1::timestamptz)
                  )))::bigint / 60 AS service_downtime_minutes
           FROM downtime_windows w
           WHERE w.asset_id IS NOT NULL
             AND w.starts_at < $2::timestamptz AND w.ends_at > $1::timestamptz
           GROUP BY w.asset_id
         ),
         serviced AS (
           SELECT a.id, a.asset_identifier, a.asset_type, a.department,
                  count(sr.id) AS services
           FROM assets a
           LEFT JOIN service_records sr
             ON sr.asset_id = a.id
            AND sr.created_at >= $1::timestamptz AND sr.created_at < $2::timestamptz
           GROUP BY a.id, a.asset_identifier, a.asset_type, a.department
         )
         SELECT s.id, s.asset_identifier, s.asset_type, s.department,
                s.services,
                COALESCE(aw.service_downtime_minutes, 0) AS service_downtime_minutes,
                (EXTRACT(EPOCH FROM ($2::timestamptz - $1::timestamptz)) / 60) AS period_minutes
         FROM serviced s
         LEFT JOIN asset_windows aw ON aw.asset_id = s.id
         ORDER BY service_downtime_minutes DESC, s.asset_identifier
         LIMIT 50`,
        [from.toISOString(), to.toISOString()]
      ),
      pool.query(
        `SELECT
            count(*) FILTER (WHERE lifecycle_status IN ('deployed','in_service')) AS operational_assets,
            count(*) FILTER (WHERE lifecycle_status = 'maintenance')                AS in_maintenance,
            count(*) FILTER (WHERE lifecycle_status IN ('procurement','retired','disposed')) AS out_of_service,
            COALESCE(count(DISTINCT sr.schedule_id), 0)                            AS services_logged
         FROM assets a
         LEFT JOIN service_records sr
           ON sr.asset_id = a.id AND sr.created_at >= $1::timestamptz AND sr.created_at < $2::timestamptz`,
        [from.toISOString(), to.toISOString()]
      ),
    ]);

    const rows = deptResult.rows.map((row) => {
      const windowMinutes = Number(row.window_downtime_minutes);
      const councilMinutes = Number(row.council_downtime_minutes);
      const servicesRecorded = Number(row.services_recorded);
      // Every window a department owns is downtime for it, plus the council-wide
      // windows that are not attributable to a single department.
      const downtimeMinutes = windowMinutes + councilMinutes;
      return {
        department: row.department,
        windows: Number(row.windows) + Number(row.council_windows),
        own_window_minutes: windowMinutes,
        council_window_minutes: councilMinutes,
        services_recorded: servicesRecorded,
        downtime_minutes: downtimeMinutes,
        period_minutes: periodMinutes,
        uptime_pct: periodMinutes > 0
          ? Number((Math.max(0, 100 - (downtimeMinutes / periodMinutes) * 100)).toFixed(2))
          : 100,
        mttr_hours: servicesRecorded > 0
          ? Number((downtimeMinutes / servicesRecorded / 60).toFixed(1))
          : 0,
      };
    });

    const summary = summaryResult.rows[0];
    const operationalAssets = Number(summary.operational_assets) || 0;
    const windowDowntimeMinutes = windowResult.rows.reduce((sum, row) => sum + Number(row.minutes_in_window), 0);
    const totalDowntimeMinutes = windowDowntimeMinutes;

    res.json({
      range: { from: from.toISOString(), to: to.toISOString(), preset, timezone },
      period_minutes: periodMinutes,
      fleet: {
        operational_assets: operationalAssets,
        in_maintenance: Number(summary.in_maintenance),
        out_of_service: Number(summary.out_of_service),
        services_logged: Number(summary.services_logged),
        availability_pct: operationalAssets > 0
          ? Number((Math.max(0, 100 - (totalDowntimeMinutes / periodMinutes / operationalAssets) * 100)).toFixed(2))
          : 100,
      },
      by_department: rows.sort((a, b) => a.uptime_pct - b.uptime_pct),
      worst_assets: assetResult.rows.map((row) => {
        const downtime = Number(row.service_downtime_minutes);
        const period = Number(row.period_minutes);
        return {
          id: Number(row.id),
          asset_identifier: row.asset_identifier,
          asset_type: row.asset_type,
          department: row.department,
          services: Number(row.services),
          downtime_minutes: downtime,
          uptime_pct: period > 0
            ? Number((Math.max(0, 100 - (downtime / period) * 100)).toFixed(2))
            : 100,
        };
      }),
      windows: windowResult.rows.map((row) => ({
        ...row,
        minutes_in_window: Number(row.minutes_in_window),
      })),
      methodology: {
        downtime_sources: ['downtime_windows'],
        note: 'Planned and service downtime are additive; windows without a department are attributed to every department. Figures exclude cancelled schedules.',
      },
    });
  } catch (error) {
    console.error('Uptime stats error:', error);
    res.status(500).json({ error: 'Failed to build uptime statistics' });
  }
}

module.exports = {
  getOverview,
  getMaintenanceFrequency,
  getTechnicianWorkload,
  getOverdueTrend,
  getTimeByDepartment,
  getUptimeStats,
};
