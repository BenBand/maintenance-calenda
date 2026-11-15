const pool = require('../config/database');

async function safeRows(text, params = [], fallback = []) {
  try {
    const result = await pool.query(text, params);
    return result.rows || fallback;
  } catch (error) {
    console.error('Public stats query error:', error.message);
    return fallback;
  }
}

async function getPublicStats(req, res) {
  try {
    const [incidentTotals, incidentByStatus, incidentTrend, fixRows, serviceRows, technicians, technicianRatings] = await Promise.all([
      safeRows(`SELECT count(*)::int AS total FROM incidents`, [], [{ total: 0 }]),
      safeRows(
        `SELECT COALESCE(NULLIF(to_jsonb(i)->>'status', ''), 'unknown') AS status,
                count(*)::int AS count
         FROM incidents i
         GROUP BY 1
         ORDER BY count DESC, status ASC`,
        [],
        []
      ),
      safeRows(
        `SELECT to_char(date_trunc('month', (to_jsonb(i)->>'created_at')::timestamptz), 'YYYY-MM') AS month,
                count(*)::int AS reported
         FROM incidents i
         WHERE (to_jsonb(i)->>'created_at') ~ '^\\d{4}-'
           AND (to_jsonb(i)->>'created_at')::timestamptz >= (date_trunc('month', now()) - interval '11 months')
         GROUP BY 1
         ORDER BY 1`,
        [],
        []
      ),
      safeRows(
        `SELECT count(*) FILTER (WHERE COALESCE(to_jsonb(i)->>'status', '') IN ('resolved', 'closed'))::int AS resolved_incidents
         FROM incidents i`,
        [],
        [{ resolved_incidents: 0 }]
      ),
      safeRows(`SELECT count(*)::int AS service_records FROM service_records`, [], [{ service_records: 0 }]),
      safeRows(
        `SELECT id, username, role
         FROM users
         WHERE role IN ('admin', 'manager', 'developer')
         ORDER BY username ASC`,
        [],
        []
      ),
      safeRows(
        `SELECT COALESCE(NULLIF(trim(to_jsonb(ir)->>'technician_name'), ''), 'Unknown') AS technician,
                round(avg((to_jsonb(ir)->>'rating')::numeric), 2) AS average_rating,
                count(*)::int AS rating_count
         FROM incident_ratings ir
         WHERE (to_jsonb(ir)->>'rating') ~ '^[0-9]+(\\.[0-9]+)?$'
         GROUP BY 1
         ORDER BY average_rating DESC, rating_count DESC, technician ASC`,
        [],
        []
      ),
    ]);

    const totalReported = Number(incidentTotals[0]?.total || 0);
    const byStatus = incidentByStatus.map((row) => ({
      status: row.status || 'unknown',
      label: String(row.status || 'unknown').replace(/_/g, ' '),
      count: Number(row.count || 0),
    }));

    const trendMap = new Map(
      incidentTrend.filter((r) => r && r.month).map((r) => [r.month, Number(r.reported || 0)])
    );
    const months = [];
    const now = new Date();
    for (let i = 11; i >= 0; i -= 1) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      months.push({ month: key, label: key.slice(2), reported: trendMap.get(key) || 0 });
    }

    res.json({
      reported_issues: {
        total: totalReported,
        by_status: byStatus,
        by_month: months,
      },
      fixes: {
        resolved_incidents: Number(fixRows[0]?.resolved_incidents || 0),
        service_records: Number(serviceRows[0]?.service_records || 0),
      },
      technicians: technicians.map((row) => ({
        id: row.id,
        username: row.username,
        role: row.role,
      })),
      ratings: technicianRatings.map((row) => ({
        technician: row.technician,
        average_rating: Number(row.average_rating),
        rating_count: Number(row.rating_count || 0),
      })),
    });
  } catch (error) {
    console.error('Get public stats error:', error);
    res.status(500).json({ error: 'Failed to load public statistics' });
  }
}

module.exports = { getPublicStats };
