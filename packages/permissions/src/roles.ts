/** System roles. Ordered loosely from most to least privileged. */
export const Role = {
  OWNER: 'OWNER',
  MANAGER: 'MANAGER',
  CAPTAIN: 'CAPTAIN',
  RECEPTION: 'RECEPTION',
  KITCHEN_STAFF: 'KITCHEN_STAFF',
  BAR_STAFF: 'BAR_STAFF',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export const ALL_ROLES: readonly Role[] = Object.values(Role);

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ALL_ROLES as readonly string[]).includes(value);
}
