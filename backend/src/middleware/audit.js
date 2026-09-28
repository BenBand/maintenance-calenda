const crypto = require('crypto');
const pool = require('../config/database');

const ipSalt = process.env.AUDIT_IP_SALT;

function hashIp(ip) {
  if (!ip) return null;
  if (!ipSalt) {
    throw new Error('AUDIT_IP_SALT is not set; refusing to hash audit log IPs with an unsalted digest.');
  }
  const normalizedIp = ip.replace(/^::ffff:/, '');
  return crypto.createHash('sha256').update(normalizedIp + ipSalt).digest('hex');
}

async function logMaintenanceAudit(req, action, entityType, entityId, details, userId) {
  const resolvedUserId = userId !== undefined ? userId : (req.user ? req.user.id : null);
  const rawIp = req.ip || req.connection?.remoteAddress || null;
  try {
    const ipAddress = hashIp(rawIp);
    await pool.query(
      'INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address) VALUES ($1, $2, $3, $4, $5, $6)',
      [resolvedUserId, action, entityType, entityId || null, JSON.stringify(details || {}), ipAddress]
    );
  } catch (error) {
    console.error('Audit log error:', error);
  }
}

module.exports = { logMaintenanceAudit, hashIp };
