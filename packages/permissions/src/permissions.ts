/**
 * Fine-grained permissions expressed as `resource:action`.
 * Add new permissions here as sprints introduce new domains
 * (reservations, orders, billing, ...).
 */
export const Permission = {
  // Identity & Access (Sprint 1)
  USER_READ: 'user:read',
  USER_WRITE: 'user:write',
  USER_DELETE: 'user:delete',

  // Restaurant configuration (Sprint 2)
  RESTAURANT_READ: 'restaurant:read',
  RESTAURANT_WRITE: 'restaurant:write',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

export const ALL_PERMISSIONS: readonly Permission[] = Object.values(Permission);
