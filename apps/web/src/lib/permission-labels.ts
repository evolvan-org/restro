import { Permission } from '@rms/permissions';

type PermissionGroup = {
  label: string;
  items: readonly { permission: Permission; label: string }[];
};

/** Human labels for the role editor, grouped by area. Typed so a new key can't be forgotten. */
export const PERMISSION_GROUPS: readonly PermissionGroup[] = [
  {
    label: 'Overview',
    items: [
      { permission: Permission.DASHBOARD_READ, label: 'View the dashboard' },
      { permission: Permission.REPORT_READ, label: 'View sales and GST reports' },
    ],
  },
  {
    label: 'Floor & tables',
    items: [
      { permission: Permission.FLOOR_READ, label: 'View the floor board, tables and sections' },
      { permission: Permission.TABLE_UPDATE_STATUS, label: 'Change table status' },
      { permission: Permission.TABLE_ASSIGN_CAPTAIN, label: 'Assign table captains' },
      { permission: Permission.TABLE_BE_CAPTAIN, label: 'Can be assigned as a table captain' },
    ],
  },
  {
    label: 'Menu & stock',
    items: [
      { permission: Permission.MENU_READ, label: 'View the menu' },
      { permission: Permission.MENU_WRITE, label: 'Edit the menu' },
      { permission: Permission.STOCK_READ, label: 'View stock' },
      { permission: Permission.INVENTORY_MANAGE, label: 'Manage inventory' },
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
    label: 'Orders & kitchen',
    items: [
      { permission: Permission.ORDER_READ, label: 'View orders' },
      { permission: Permission.ORDER_WRITE, label: 'Place orders' },
      { permission: Permission.ORDER_UPDATE, label: 'Change orders' },
      { permission: Permission.KOT_READ, label: 'View kitchen tickets' },
      { permission: Permission.KOT_WRITE, label: 'Create kitchen tickets' },
      { permission: Permission.KOT_UPDATE_STATUS, label: 'Update kitchen ticket status' },
    ],
  },
  {
    label: 'Billing & payments',
    items: [
      { permission: Permission.BILL_READ, label: 'View bills' },
      { permission: Permission.BILL_WRITE, label: 'Edit bills' },
      { permission: Permission.BILL_GENERATE, label: 'Generate bills' },
      { permission: Permission.BILL_UPDATE, label: 'Update bills' },
      { permission: Permission.BILL_DISCOUNT, label: 'Apply discounts' },
      { permission: Permission.BILL_CANCEL, label: 'Cancel bills' },
      { permission: Permission.PAYMENT_READ, label: 'View payments' },
      { permission: Permission.PAYMENT_WRITE, label: 'Record payments' },
    ],
  },
  {
    label: 'Team & roles',
    items: [
      { permission: Permission.USER_READ, label: 'View team members' },
      { permission: Permission.USER_WRITE, label: 'Add and edit team members' },
      { permission: Permission.USER_DELETE, label: 'Delete team members' },
      { permission: Permission.ROLE_READ, label: 'View roles' },
      { permission: Permission.ROLE_WRITE, label: 'Create and edit roles' },
    ],
  },
  {
    label: 'Restaurant settings',
    items: [
      { permission: Permission.SETTINGS_READ, label: 'Open restaurant settings' },
      { permission: Permission.RESTAURANT_WRITE, label: 'Edit restaurant settings' },
      { permission: Permission.ONBOARDING_MANAGE, label: 'Manage guided setup' },
    ],
  },
];

const LABELS: Record<string, string> = Object.fromEntries(
  PERMISSION_GROUPS.flatMap((group) => group.items.map((i) => [i.permission, i.label])),
);

export function permissionLabel(key: string): string {
  return LABELS[key] ?? key;
}
