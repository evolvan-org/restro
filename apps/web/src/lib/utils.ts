export { cn } from 'cn';

/** Format stored role names for display, e.g. BAR_STAFF becomes Bar Staff. */
export function formatRoleLabel(role: string): string {
  return role
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
