const jwt = require('jsonwebtoken');
require('dotenv').config();

const ROLES = {
  ADMIN: 'admin',
};

const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: ['maintenance:read', 'maintenance:write', 'maintenance:delete', 'service:read', 'service:write', 'service:delete', 'incident:read', 'incident:write', 'incident:delete', 'profile:read', 'profile:update'],
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
      if (user?.type && user.type !== 'access') {
        return res.status(403).json({ error: 'Invalid token type' });
      }
      return res.status(403).json({ error: 'Invalid token' });
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
  ROLES,
  ROLE_PERMISSIONS,
};
