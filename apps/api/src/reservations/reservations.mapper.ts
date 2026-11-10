import type { Reservation } from '@rms/api-contract';
import { Permission, roleHasPermission } from '@rms/permissions';

import type { Actor } from '../common/auth/authenticated-request';
import { toGuest } from './guests/guests.mapper';
import type { ReservationRecord } from './reservations.repository';

export function toReservation(record: ReservationRecord, actor: Actor): Reservation {
  return {
    id: record.id,
    billSummary: roleHasPermission(actor.role, Permission.BILL_READ)
      ? (record.orders[0]?.bill ?? null)
      : null,
    guestId: record.guestId,
    tableId: record.tableId,
    captainUserId: record.captainUserId,
    table: record.table,
    createdByUserId: record.createdByUserId,
    reservationAt: record.reservationAt.toISOString(),
    partySize: record.partySize,
    status: record.status,
    notes: record.notes,
    cancellationReason: record.cancellationReason,
    guest: toGuest(record.guest),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
