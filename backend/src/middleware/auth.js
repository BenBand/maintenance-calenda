const jwt = require('jsonwebtoken');
require('dotenv').config();

const ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  DEVELOPER: 'developer',
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
  RATING_READ: 'rating:read',
  RATING_WRITE: 'rating:write',
};

const BASELINE = [PERMISSIONS.PROFILE_READ, PERMISSIONS.PROFILE_UPDATE];

// Every role is a system user, so every role can report an issue, follow its
// progress, and rate the work once it is done.
const ALL_ROLES = [
  PERMISSIONS.INCIDENT_READ, PERMISSIONS.INCIDENT_WRITE,
  PERMISSIONS.RATING_READ, PERMISSIONS.RATING_WRITE,
  PERMISSIONS.MAINTENANCE_READ,
  PERMISSIONS.SERVICE_READ,
  PERMISSIONS.ASSET_READ,
];

// Admins run the queue: they see incoming requests, respond to them, set
// maintenance schedules and close them out. User accounts are not part of
// that job - that belongs to the developer role.
const ADMIN_PERMISSIONS = [
  PERMISSIONS.INCIDENT_DELETE,
  PERMISSIONS.MAINTENANCE_WRITE, PERMISSIONS.MAINTENANCE_DELETE,
  PERMISSIONS.SERVICE_WRITE, PERMISSIONS.SERVICE_DELETE,
  PERMISSIONS.ASSET_WRITE, PERMISSIONS.ASSET_DELETE,
  PERMISSIONS.ANALYTICS_READ,
  ...ALL_ROLES,
  ...BASELINE,
];

// Managers plan and schedule, and read every statistic and report the system
// holds, but they do not destroy records or manage accounts.
const MANAGER_PERMISSIONS = [
  PERMISSIONS.MAINTENANCE_WRITE,
  PERMISSIONS.SERVICE_WRITE,
  PERMISSIONS.ASSET_WRITE,
  PERMISSIONS.ANALYTICS_READ,
  ...ALL_ROLES,
  ...BASELINE,
];

// Developers own the user accounts (admin, manager or developer) and read the
// statistics and data the system collects. They cannot create or cancel
// schedules, and the asset register stays read-only because it is a
// council-wide inventory.
const DEVELOPER_PERMISSIONS = [
  PERMISSIONS.USER_READ, PERMISSIONS.USER_WRITE, PERMISSIONS.USER_DELETE,
  PERMISSIONS.ANALYTICS_READ,
  ...ALL_ROLES,
  ...BASELINE,
];

const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: ADMIN_PERMISSIONS,
  [ROLES.MANAGER]: MANAGER_PERMISSIONS,
  [ROLES.DEVELOPER]: DEVELOPER_PERMISSIONS,
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