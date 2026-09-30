export const ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  DEVELOPER: 'developer',
  USER: 'user',
};

export const PERMISSIONS = {
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
  PERMISSIONS.INCIDENT_READ,
  PERMISSIONS.INCIDENT_WRITE,
  PERMISSIONS.RATING_READ,
  PERMISSIONS.RATING_WRITE,
  PERMISSIONS.MAINTENANCE_READ,
  PERMISSIONS.SERVICE_READ,
  PERMISSIONS.ASSET_READ,
];

// Developers own the user accounts (admin, manager, developer, user) and read the
// statistics and data the system collects.
export const ROLE_PERMISSIONS = {
  // Admins run the queue: they see incoming requests, respond to them, set
  // maintenance schedules and close them out. User accounts are not part of
  // that job - that belongs to the developer role.
  [ROLES.ADMIN]: [
    PERMISSIONS.INCIDENT_DELETE,
    PERMISSIONS.MAINTENANCE_WRITE,
    PERMISSIONS.MAINTENANCE_DELETE,
    PERMISSIONS.SERVICE_WRITE,
    PERMISSIONS.SERVICE_DELETE,
    PERMISSIONS.ASSET_WRITE,
    PERMISSIONS.ASSET_DELETE,
    PERMISSIONS.ANALYTICS_READ,
    ...ALL_ROLES,
    ...BASELINE,
  ],
  // Managers plan and schedule, and read every statistic and report the system
  // holds, but they do not destroy records or manage accounts.
  [ROLES.MANAGER]: [
    PERMISSIONS.MAINTENANCE_WRITE,
    PERMISSIONS.SERVICE_WRITE,
    PERMISSIONS.ASSET_WRITE,
    PERMISSIONS.ANALYTICS_READ,
    ...ALL_ROLES,
    ...BASELINE,
  ],
  // Developers own the user accounts (admin, manager, developer, user) and read the
  // statistics and data the system collects.
  [ROLES.DEVELOPER]: [
    PERMISSIONS.USER_READ,
    PERMISSIONS.USER_WRITE,
    PERMISSIONS.USER_DELETE,
    PERMISSIONS.ANALYTICS_READ,
    ...ALL_ROLES,
    ...BASELINE,
  ],
  // Regular users can report issues, track progress, and rate fixes.
  [ROLES.USER]: [
    ...ALL_ROLES,
    ...BASELINE,
  ],
};

export function hasPermission(role, permission) {
  const permissions = ROLE_PERMISSIONS[role];
  if (!permissions) return false;
  return permissions.includes(permission);
}

export function can(role, permission) {
  return hasPermission(role, permission);
}

export function isManagerOrAbove(role) {
  return role === ROLES.ADMIN || role === ROLES.MANAGER;
}