import { Permission } from '@rms/permissions';

type PermissionItem = { permission: Permission; label: string; eligibility?: boolean };
type PermissionGroup = { label: string; items: readonly PermissionItem[] };

/**
 * Rows of the roles matrix, grouped by area. `user:delete`, `onboarding:manage` and `bill:write`
 * are deliberately absent: the first two are Account Owner only and the last is not a separate
 * capability in the UI (`bill:update` is "Edit bill"). Keys not listed here are kept untouched
 * when a role is saved.
 */
export const PERMISSION_GROUPS: readonly PermissionGroup[] = [
  {
    label: 'Dashboard & reports',
    items: [
      { permission: Permission.DASHBOARD_READ, label: 'View dashboard' },
      { permission: Permission.REPORT_READ, label: 'View sales and GST reports' },
    ],
  },
  {
    label: 'Floor',
    items: [
      { permission: Permission.FLOOR_READ, label: 'View floor and tables' },
      { permission: Permission.TABLE_UPDATE_STATUS, label: 'Update table status' },
      { permission: Permission.TABLE_ASSIGN_CAPTAIN, label: 'Assign a captain to tables' },
      {
        permission: Permission.TABLE_BE_CAPTAIN,
        label: 'Can be assigned as table captain',
        eligibility: true,
      },
    ],
  },
  {
    label: 'Reservations',
    items: [
      { permission: Permission.RESERVATION_READ, label: 'View reservations' },
      { permission: Permission.RESERVATION_WRITE, label: 'Create and edit reservations' },
      { permission: Permission.RESERVATION_ASSIGN_TABLE, label: 'Seat guests at a table' },
    ],
  },
  {
    label: 'Orders',
    items: [
      { permission: Permission.ORDER_READ, label: 'View orders' },
      { permission: Permission.ORDER_WRITE, label: 'Place orders' },
      { permission: Permission.ORDER_UPDATE, label: 'Change orders' },
    ],
  },
  {
    label: 'QR ordering',
    items: [
      { permission: Permission.QR_ORDER_READ, label: 'View guest QR orders' },
      { permission: Permission.QR_ORDER_APPROVE, label: 'Approve or reject orders on own tables' },
      {
        permission: Permission.QR_ORDER_MANAGE,
        label: 'Handle escalations and reassign captains',
      },
      { permission: Permission.QR_SETTINGS_WRITE, label: 'Edit QR ordering settings and cards' },
    ],
  },
  {
    label: 'Kitchen & bar (KOT)',
    items: [
      { permission: Permission.KOT_READ, label: 'View kitchen tickets' },
      { permission: Permission.KOT_WRITE, label: 'Create kitchen tickets' },
      { permission: Permission.KOT_UPDATE_STATUS, label: 'Update ticket status' },
    ],
  },
  {
    label: 'Billing',
    items: [
      { permission: Permission.BILL_READ, label: 'View bills' },
      { permission: Permission.BILL_GENERATE, label: 'Generate bill' },
      { permission: Permission.BILL_UPDATE, label: 'Edit bill' },
      { permission: Permission.BILL_DISCOUNT, label: 'Apply discount' },
      { permission: Permission.BILL_CANCEL, label: 'Cancel bill' },
    ],
  },
  {
    label: 'Payments',
    items: [
      { permission: Permission.PAYMENT_READ, label: 'View payments' },
      { permission: Permission.PAYMENT_WRITE, label: 'Record payments' },
    ],
  },
  {
    label: 'Menu',
    items: [
      { permission: Permission.MENU_READ, label: 'View menu' },
      { permission: Permission.MENU_WRITE, label: 'Edit menu' },
    ],
  },
  {
    label: 'Stock & inventory',
    items: [
      { permission: Permission.STOCK_READ, label: 'View stock' },
      { permission: Permission.INVENTORY_MANAGE, label: 'Manage inventory' },
    ],
  },
  {
    label: 'Team & roles',
    items: [
      { permission: Permission.USER_READ, label: 'View team' },
      { permission: Permission.USER_WRITE, label: 'Add and edit team members' },
      { permission: Permission.ROLE_READ, label: 'View roles' },
      { permission: Permission.ROLE_WRITE, label: 'Manage roles' },
    ],
  },
  {
    label: 'Restaurant settings',
    items: [
      { permission: Permission.SETTINGS_READ, label: 'Open restaurant settings' },
      { permission: Permission.RESTAURANT_WRITE, label: 'Edit restaurant settings' },
    ],
  },
];

export const MATRIX_KEYS: readonly Permission[] = PERMISSION_GROUPS.flatMap((g) =>
  g.items.map((i) => i.permission),
);

const LABELS: Record<string, string> = Object.fromEntries(
  PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => [i.permission, i.label])),
);
const GROUP_OF: Record<string, string> = Object.fromEntries(
  PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => [i.permission, g.label])),
);

export function permissionLabel(key: string): string {
  return LABELS[key] ?? key;
}

export function permissionGroupLabel(key: string): string {
  return GROUP_OF[key] ?? 'Other';
}
