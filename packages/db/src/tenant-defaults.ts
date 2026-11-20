/**
 * Reference rows every restaurant must have. Signup provisioning, the onboarding finish and the dev
 * seeds all read these, so a tenant is never missing what the floor and billing code depends on.
 */

/** Lifecycle statuses the table/bill code addresses by code. Renamable, never removable. */
export const SYSTEM_TABLE_STATUSES = [
  { code: 'AVAILABLE', name: 'Available' },
  { code: 'RESERVED', name: 'Reserved' },
  { code: 'OCCUPIED', name: 'Occupied' },
  { code: 'NEEDS_CLEANING', name: 'Cleaning' },
] as const;

export type SystemTableStatusCode = (typeof SYSTEM_TABLE_STATUSES)[number]['code'];

export const BILL_CANCELLATION_REASONS = [
  { code: 'GUEST_REQUEST', name: 'Guest request' },
  { code: 'DUPLICATE_BILL', name: 'Duplicate bill' },
  { code: 'BILLING_ERROR', name: 'Billing error' },
  { code: 'ORDER_CHANGED', name: 'Order changed' },
  { code: 'OTHER', name: 'Other' },
] as const;
