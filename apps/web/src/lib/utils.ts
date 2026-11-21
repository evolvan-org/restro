export { cn } from 'cn';

/** Format stored role names for display, e.g. BAR_STAFF becomes Bar Staff. */
/** Default roles are stored as `KITCHEN_STAFF`; custom role names are shown exactly as typed. */
export function formatRoleLabel(role: string): string {
  if (role === 'OWNER') return 'Account Owner';
  if (!/^[A-Z][A-Z_]*$/.test(role)) return role;
  return role
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
