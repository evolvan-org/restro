import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type CancelReservationRequest,
  type CreateReservationRequest,
  type Reservation,
  RESERVATION_DURATION_MINUTES,
  type ReservationListQuery,
  type ReservationListResponse,
  reservationStatusSchema,
  TERMINAL_RESERVATION_STATUSES,
} from '@rms/api-contract';
import { buildPageMeta } from '@rms/shared';

import type { Actor } from '../common/auth/authenticated-request';
import { toReservation } from './reservations.mapper';
import { ReservationsRepository } from './reservations.repository';

@Injectable()
export class ReservationsService {
  constructor(private readonly repository: ReservationsRepository) {}

  async cancel(actor: Actor, id: string, input: CancelReservationRequest): Promise<Reservation> {
    const allowedStatuses = reservationStatusSchema.options.filter(
      (status) => !TERMINAL_RESERVATION_STATUSES.includes(status),
    );
    const reservation = await this.repository.updateForStatuses(
      actor.restaurantId,
      id,
      allowedStatuses,
      { status: 'CANCELLED', tableId: null, cancellationReason: input.reason || null },
    );
    if (reservation) return toReservation(reservation);

    const existing = await this.repository.findById(actor.restaurantId, id);
    if (!existing) throw new NotFoundException('Reservation not found');

    throw new ConflictException('Cancelled or completed reservations cannot be cancelled');
  }

  async list(actor: Actor, query: ReservationListQuery): Promise<ReservationListResponse> {
    const { page, pageSize, status } = query;
    const { items, total } = await this.repository.findPage(actor.restaurantId, {
      status,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return {
      data: items.map(toReservation),
      meta: buildPageMeta(page, pageSize, total),
    };
  }

  async create(actor: Actor, input: CreateReservationRequest): Promise<Reservation> {
    const result = await this.repository.createBooking(
      actor.restaurantId,
      actor.userId,
      {
        guestName: input.guestName,
        phoneNumber: input.phoneNumber,
        partySize: input.partySize,
        notes: input.notes || null,
        reservationAt: new Date(input.reservationAt),
        tableId: input.tableId ?? null,
      },
      RESERVATION_DURATION_MINUTES,
    );

    switch (result.outcome) {
      case 'CREATED':
        return toReservation(result.reservation);
      case 'TABLE_NOT_FOUND':
        throw new BadRequestException({ message: ['tableId: Table not found or inactive'] });
      case 'OVER_CAPACITY':
        throw new BadRequestException({
          message: ['partySize: Party size exceeds the capacity of the selected table'],
        });
      case 'CONFLICT':
        throw new ConflictException(
          `This table is already reserved within ${RESERVATION_DURATION_MINUTES} minutes of the requested time`,
        );
    }
  }
}
