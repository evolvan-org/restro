import { Permission } from '@rms/permissions';
import {
  Box,
  CalendarCheck,
  ChefHat,
  ClipboardList,
  LayoutDashboard,
  LayoutGrid,
  type LucideIcon,
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
};

export type NavGroup = {
  label: string;
  items: readonly NavItem[];
};

/**
 * Primary navigation grouped by domain ("SERVICE" and "MANAGE").
 * An item appears only when its module has an `href` and the role holds its `permission`.
 */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: 'SERVICE',
    items: [
      {
        label: 'Dashboard',
        icon: LayoutDashboard,
        href: '/dashboard',
        permission: Permission.DASHBOARD_READ,
      },
      {
        label: 'Floor',
        icon: LayoutGrid,
        href: '/floor',
        permission: Permission.DASHBOARD_READ,
      },
      {
        label: 'Orders',
        icon: ClipboardList,
        href: '/orders',
        permission: Permission.ORDER_READ,
      },
      {
        label: 'Kitchen display',
        icon: ChefHat,
        href: '/kitchen',
        activePaths: ['/bar'],
        permission: Permission.KOT_READ,
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
        label: 'Menu items',
        icon: Soup,
        href: '/menu/items',
        activePaths: ['/menu'],
        permission: Permission.MENU_READ,
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
