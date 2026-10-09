import type { Guest } from '@rms/api-contract';

import type { GuestRecord } from './guests.repository';

export function toGuest(record: GuestRecord): Guest {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
