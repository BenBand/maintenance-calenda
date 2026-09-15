const pool = require('../config/database');

async function logMaintenanceAudit(req, action, entityType, entityId, details, userId) {
  const resolvedUserId = userId !== undefined ? userId : (req.user ? req.user.id : null);
  const ipAddress = req.ip || req.connection.remoteAddress || null;
  try {
    await pool.query(
      'INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address) VALUES ($1, $2, $3, $4, $5, $6)',
      [resolvedUserId, action, entityType, entityId || null, JSON.stringify(details || {}), ipAddress]
    );
  } catch (error) {
    console.error('Audit log error:', error);
  }
}

module.exports = { logMaintenanceAudit };
