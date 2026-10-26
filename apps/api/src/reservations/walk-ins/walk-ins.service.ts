import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import {
  ACTIVE_RESERVATION_STATUSES,
  type CreateWalkInRequest,
  type Reservation,
} from '@rms/api-contract';
import { getReservationOverlapWindow } from '@rms/shared';

import type { Actor } from '../../common/auth/authenticated-request';
import { toReservation } from '../reservations.mapper';
import { ReservationsRepository } from '../reservations.repository';

@Injectable()
export class WalkInsService {
  constructor(private readonly reservations: ReservationsRepository) {}

  async create(actor: Actor, input: CreateWalkInRequest): Promise<Reservation> {
    const created = await this.reservations.createWalkIn(
      actor.restaurantId,
      actor.userId,
      {
        guestName: input.guestName,
        phoneNumber: input.phoneNumber,
        partySize: input.partySize,
        notes: input.notes || null,
        reservationAt: new Date(),
        tableId: input.tableId,
      },
      async (context) => {
        const table = await context.findTable(input.tableId);
        if (!table || !table.isActive) {
          throw new BadRequestException({ message: ['tableId: Table not found or inactive'] });
        }
        if (input.partySize > table.capacity) {
          throw new BadRequestException({
            message: ['partySize: Party size exceeds the capacity of the selected table'],
          });
        }
        if (table.currentStatus.code !== 'AVAILABLE') {
          throw new ConflictException('This table is not available for a walk-in');
        }
        const now = new Date();
        const overlap = await context.findOverlap({
          tableId: input.tableId,
          statuses: [...ACTIVE_RESERVATION_STATUSES],
          ...getReservationOverlapWindow(now),
        });
        if (overlap) throw new ConflictException('This table is reserved within 90 minutes');
        return { captainUserId: table.captainUserId };
      },
    );
    return toReservation(created);
  }
}
