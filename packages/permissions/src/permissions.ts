/**
 * Fine-grained permissions expressed as `resource:action`.
 * Add new permissions here as sprints introduce new domains.
 *
 * Only `user:*`, `restaurant:*` and `dashboard:read` back modules that exist
 * today; the operational domains below (reservations, orders, KOT, billing,
 * payments) are defined and seeded ahead of their modules so the role matrix
 * is the single source of truth and enforcement is ready when they land.
 */
export const Permission = {
  // App shell
  DASHBOARD_READ: 'dashboard:read',

  // Identity & Access
  USER_READ: 'user:read',
  USER_WRITE: 'user:write',
  USER_DELETE: 'user:delete',

  // Restaurant configuration
  RESTAURANT_READ: 'restaurant:read',
  RESTAURANT_WRITE: 'restaurant:write',

  // Reservations
  RESERVATION_READ: 'reservation:read',
  RESERVATION_WRITE: 'reservation:write',

  // Orders
  ORDER_READ: 'order:read',
  ORDER_WRITE: 'order:write',

  // Kitchen order tickets
  KOT_READ: 'kot:read',
  KOT_WRITE: 'kot:write',

  // Billing
  BILL_READ: 'bill:read',
  BILL_WRITE: 'bill:write',

  // Payments
  PAYMENT_READ: 'payment:read',
  PAYMENT_WRITE: 'payment:write',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

export const ALL_PERMISSIONS: readonly Permission[] = Object.values(Permission);
