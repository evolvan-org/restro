import { Permission } from './permissions';
import { Role } from './roles';

/**
 * Role → permission mapping. This is the authoritative policy consulted by
 * the API's authorization guard and mirrored by the web app for UI gating.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  [Role.ADMIN]: [
    Permission.USER_READ,
    Permission.USER_WRITE,
    Permission.USER_DELETE,
    Permission.RESTAURANT_READ,
    Permission.RESTAURANT_WRITE,
  ],
  // Owners (ADMIN) and managers manage staff accounts (REST-14); staff can't see other accounts.
  [Role.MANAGER]: [
    Permission.USER_READ,
    Permission.USER_WRITE,
    Permission.RESTAURANT_READ,
    Permission.RESTAURANT_WRITE,
  ],
  [Role.STAFF]: [Permission.RESTAURANT_READ],
  [Role.CUSTOMER]: [],
};

/** Returns true if the given role is granted the given permission. */
export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** Returns true if the role satisfies every required permission. */
export function roleHasAll(role: Role, required: readonly Permission[]): boolean {
  return required.every((p) => roleHasPermission(role, p));
}
