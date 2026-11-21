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

/** One-line summaries seeded onto the default roles (shown in Settings → Roles). */
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  OWNER: 'Has full access to everything. Cannot be changed.',
  MANAGER: 'Runs the restaurant day to day: menu, team, billing and reports.',
  CAPTAIN: 'Waiter: takes orders, generates bills and records payments.',
  RECEPTION: 'Front desk: reservations, seating, billing and payments.',
  KITCHEN_STAFF: 'Kitchen: sees orders and updates kitchen tickets.',
  BAR_STAFF: 'Bar: sees orders and updates bar tickets.',
};
