/** Stable React keys for draft rows; saved with the row so they survive reloads. */
export function newKey(): string {
  return crypto.randomUUID();
}
