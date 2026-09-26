import { ALL_PERMISSIONS, Permission } from './permissions';
import { Role } from './roles';

/**
 * Role → permission mapping. This is the authoritative policy consulted by
 * the API's authorization guard and mirrored by the web app for UI gating.
 *
 * OWNER holds every permission. MANAGER holds everything except `user:delete`,
 * which keeps MANAGER a superset of every other non-owner role — so the staff
 * escalation check (`canAssignRole`) lets a manager assign any of them.
 *
 * Every role must include `dashboard:read` so it can reach the landing page; a
 * role without it would be redirected to /forbidden on login.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  [Role.OWNER]: [...ALL_PERMISSIONS],
  [Role.MANAGER]: ALL_PERMISSIONS.filter((permission) => permission !== Permission.USER_DELETE),
  [Role.CAPTAIN]: [
    Permission.DASHBOARD_READ,
    Permission.RESTAURANT_READ,
    Permission.RESERVATION_READ,
    Permission.RESERVATION_WRITE,
    Permission.ORDER_READ,
    Permission.ORDER_WRITE,
    Permission.KOT_READ,
    Permission.BILL_READ,
  ],
  [Role.KITCHEN_STAFF]: [
    Permission.DASHBOARD_READ,
    Permission.ORDER_READ,
    Permission.KOT_READ,
    Permission.KOT_WRITE,
  ],
  [Role.BAR_STAFF]: [
    Permission.DASHBOARD_READ,
    Permission.ORDER_READ,
    Permission.KOT_READ,
    Permission.KOT_WRITE,
  ],
  [Role.CASHIER]: [
    Permission.DASHBOARD_READ,
    Permission.RESTAURANT_READ,
    Permission.ORDER_READ,
    Permission.BILL_READ,
    Permission.BILL_WRITE,
    Permission.PAYMENT_READ,
    Permission.PAYMENT_WRITE,
  ],
};

/** Returns true if the given role is granted the given permission. */
export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** Returns true if the role satisfies every required permission. */
export function roleHasAll(role: Role, required: readonly Permission[]): boolean {
  return required.every((p) => roleHasPermission(role, p));
}

/** Returns true if the role satisfies at least one of the required permissions. */
export function roleHasAny(role: Role, required: readonly Permission[]): boolean {
  return required.some((p) => roleHasPermission(role, p));
}
