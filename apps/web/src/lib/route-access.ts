import { Permission } from '@rms/permissions';

type RouteRule = {
  /** Matches the path itself and everything beneath it. */
  path: string;
  /** The user needs at least one of these (OR semantics). */
  permissions: readonly Permission[];
};

/**
 * Permission required to open each protected route — the single source of truth for route-level
 * access. The most specific (longest) matching `path` wins. Routes not listed here (profile,
 * change-password, onboarding, forbidden) are open to every signed-in user.
 * UI gating only; the API remains the source of enforcement.
 */
export const ROUTE_RULES: readonly RouteRule[] = [
  { path: '/dashboard', permissions: [Permission.DASHBOARD_READ] },
  { path: '/orders', permissions: [Permission.ORDER_READ] },
  { path: '/reservations', permissions: [Permission.RESERVATION_READ] },
  { path: '/qr-orders', permissions: [Permission.QR_ORDER_READ] },
  { path: '/qr-orders/alerts', permissions: [Permission.QR_ORDER_MANAGE] },
  { path: '/billing', permissions: [Permission.BILL_READ] },
  { path: '/menu', permissions: [Permission.MENU_READ] },
  { path: '/inventory', permissions: [Permission.INVENTORY_MANAGE] },
  { path: '/kitchen', permissions: [Permission.KOT_READ] },
  { path: '/bar', permissions: [Permission.KOT_READ] },
  { path: '/staff', permissions: [Permission.USER_READ] },
  { path: '/tables', permissions: [Permission.SETTINGS_READ] },
  { path: '/dining-sections', permissions: [Permission.SETTINGS_READ] },
  { path: '/table-statuses', permissions: [Permission.SETTINGS_READ] },
  {
    path: '/restaurant/settings',
    permissions: [Permission.SETTINGS_READ, Permission.USER_READ, Permission.ROLE_READ],
  },
  { path: '/restaurant/settings/general', permissions: [Permission.SETTINGS_READ] },
  { path: '/restaurant/settings/team', permissions: [Permission.USER_READ] },
  { path: '/restaurant/settings/roles', permissions: [Permission.ROLE_READ] },
  { path: '/restaurant/settings/dining-sections', permissions: [Permission.SETTINGS_READ] },
  { path: '/restaurant/settings/tables', permissions: [Permission.SETTINGS_READ] },
  { path: '/restaurant/settings/table-statuses', permissions: [Permission.SETTINGS_READ] },
  { path: '/restaurant/settings/menu-categories', permissions: [Permission.MENU_READ] },
  { path: '/restaurant/settings/tax-discounts', permissions: [Permission.SETTINGS_READ] },
  { path: '/restaurant/settings/cancellation-reasons', permissions: [Permission.SETTINGS_READ] },
  { path: '/restaurant/settings/qr-ordering', permissions: [Permission.SETTINGS_READ] },
];

/** Permissions required for `pathname`, or `null` when the route is open to any signed-in user. */
export function getRoutePermissions(pathname: string): readonly Permission[] | null {
  let best: RouteRule | null = null;
  for (const rule of ROUTE_RULES) {
    const matches = pathname === rule.path || pathname.startsWith(`${rule.path}/`);
    if (matches && (!best || rule.path.length > best.path.length)) best = rule;
  }
  return best ? best.permissions : null;
}
