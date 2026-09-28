export const ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  STAFF: 'staff',
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
};

const BASELINE = [PERMISSIONS.PROFILE_READ, PERMISSIONS.PROFILE_UPDATE];

export const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: [
    ...[
      PERMISSIONS.MAINTENANCE_READ,
      PERMISSIONS.MAINTENANCE_WRITE,
      PERMISSIONS.MAINTENANCE_DELETE,
      PERMISSIONS.SERVICE_READ,
      PERMISSIONS.SERVICE_WRITE,
      PERMISSIONS.SERVICE_DELETE,
      PERMISSIONS.INCIDENT_READ,
      PERMISSIONS.INCIDENT_WRITE,
      PERMISSIONS.INCIDENT_DELETE,
      PERMISSIONS.ASSET_READ,
      PERMISSIONS.ASSET_WRITE,
      PERMISSIONS.ASSET_DELETE,
      PERMISSIONS.ANALYTICS_READ,
      PERMISSIONS.USER_READ,
      PERMISSIONS.USER_WRITE,
      PERMISSIONS.USER_DELETE,
    ],
    ...BASELINE,
  ],
  [ROLES.MANAGER]: [
    PERMISSIONS.MAINTENANCE_READ,
    PERMISSIONS.MAINTENANCE_WRITE,
    PERMISSIONS.SERVICE_READ,
    PERMISSIONS.SERVICE_WRITE,
    PERMISSIONS.INCIDENT_READ,
    PERMISSIONS.INCIDENT_WRITE,
    PERMISSIONS.ASSET_READ,
    PERMISSIONS.ASSET_WRITE,
    PERMISSIONS.ANALYTICS_READ,
    ...BASELINE,
  ],
  // Technicians work a job from the calendar and close it out on site, so they
  // need service records. They cannot create or cancel schedules, and the asset
  // register stays read-only because it is a council-wide inventory.
  [ROLES.STAFF]: [
    PERMISSIONS.MAINTENANCE_READ,
    PERMISSIONS.SERVICE_READ,
    PERMISSIONS.SERVICE_WRITE,
    PERMISSIONS.ASSET_READ,
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
