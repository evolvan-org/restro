/** Small string helpers with no external dependencies. */

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function isBlank(value: string | null | undefined): boolean {
  return value == null || value.trim().length === 0;
}
