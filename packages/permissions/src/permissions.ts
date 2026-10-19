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
  TABLE_UPDATE_STATUS: 'table:update-status',
  /** Authority to set or clear a table's captain. */
  TABLE_ASSIGN_CAPTAIN: 'table:assign-captain',
  /** Eligibility to be a table's captain (not an authority; only the CAPTAIN role). */
  TABLE_BE_CAPTAIN: 'table:be-captain',

  // Menu
  MENU_READ: 'menu:read',
  MENU_WRITE: 'menu:write',

  // Stock
  STOCK_READ: 'stock:read',

  // Reservations
  RESERVATION_READ: 'reservation:read',
  RESERVATION_WRITE: 'reservation:write',
  RESERVATION_ASSIGN_TABLE: 'reservation:assign-table',

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
