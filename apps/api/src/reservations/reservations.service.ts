import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ACTIVE_RESERVATION_STATUSES,
  type AssignReservationCaptainRequest,
  type AssignReservationCaptainResponse,
  type AssignReservationTableRequest,
  type AssignReservationTableResponse,
  type CancelReservationRequest,
  type CaptainOptionsResponse,
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
import { isRole, Permission, roleHasPermission } from '@rms/permissions';
import {
  buildPageMeta,
  getReservationOverlapWindow,
  hasOverlap,
  RESERVATION_DURATION_MINUTES,
} from '@rms/shared';

import type { Actor } from '../common/auth/authenticated-request';
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
  constructor(private readonly repository: ReservationsRepository) {}

  async assignCaptain(
    actor: Actor,
    id: string,
    input: AssignReservationCaptainRequest,
  ): Promise<AssignReservationCaptainResponse> {
    const updated = await this.repository.withLockedReservation(
      actor.restaurantId,
      id,
      async (context) => {
        const { reservation } = context;
        if (!ACTIVE_RESERVATION_STATUSES.includes(reservation.status)) {
          throw new ConflictException('Only booked or seated reservations can change captains');
        }

        if (input.captainUserId !== null) {
          // Tenant-scoped lookup: a user from another restaurant is indistinguishable from a missing one.
          const user = await context.findCaptainCandidate(input.captainUserId);
          if (!user) throw new NotFoundException('Captain not found');
          if (user.status !== 'ACTIVE') {
            throw new BadRequestException({ message: ['captainUserId: User is not active'] });
          }
          if (!isEligibleCaptainRole(user.role.name)) {
            throw new BadRequestException({
              message: ['captainUserId: User is not eligible to be a captain'],
            });
          }
        }

        return context.update({ captainUserId: input.captainUserId });
      },
    );
    if (!updated) throw new NotFoundException('Reservation not found');
    return toReservation(updated);
  }

  async listCaptains(actor: Actor): Promise<CaptainOptionsResponse> {
    const users = await this.repository.listActiveUsers(actor.restaurantId);
    return users
      .filter((user) => isEligibleCaptainRole(user.role.name))
      .map((user) => ({ id: user.id, name: user.name, role: user.role.name }));
  }

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

        if (input.tableId !== null) {
          const table = await context.findTable(input.tableId);
          if (!table) throw new NotFoundException('Table not found');
          await this.assertTableAvailable(context, table, {
            tableId: input.tableId,
            partySize: reservation.partySize,
            reservationAt: reservation.reservationAt,
            excludeId: reservation.id,
          });
        }

        return context.update({ tableId: input.tableId });
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
        if (!input.tableId) return;
        const table = await context.findTable(input.tableId);
        if (!table) {
          throw new BadRequestException({ message: ['tableId: Table not found or inactive'] });
        }
        await this.assertTableAvailable(context, table, {
          tableId: input.tableId,
          partySize: input.partySize,
          reservationAt: new Date(input.reservationAt),
        });
      },
    );

    return toReservation(reservation);
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

function isEligibleCaptainRole(roleName: string): boolean {
  return isRole(roleName) && roleHasPermission(roleName, Permission.RESERVATION_BE_CAPTAIN);
}
