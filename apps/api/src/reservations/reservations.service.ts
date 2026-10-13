import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ACTIVE_RESERVATION_STATUSES,
  type CancelReservationRequest,
  type CreateReservationRequest,
  EDITABLE_RESERVATION_STATUSES,
  type Reservation,
  RESERVATION_DURATION_MINUTES,
  type ReservationListQuery,
  type ReservationListResponse,
  reservationStatusSchema,
  TERMINAL_RESERVATION_STATUSES,
  type UpdateReservationRequest,
} from '@rms/api-contract';
import { Prisma } from '@rms/db';
import { buildPageMeta } from '@rms/shared';

import type { Actor } from '../common/auth/authenticated-request';
import { toReservation } from './reservations.mapper';
import { ReservationsRepository } from './reservations.repository';

@Injectable()
export class ReservationsService {
  constructor(private readonly repository: ReservationsRepository) {}

  async update(actor: Actor, id: string, input: UpdateReservationRequest): Promise<Reservation> {
    try {
      const updated = await this.repository.withLockedReservation(
        actor.restaurantId,
        id,
        async (context) => {
          const { reservation } = context;
          if (!EDITABLE_RESERVATION_STATUSES.includes(reservation.status)) {
            throw new ConflictException('Only booked reservations can be modified');
          }

          const reservationAt = input.reservationAt
            ? new Date(input.reservationAt)
            : reservation.reservationAt;
          const partySize = input.partySize ?? reservation.partySize;
          if (input.reservationAt !== undefined && reservationAt.getTime() <= Date.now()) {
            throw new BadRequestException({
              message: ['reservationAt: Reservation date and time must be in the future'],
            });
          }

          const changesSchedule =
            input.reservationAt !== undefined || input.partySize !== undefined;
          if (changesSchedule && reservation.tableId) {
            const table = await context.findTable();
            if (!table?.isActive) {
              throw new BadRequestException({ message: ['tableId: Table not found or inactive'] });
            }
            if (partySize > table.capacity) {
              throw new BadRequestException({
                message: ['partySize: Party size exceeds the capacity of the selected table'],
              });
            }

            const windowMs = RESERVATION_DURATION_MINUTES * 60_000;
            const overlap = await context.findOverlap({
              tableId: reservation.tableId,
              statuses: [...ACTIVE_RESERVATION_STATUSES],
              from: new Date(reservationAt.getTime() - windowMs),
              to: new Date(reservationAt.getTime() + windowMs),
              excludeId: reservation.id,
            });
            if (overlap) {
              throw new ConflictException(
                `This table is already reserved within ${RESERVATION_DURATION_MINUTES} minutes of the requested time`,
              );
            }
          }

          return context.update(
            {
              ...(input.reservationAt !== undefined && { reservationAt }),
              ...(input.partySize !== undefined && { partySize }),
              ...(input.notes !== undefined && { notes: input.notes || null }),
            },
            input.guest,
          );
        },
      );
      if (!updated) throw new NotFoundException('Reservation not found');
      return toReservation(updated);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(
          'Phone number already belongs to another guest in your restaurant',
        );
      }
      throw error;
    }
  }

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
