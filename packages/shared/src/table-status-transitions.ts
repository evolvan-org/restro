export const TABLE_STATUS_CODES = ['AVAILABLE', 'RESERVED', 'OCCUPIED', 'NEEDS_CLEANING'] as const;

export type TableStatusCode = (typeof TABLE_STATUS_CODES)[number];

export const TABLE_STATUS_TRANSITIONS: Readonly<
  Record<TableStatusCode, readonly TableStatusCode[]>
> = {
  AVAILABLE: ['RESERVED', 'OCCUPIED'],
  RESERVED: ['OCCUPIED', 'AVAILABLE'],
  OCCUPIED: ['NEEDS_CLEANING'],
  NEEDS_CLEANING: ['AVAILABLE'],
};

export function isTableStatusCode(code: string): code is TableStatusCode {
  return TABLE_STATUS_CODES.some((statusCode) => statusCode === code);
}

export function isTableStatusTransitionAllowed(from: string, to: string): boolean {
  return isTableStatusCode(from) && TABLE_STATUS_TRANSITIONS[from].some((target) => target === to);
}
