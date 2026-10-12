import { Injectable } from '@nestjs/common';
import type { CreateWalkInRequest, Reservation } from '@rms/api-contract';

import type { Actor } from '../../common/auth/authenticated-request';
import { toReservation } from '../reservations/reservations.mapper';
import { ReservationsRepository } from '../reservations/reservations.repository';

@Injectable()
export class WalkInsService {
  constructor(private readonly reservations: ReservationsRepository) {}

  async create(actor: Actor, input: CreateWalkInRequest): Promise<Reservation> {
    const created = await this.reservations.createWalkIn(actor.restaurantId, actor.userId, {
      guestName: input.guestName,
      phoneNumber: input.phoneNumber,
      partySize: input.partySize,
      notes: input.notes || null,
      reservationAt: new Date(),
    });
    return toReservation(created);
  }
}
