const jwt = require('jsonwebtoken');
require('dotenv').config();

const ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  DEVELOPER: 'developer',
  USER: 'user',
};

const PERMISSIONS = {
  MAINTENANCE_READ: 'maintenance:read',
  MAINTENANCE_WRITE: 'maintenance:write',
  MAINTENANCE_DELETE: 'maintenance:delete',
  SERVICE_READ: 'service:read',
  SERVICE_WRITE: 'service:write',
  SERVICE_DELETE: 'service:delete',
  // Creating an incident and updating one are deliberately separate. Only the
  // `user` role reports issues; the IT roles respond to and close them.
  INCIDENT_CREATE: 'incident:create',
  INCIDENT_READ: 'incident:read',
  INCIDENT_WRITE: 'incident:write',
  INCIDENT_DELETE: 'incident:delete',
  COMMENT_WRITE: 'comment:write',
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
  FAQ_READ: 'faq:read',
};

const BASELINE = [PERMISSIONS.PROFILE_READ, PERMISSIONS.PROFILE_UPDATE, PERMISSIONS.FAQ_READ];

// Everyone signed in can follow an issue and read what was rated.
const ALL_ROLES = [
  PERMISSIONS.INCIDENT_READ,
  PERMISSIONS.RATING_READ,
  PERMISSIONS.MAINTENANCE_READ,
  PERMISSIONS.SERVICE_READ,
  PERMISSIONS.ASSET_READ,
];

// Admins run the queue: they see incoming requests, respond to them, set
// maintenance schedules and close them out. They do not report their own
// issues and they do not rate the work - that is the requester's job. User
// accounts are not part of this role either; that belongs to developer.
const ADMIN_PERMISSIONS = [
  PERMISSIONS.INCIDENT_WRITE, PERMISSIONS.INCIDENT_DELETE,
  PERMISSIONS.COMMENT_WRITE,
  PERMISSIONS.MAINTENANCE_WRITE, PERMISSIONS.MAINTENANCE_DELETE,
  PERMISSIONS.SERVICE_WRITE, PERMISSIONS.SERVICE_DELETE,
  PERMISSIONS.ASSET_WRITE, PERMISSIONS.ASSET_DELETE,
  PERMISSIONS.ANALYTICS_READ,
  ...ALL_ROLES,
  ...BASELINE,
];

// Managers plan and schedule and read every statistic and report the system
// holds, but they do not work the queue: they neither respond to incoming
// requests nor post in the discussion thread. They also do not destroy
// records, manage accounts, report their own issues, or rate work.
const MANAGER_PERMISSIONS = [
  PERMISSIONS.MAINTENANCE_WRITE,
  PERMISSIONS.SERVICE_WRITE,
  PERMISSIONS.ASSET_WRITE,
  PERMISSIONS.ANALYTICS_READ,
  ...ALL_ROLES,
  ...BASELINE,
];

// Developers own the user accounts (admin, manager, developer, user), work
// the incident queue alongside the admin, and read the statistics and data the
// system collects. They cannot create or cancel schedules, report issues, rate
// fixes, or edit the asset register, which is a council-wide inventory.
const DEVELOPER_PERMISSIONS = [
  PERMISSIONS.USER_READ, PERMISSIONS.USER_WRITE, PERMISSIONS.USER_DELETE,
  PERMISSIONS.INCIDENT_WRITE,
  PERMISSIONS.COMMENT_WRITE,
  PERMISSIONS.SERVICE_WRITE,
  PERMISSIONS.ANALYTICS_READ,
  ...ALL_ROLES,
  ...BASELINE,
];

// Regular users are the requesters: they report issues, follow progress, read
// the replies the IT team leaves, and rate the fix once it is done. The thread
// is read-only for them - only the admin and developer post in it.
//
// Their view is deliberately narrow. They get the incident queue as *their own*
// history (via /incidents/mine), the help articles, and their own profile. The
// maintenance schedules, asset registry and service records belong to the staff
// who work the queue, so those read permissions are withheld here: without them
// the navigation shows nothing but report / history / help, which is all a
// requester asked for.
const USER_PERMISSIONS = [
  PERMISSIONS.INCIDENT_CREATE,
  PERMISSIONS.INCIDENT_READ,
  PERMISSIONS.RATING_READ,
  PERMISSIONS.RATING_WRITE,
  ...BASELINE,
];

const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: ADMIN_PERMISSIONS,
  [ROLES.MANAGER]: MANAGER_PERMISSIONS,
  [ROLES.DEVELOPER]: DEVELOPER_PERMISSIONS,
  [ROLES.USER]: USER_PERMISSIONS,
};

// Roles that were renamed in place. A token minted before the rename still
// carries the old value, and the database still holds it until the migration
// runs. Resolving the alias keeps those sessions working instead of silently
// matching an empty permission set and 403-ing every route.
const LEGACY_ROLE_ALIASES = {
  staff: ROLES.DEVELOPER,
};

function normalizeRole(role) {
  if (!role) return null;
  return LEGACY_ROLE_ALIASES[role] || role;
}

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
    // Resolve renamed roles once, here, so `req.user.role` is always a role the
    // permission map knows. This is what makes /auth/me hand the client a
    // current role to match its own permission checks against.
    req.user = { ...user, role: normalizeRole(user.role) };
    next();
  });
}

function authorizeRoles(...allowedRoles) {
  const allowed = allowedRoles.map(normalizeRole);
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!allowed.includes(normalizeRole(req.user.role))) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

function hasPermission(userRole, permission) {
  const permissions = ROLE_PERMISSIONS[normalizeRole(userRole)] || [];
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
  normalizeRole,
  ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
};