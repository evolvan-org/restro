import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ACTIVE_RESERVATION_STATUSES,
  type AssignReservationTableRequest,
  type AssignReservationTableResponse,
  type CancelReservationRequest,
  type CreateReservationRequest,
  EDITABLE_RESERVATION_STATUSES,
  type Reservation,
  type ReservationListQuery,
  type ReservationListResponse,
  reservationStatusSchema,
  TERMINAL_RESERVATION_STATUSES,
  type UpdateReservationRequest,
} from '@rms/api-contract';
import { Prisma } from '@rms/db';
import {
  buildPageMeta,
  getReservationOverlapWindow,
  hasOverlap,
  RESERVATION_DURATION_MINUTES,
} from '@rms/shared';

import type { Actor } from '../common/auth/authenticated-request';
import { NotificationsService } from '../notifications/notifications.service';
import { toReservation } from './reservations.mapper';
import { ReservationsRepository, type ReservationTableContext } from './reservations.repository';

type TableAllocation = {
  tableId: string;
  partySize: number;
  reservationAt: Date;
  excludeId?: string;
};

@Injectable()
export class ReservationsService {
  constructor(
    private readonly repository: ReservationsRepository,
    private readonly notifications: NotificationsService,
  ) {}

  async assignTable(
    actor: Actor,
    id: string,
    input: AssignReservationTableRequest,
  ): Promise<AssignReservationTableResponse> {
    const updated = await this.repository.withLockedReservation(
      actor.restaurantId,
      id,
      async (context) => {
        const { reservation } = context;
        if (!ACTIVE_RESERVATION_STATUSES.includes(reservation.status)) {
          throw new ConflictException('Only booked or seated reservations can change tables');
        }

        if (input.tableId !== reservation.tableId && (await context.findActiveOrder())) {
          throw new ConflictException(
            'Complete the active order before changing or clearing its reservation table',
          );
        }

        let captainUserId = reservation.captainUserId;
        if (input.tableId !== null) {
          const table = await context.findTable(input.tableId);
          if (!table) throw new NotFoundException('Table not found');
          captainUserId = table.captainUserId;
          await this.assertTableAvailable(context, table, {
            tableId: input.tableId,
            partySize: reservation.partySize,
            reservationAt: reservation.reservationAt,
            excludeId: reservation.id,
          });
        }

        return context.update({ tableId: input.tableId, captainUserId });
      },
      input.tableId,
    );
    if (!updated) throw new NotFoundException('Reservation not found');
    return toReservation(updated);
  }

  async update(actor: Actor, id: string, input: UpdateReservationRequest): Promise<Reservation> {
    try {
      const updated = await this.repository.withLockedReservation(
        actor.restaurantId,
        id,
        async (context) => {
          const { reservation } = context;
          if (!EDITABLE_RESERVATION_STATUSES.includes(reservation.status)) {
            throw new ConflictException('Only booked or seated reservations can be modified');
          }

          if (reservation.status === 'SEATED' && input.reservationAt !== undefined) {
            throw new ConflictException('A seated reservation time cannot be changed');
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
            const table = await context.findTable(reservation.tableId);
            if (!table) {
              throw new BadRequestException({ message: ['tableId: Table not found or inactive'] });
            }
            await this.assertTableAvailable(context, table, {
              tableId: reservation.tableId,
              partySize,
              reservationAt,
              excludeId: reservation.id,
            });
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
    const result = await this.repository.cancel(
      actor.restaurantId,
      id,
      allowedStatuses,
      input.reason || null,
    );
    if (result.outcome === 'cancelled') return toReservation(result.reservation);
    if (result.outcome === 'not-found') throw new NotFoundException('Reservation not found');
    if (result.outcome === 'active-order') {
      throw new ConflictException(
        'Complete or cancel the active order before cancelling this reservation',
      );
    }
    throw new ConflictException('Cancelled or completed reservations cannot be cancelled');
  }

  async list(actor: Actor, query: ReservationListQuery): Promise<ReservationListResponse> {
    const { page, pageSize, status, tableId } = query;
    const { items, total } = await this.repository.findPage(actor.restaurantId, {
      status,
      tableId,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return {
      data: items.map(toReservation),
      meta: buildPageMeta(page, pageSize, total),
    };
  }

  async get(actor: Actor, id: string): Promise<Reservation> {
    const reservation = await this.repository.findById(actor.restaurantId, id);
    if (!reservation) throw new NotFoundException('Reservation not found');
    return toReservation(reservation);
  }

  async create(actor: Actor, input: CreateReservationRequest): Promise<Reservation> {
    const reservation = await this.repository.createBooking(
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
      async (context) => {
        if (!input.tableId) return { captainUserId: null };
        const table = await context.findTable(input.tableId);
        if (!table) {
          throw new BadRequestException({ message: ['tableId: Table not found or inactive'] });
        }
        await this.assertTableAvailable(context, table, {
          tableId: input.tableId,
          partySize: input.partySize,
          reservationAt: new Date(input.reservationAt),
        });
        return { captainUserId: table.captainUserId };
      },
    );

    const result = toReservation(reservation);
    await this.notifications.reservationCreated(actor.restaurantId, result);
    return result;
  }

  private async assertTableAvailable(
    context: ReservationTableContext,
    table: { capacity: number; isActive: boolean },
    allocation: TableAllocation,
  ): Promise<void> {
    if (!table.isActive) {
      throw new BadRequestException({ message: ['tableId: Table not found or inactive'] });
    }
    if (allocation.partySize > table.capacity) {
      throw new BadRequestException({
        message: ['partySize: Party size exceeds the capacity of the selected table'],
      });
    }

    const overlap = await context.findOverlap({
      tableId: allocation.tableId,
      statuses: [...ACTIVE_RESERVATION_STATUSES],
      ...getReservationOverlapWindow(allocation.reservationAt),
      excludeId: allocation.excludeId,
    });
    if (overlap && hasOverlap(allocation.reservationAt, overlap.reservationAt)) {
      throw new ConflictException(
        `This table is already reserved within ${RESERVATION_DURATION_MINUTES} minutes of the requested time`,
      );
    }
  }
}
