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

  // Reporting (revenue, GST, today's sales summary)
  REPORT_READ: 'report:read',

  // Identity & Access
  USER_READ: 'user:read',
  USER_WRITE: 'user:write',
  USER_DELETE: 'user:delete',

  // Role management (Settings → Roles)
  ROLE_READ: 'role:read',
  ROLE_WRITE: 'role:write',

  // Guided restaurant setup after signup (owner only)
  ONBOARDING_MANAGE: 'onboarding:manage',

  // Restaurant configuration
  /** See the floor: floor board, tables, sections and table statuses. */
  FLOOR_READ: 'floor:read',
  /** Open Restaurant settings and its tabs. */
  SETTINGS_READ: 'settings:read',
  RESTAURANT_WRITE: 'restaurant:write',
  TABLE_UPDATE_STATUS: 'table:update-status',
  /** Authority to set or clear a table's captain. */
  TABLE_ASSIGN_CAPTAIN: 'table:assign-captain',
  /** Eligibility to be a table's captain (not an authority; only the CAPTAIN role). */
  TABLE_BE_CAPTAIN: 'table:be-captain',

  // Menu
  MENU_READ: 'menu:read',
  MENU_WRITE: 'menu:write',

  // Daily operating checks. Existing roles receive these only through explicit role configuration.
  TASK_READ: 'task:read',
  TASK_MANAGE: 'task:manage',
  TASK_COMPLETE: 'task:complete',

  // Stock
  STOCK_READ: 'stock:read',
  INVENTORY_MANAGE: 'inventory:manage',

  // Reservations
  RESERVATION_READ: 'reservation:read',
  RESERVATION_WRITE: 'reservation:write',
  RESERVATION_ASSIGN_TABLE: 'reservation:assign-table',

  // Orders
  ORDER_READ: 'order:read',
  ORDER_WRITE: 'order:write',
  ORDER_UPDATE: 'order:update',
  ORDER_VOID_ITEM: 'order:void-item',

  // Kitchen order tickets
  KOT_READ: 'kot:read',
  KOT_WRITE: 'kot:write',
  KOT_UPDATE_STATUS: 'kot:update-status',

  // Billing
  BILL_READ: 'bill:read',
  BILL_WRITE: 'bill:write',
  BILL_GENERATE: 'bill:generate',
  BILL_UPDATE: 'bill:update',
  BILL_CANCEL: 'bill:cancel',
  BILL_DISCOUNT: 'bill:discount',

  // Payments
  PAYMENT_READ: 'payment:read',
  PAYMENT_WRITE: 'payment:write',

  // QR table ordering (guest orders that go through captain approval)
  /** See the QR orders queue (all guest orders are visible; notifications stay targeted). */
  QR_ORDER_READ: 'qr-order:read',
  /** Approve, edit, reject or acknowledge guest rounds on the tables you captain. */
  QR_ORDER_APPROVE: 'qr-order:approve',
  /** Act on any table: approve escalated rounds, assign/reassign captains, handle alerts. */
  QR_ORDER_MANAGE: 'qr-order:manage',
  /** QR ordering settings, the UPI QR image, table cards and token rotation. */
  QR_SETTINGS_WRITE: 'qr-settings:write',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

export const ALL_PERMISSIONS: readonly Permission[] = Object.values(Permission);
