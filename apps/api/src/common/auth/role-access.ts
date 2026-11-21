import type { Prisma } from '@rms/db';
import { ALL_PERMISSIONS, ELIGIBILITY_ONLY_PERMISSIONS, type Permission } from '@rms/permissions';

/** Selects what is needed to decide a role's access: the Owner flag and its granted keys. */
export const roleAccessSelect = {
  name: true,
  isOwner: true,
  permissions: { select: { permissionKey: true } },
} satisfies Prisma.RoleSelect;

export type RoleAccess = {
  name: string;
  isOwner: boolean;
  permissions: readonly { permissionKey: string }[];
};

/** The permissions the role effectively holds. Owners bypass everything except eligibility markers. */
export function effectivePermissions(role: RoleAccess): Permission[] {
  if (role.isOwner) {
    return ALL_PERMISSIONS.filter((p) => !ELIGIBILITY_ONLY_PERMISSIONS.includes(p));
  }
  const granted = new Set(role.permissions.map((p) => p.permissionKey));
  return ALL_PERMISSIONS.filter((p) => granted.has(p));
}

/**
 * Owners pass every check via the flag, so newly added permissions apply with no migration.
 * Eligibility markers (e.g. `table:be-captain`) always come from real rows so Owners are not
 * offered duties they do not hold.
 */
export function roleCan(role: RoleAccess, permission: Permission): boolean {
  if (ELIGIBILITY_ONLY_PERMISSIONS.includes(permission)) {
    return role.permissions.some((p) => p.permissionKey === permission);
  }
  return role.isOwner || role.permissions.some((p) => p.permissionKey === permission);
}

export function roleCanAll(role: RoleAccess, required: readonly Permission[]): boolean {
  return required.every((p) => roleCan(role, p));
}
