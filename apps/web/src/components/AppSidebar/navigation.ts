import { Permission } from '@rms/permissions';
import {
  CalendarCheck,
  ChefHat,
  ClipboardList,
  LayoutDashboard,
  type LucideIcon,
  Receipt,
  Rows3,
  Store,
  Users,
} from 'lucide-react';

export type NavItem = {
  label: string;
  icon: LucideIcon;
  /** Present when the module has a live page. Items without an `href` are not rendered yet. */
  href?: string;
  /** Shown only when the role holds this permission. Omit for items everyone can see. */
  permission?: Permission;
};

/**
 * Primary module navigation, in order of most to least commonly used. The full roadmap lives here;
 * an item appears in the sidebar only once it has an `href` (its page exists) and the role holds its
 * `permission`. Ship a module → give its item an `href`.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    label: 'Dashboard',
    icon: LayoutDashboard,
    href: '/dashboard',
    permission: Permission.DASHBOARD_READ,
  },
  { label: 'Staff', icon: Users, href: '/staff', permission: Permission.USER_READ },
  {
    label: 'Dining sections',
    icon: Store,
    href: '/dining-sections',
    permission: Permission.RESTAURANT_READ,
  },
  { label: 'Orders', icon: ClipboardList, permission: Permission.ORDER_READ },
  { label: 'Kitchen', icon: ChefHat, permission: Permission.KOT_READ },
  { label: 'Billing', icon: Receipt, permission: Permission.BILL_READ },
  { label: 'Reservations', icon: CalendarCheck, permission: Permission.RESERVATION_READ },
  {
    label: 'Table statuses',
    icon: Rows3,
    href: '/table-statuses',
    permission: Permission.RESTAURANT_READ,
  },
  {
    label: 'Restaurant',
    icon: Store,
    href: '/restaurant/settings',
    permission: Permission.RESTAURANT_READ,
  },
];
