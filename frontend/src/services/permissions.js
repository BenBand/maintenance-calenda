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
};

const BASELINE = [PERMISSIONS.PROFILE_READ, PERMISSIONS.PROFILE_UPDATE];

// Everyone signed in can follow an issue and read what was rated.
const ALL_ROLES = [
  PERMISSIONS.INCIDENT_READ,
  PERMISSIONS.RATING_READ,
  PERMISSIONS.MAINTENANCE_READ,
  PERMISSIONS.SERVICE_READ,
  PERMISSIONS.ASSET_READ,
];

export const ROLE_PERMISSIONS = {
  // Admins run the queue: they see incoming requests, respond to them, set
  // maintenance schedules and close them out. They do not report their own
  // issues, do not rate work, and do not manage accounts.
  [ROLES.ADMIN]: [
    PERMISSIONS.INCIDENT_WRITE,
    PERMISSIONS.INCIDENT_DELETE,
    PERMISSIONS.COMMENT_WRITE,
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
  // Managers plan and schedule and read every statistic and report, but they
  // do not work the queue: no responses, no thread posts. They also do not
  // destroy records, manage accounts, report issues, or rate work.
  [ROLES.MANAGER]: [
    PERMISSIONS.MAINTENANCE_WRITE,
    PERMISSIONS.SERVICE_WRITE,
    PERMISSIONS.ASSET_WRITE,
    PERMISSIONS.ANALYTICS_READ,
    ...ALL_ROLES,
    ...BASELINE,
  ],
  // Developers own the user accounts (admin, manager, developer, user), work
  // the incident queue alongside the admin, and read the statistics and data
  // the system collects.
  [ROLES.DEVELOPER]: [
    PERMISSIONS.USER_READ,
    PERMISSIONS.USER_WRITE,
    PERMISSIONS.USER_DELETE,
    PERMISSIONS.INCIDENT_WRITE,
    PERMISSIONS.COMMENT_WRITE,
    PERMISSIONS.SERVICE_WRITE,
    PERMISSIONS.ANALYTICS_READ,
    ...ALL_ROLES,
    ...BASELINE,
  ],
  // Regular users are the requesters: they report issues, follow progress, read
  // the replies the IT team leaves, and rate the fix once it is done. The
  // thread is read-only for them - only admin and developer post in it.
  [ROLES.USER]: [
    PERMISSIONS.INCIDENT_CREATE,
    PERMISSIONS.RATING_WRITE,
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