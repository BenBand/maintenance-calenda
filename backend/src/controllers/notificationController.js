const pool = require('../config/database');
const { logMaintenanceAudit } = require('../middleware/audit');

/**
 * Returns notification counts for the signed-in user.
 *
 * Staff roles (admin, manager, developer) see:
 *   - incidents that need attention: open or in_progress and not yet acknowledged
 *   - published maintenance notices that are currently active
 *
 * Regular users see:
 *   - their own incidents that are not yet closed (pending resolution)
 *   - published maintenance notices that are currently active
 */
async function getNotificationCount(req, res) {
  const userId = req.user.id;
  const userRole = req.user.role;
  const isStaff = userRole === 'admin' || userRole === 'manager' || userRole === 'developer';

  try {
    let incidentCount = 0;
    if (isStaff) {
      const result = await pool.query(
        `SELECT count(*) AS c
         FROM incidents
         WHERE status IN ('open', 'in_progress')
           AND acknowledged_at IS NULL`
      );
      incidentCount = parseInt(result.rows[0].c, 10);
    } else {
      const result = await pool.query(
        `SELECT count(*) AS c
         FROM incidents
         WHERE reported_by = $1
           AND status <> 'closed'`,
        [userId]
      );
      incidentCount = parseInt(result.rows[0].c, 10);
    }

    const now = new Date().toISOString();
    const noticeResult = await pool.query(
      `SELECT count(*) AS c
       FROM maintenance_notices
       WHERE published = true
         AND start_time <= $1::timestamptz
         AND (end_time IS NULL OR end_time >= $1::timestamptz)`,
      [now]
    );
    const noticeCount = parseInt(noticeResult.rows[0].c, 10);

    const total = incidentCount + noticeCount;

    await logMaintenanceAudit(req, 'READ_NOTIFICATIONS', 'notification', null, {
      incident_count: incidentCount,
      notice_count: noticeCount,
    }, userId);

    res.json({
      total,
      incidents: incidentCount,
      notices: noticeCount,
    });
  } catch (error) {
    console.error('Notification count error:', error);
    res.status(500).json({ error: 'Failed to fetch notification count' });
  }
}

module.exports = { getNotificationCount };
