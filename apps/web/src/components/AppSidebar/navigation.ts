import { Permission } from '@rms/permissions';
import {
  Box,
  CalendarCheck,
  ClipboardList,
  LayoutDashboard,
  LayoutGrid,
  type LucideIcon,
  MessageSquare,
  QrCode,
  Receipt,
  Soup,
} from 'lucide-react';

export type NavItem = {
  label: string;
  icon: LucideIcon;
  /** Present when the module has a live page. Items without an `href` are not rendered yet. */
  href?: string;
  /** Additional routes that belong to this navigation item. */
  activePaths?: readonly string[];
  /** Shown only when the role holds this permission. Omit for items everyone can see. */
  permission?: Permission;
  /**
   * A count badge: `missing-recipes` from the setup checklist (owners and managers);
   * `qr-waiting` = guest QR orders awaiting the viewer's approval (live).
   */
  badge?: 'missing-recipes' | 'qr-waiting';
};

export type NavGroup = {
  label?: string;
  items: readonly NavItem[];
};

/**
 * Primary navigation grouped by domain ("SERVICE" and "MANAGE").
 * An item appears only when its module has an `href` and the role holds its `permission`.
 */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    items: [
      {
        label: 'Dashboard',
        icon: LayoutDashboard,
        href: '/dashboard',
        permission: Permission.DASHBOARD_READ,
      },
    ],
  },
  {
    label: 'SERVICE',
    items: [
      {
        label: 'Orders',
        icon: ClipboardList,
        href: '/orders',
        permission: Permission.ORDER_READ,
      },
      {
        label: 'QR orders',
        icon: QrCode,
        href: '/qr-orders',
        permission: Permission.QR_ORDER_READ,
        badge: 'qr-waiting',
      },
      {
        label: 'Reservations',
        icon: CalendarCheck,
        href: '/reservations',
        permission: Permission.RESERVATION_READ,
      },
      {
        label: 'Billing',
        icon: Receipt,
        href: '/billing',
        permission: Permission.BILL_READ,
      },
    ],
  },
  {
    label: 'MANAGE',
    items: [
      {
        label: 'Operating checks',
        icon: ClipboardList,
        href: '/operating-tasks',
        permission: Permission.TASK_READ,
      },
      {
        label: 'Menu items',
        icon: Soup,
        href: '/menu/items',
        activePaths: ['/menu'],
        permission: Permission.MENU_READ,
        badge: 'missing-recipes',
      },
      {
        label: 'Guest feedback',
        icon: MessageSquare,
        href: '/guest-feedback',
        permission: Permission.QR_SETTINGS_WRITE,
      },
      {
        label: 'Inventory',
        icon: Box,
        href: '/inventory',
        permission: Permission.INVENTORY_MANAGE,
      },
    ],
  },
];

/** Flat list of all navigation items across all groups. */
export const NAV_ITEMS: readonly NavItem[] = NAV_GROUPS.flatMap((group) => group.items);
