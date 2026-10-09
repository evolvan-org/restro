import type { Reservation } from '@rms/api-contract';

import { toGuest } from '../guests/guests.mapper';
import type { ReservationRecord } from './reservations.repository';

export function toReservation(record: ReservationRecord): Reservation {
  return {
    id: record.id,
    guestId: record.guestId,
    tableId: record.tableId,
    createdByUserId: record.createdByUserId,
    reservationAt: record.reservationAt.toISOString(),
    partySize: record.partySize,
    status: record.status,
    notes: record.notes,
    guest: toGuest(record.guest),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
