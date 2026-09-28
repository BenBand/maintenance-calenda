const jwt = require('jsonwebtoken');
require('dotenv').config();

const ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  STAFF: 'staff',
};

const PERMISSIONS = {
  MAINTENANCE_READ: 'maintenance:read',
  MAINTENANCE_WRITE: 'maintenance:write',
  MAINTENANCE_DELETE: 'maintenance:delete',
  SERVICE_READ: 'service:read',
  SERVICE_WRITE: 'service:write',
  SERVICE_DELETE: 'service:delete',
  INCIDENT_READ: 'incident:read',
  INCIDENT_WRITE: 'incident:write',
  INCIDENT_DELETE: 'incident:delete',
  ASSET_READ: 'asset:read',
  ASSET_WRITE: 'asset:write',
  ASSET_DELETE: 'asset:delete',
  ANALYTICS_READ: 'analytics:read',
  PROFILE_READ: 'profile:read',
  PROFILE_UPDATE: 'profile:update',
  USER_READ: 'user:read',
  USER_WRITE: 'user:write',
  USER_DELETE: 'user:delete',
};

const BASELINE = [PERMISSIONS.PROFILE_READ, PERMISSIONS.PROFILE_UPDATE];

const ADMIN_PERMISSIONS = [
  PERMISSIONS.MAINTENANCE_READ, PERMISSIONS.MAINTENANCE_WRITE, PERMISSIONS.MAINTENANCE_DELETE,
  PERMISSIONS.SERVICE_READ, PERMISSIONS.SERVICE_WRITE, PERMISSIONS.SERVICE_DELETE,
  PERMISSIONS.INCIDENT_READ, PERMISSIONS.INCIDENT_WRITE, PERMISSIONS.INCIDENT_DELETE,
  PERMISSIONS.ASSET_READ, PERMISSIONS.ASSET_WRITE, PERMISSIONS.ASSET_DELETE,
  PERMISSIONS.ANALYTICS_READ,
  PERMISSIONS.USER_READ, PERMISSIONS.USER_WRITE, PERMISSIONS.USER_DELETE,
  ...BASELINE,
];

// Managers plan and schedule but cannot destroy records.
const MANAGER_PERMISSIONS = [
  PERMISSIONS.MAINTENANCE_READ, PERMISSIONS.MAINTENANCE_WRITE,
  PERMISSIONS.SERVICE_READ, PERMISSIONS.SERVICE_WRITE,
  PERMISSIONS.INCIDENT_READ, PERMISSIONS.INCIDENT_WRITE,
  PERMISSIONS.ASSET_READ, PERMISSIONS.ASSET_WRITE,
  PERMISSIONS.ANALYTICS_READ,
  ...BASELINE,
];

// Field technicians on the PWA: they work a job from the calendar and close it
// out on site, so they need the service record permission the offline mutation
// queue exists to deliver. They cannot create or cancel schedules, and the
// asset register stays read-only because it is a council-wide inventory.
const STAFF_PERMISSIONS = [
  PERMISSIONS.MAINTENANCE_READ,
  PERMISSIONS.SERVICE_READ,
  PERMISSIONS.SERVICE_WRITE,
  PERMISSIONS.ASSET_READ,
  ...BASELINE,
];

const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: ADMIN_PERMISSIONS,
  [ROLES.MANAGER]: MANAGER_PERMISSIONS,
  [ROLES.STAFF]: STAFF_PERMISSIONS,
};

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Access token expired' });
      }
      return res.status(403).json({ error: 'Invalid token' });
    }
    if (user.type !== 'access') {
      return res.status(403).json({ error: 'Invalid token type' });
    }
    req.user = user;
    next();
  });
}

function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

function hasPermission(userRole, permission) {
  const permissions = ROLE_PERMISSIONS[userRole] || [];
  return permissions.includes(permission);
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!hasPermission(req.user.role, permission)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = {
  authenticateToken,
  authorizeRoles,
  hasPermission,
  requirePermission,
  can: hasPermission,
  ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
};
