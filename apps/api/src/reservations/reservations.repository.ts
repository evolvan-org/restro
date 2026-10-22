import { Injectable } from '@nestjs/common';
import { Prisma, ReservationStatus } from '@rms/db';

import { PrismaService } from '../common/database/prisma.service';
import {
  reconcileTableStatus,
  setTableLifecycleStatus,
} from '../common/database/table-lifecycle';
import { guestSelect, GuestsRepository, type GuestUpdateDetails } from './guests/guests.repository';

const reservationSelect = {
  id: true,
  guestId: true,
  tableId: true,
  table: {
    select: {
      id: true,
      tableNumber: true,
      capacity: true,
      currentStatus: { select: { id: true, code: true, name: true } },
    },
  },
  createdByUserId: true,
  reservationAt: true,
  partySize: true,
  status: true,
  notes: true,
  cancellationReason: true,
  guest: {
    select: guestSelect,
  },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ReservationSelect;

export type ReservationRecord = Prisma.ReservationGetPayload<{ select: typeof reservationSelect }>;

export type ReservationPageFilters = {
  status?: ReservationStatus;
  skip: number;
  take: number;
};

export type WalkInDetails = {
  guestName: string;
  phoneNumber: string;
  partySize: number;
  notes: string | null;
  reservationAt: Date;
  tableId: string;
};

export type BookingDetails = Omit<WalkInDetails, 'tableId'> & { tableId: string | null };

export type ReservationUpdateDetails = {
  tableId?: string | null;
  reservationAt?: Date;
  partySize?: number;
  notes?: string | null;
};

export type ReservationOverlapFilters = {
  tableId: string;
  statuses: ReservationStatus[];
  from: Date;
  to: Date;
  excludeId?: string;
};

export type ReservationTableContext = {
  findTable: (tableId: string) => Promise<{
    capacity: number;
    isActive: boolean;
    currentStatus: { code: string };
  } | null>;
  findOverlap: (
    filters: ReservationOverlapFilters,
  ) => Promise<{ id: string; reservationAt: Date } | null>;
};

export type ReservationEditContext = ReservationTableContext & {
  reservation: ReservationRecord;
  update: (
    data: ReservationUpdateDetails,
    guest?: GuestUpdateDetails,
  ) => Promise<ReservationRecord>;
};

@Injectable()
export class ReservationsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guests: GuestsRepository,
  ) {}

  findById(restaurantId: string, id: string): Promise<ReservationRecord | null> {
    return this.prisma.reservation.findFirst({
      where: { id, restaurantId },
      select: reservationSelect,
    });
  }

  /** Keep reservation/table locks and every edit inside one tenant-scoped transaction. */
  withLockedReservation(
    restaurantId: string,
    id: string,
    edit: (context: ReservationEditContext) => Promise<ReservationRecord>,
    targetTableId?: string | null,
  ): Promise<ReservationRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM reservations WHERE id = ${id}::uuid AND restaurant_id = ${restaurantId}::uuid FOR UPDATE`;
      const reservation = await tx.reservation.findFirst({
        where: { id, restaurantId },
        select: reservationSelect,
      });
      if (!reservation) return null;

      // Stable ordering also serializes two parties swapping tables without a lock cycle.
      const tableIds = [reservation.tableId, targetTableId].filter(
        (tableId): tableId is string => typeof tableId === 'string',
      );
      for (const tableId of [...new Set(tableIds)].sort()) {
        await tx.$queryRaw`SELECT id FROM restaurant_tables WHERE id = ${tableId}::uuid AND restaurant_id = ${restaurantId}::uuid FOR UPDATE`;
      }

      return edit({
        reservation,
        ...this.tableContext(tx, restaurantId),
        update: async (data, guest) => {
          if (guest && Object.keys(guest).length > 0) {
            await this.guests.updateIn(tx, restaurantId, reservation.guestId, guest);
          }
          if (Object.keys(data).length > 0) {
            return tx.reservation.update({
              where: { id, restaurantId },
              data,
              select: reservationSelect,
            });
          }
          return tx.reservation.findFirstOrThrow({
            where: { id, restaurantId },
            select: reservationSelect,
          });
        },
      });
    });
  }

  private tableContext(
    tx: Prisma.TransactionClient,
    restaurantId: string,
  ): ReservationTableContext {
    return {
      findTable: (tableId) =>
        tx.restaurantTable.findFirst({
          where: { id: tableId, restaurantId },
          select: { capacity: true, isActive: true, currentStatus: { select: { code: true } } },
        }),
      findOverlap: (filters) => this.findOverlapIn(tx, restaurantId, filters),
    };
  }

  private findOverlapIn(
    tx: Prisma.TransactionClient,
    restaurantId: string,
    filters: ReservationOverlapFilters,
  ): Promise<{ id: string; reservationAt: Date } | null> {
    return tx.reservation.findFirst({
      where: {
        restaurantId,
        tableId: filters.tableId,
        status: { in: filters.statuses },
        ...(filters.excludeId && { id: { not: filters.excludeId } }),
        reservationAt: { gt: filters.from, lt: filters.to },
      },
      select: { id: true, reservationAt: true },
    });
  }

  cancel(
    restaurantId: string,
    id: string,
    allowedStatuses: ReservationStatus[],
    cancellationReason: string | null,
  ): Promise<
    | { outcome: 'cancelled'; reservation: ReservationRecord }
    | { outcome: 'active-order' | 'not-found' | 'terminal' }
  > {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM reservations WHERE id = ${id}::uuid AND restaurant_id = ${restaurantId}::uuid FOR UPDATE`;
      const existing = await tx.reservation.findFirst({
        where: { id, restaurantId },
        select: { id: true, tableId: true, status: true },
      });
      if (!existing) return { outcome: 'not-found' };
      if (!allowedStatuses.includes(existing.status)) return { outcome: 'terminal' };

      if (existing.tableId) {
        await tx.$queryRaw`SELECT id FROM restaurant_tables WHERE id = ${existing.tableId}::uuid AND restaurant_id = ${restaurantId}::uuid FOR UPDATE`;
      }

      const activeOrder = await tx.order.findFirst({
        where: {
          restaurantId,
          status: { in: ['OPEN', 'SUBMITTED'] },
          OR: [
            { reservationId: existing.id },
            ...(existing.tableId ? [{ tableId: existing.tableId }] : []),
          ],
        },
        select: { id: true },
      });
      if (activeOrder) return { outcome: 'active-order' };

      const reservation = await tx.reservation.update({
        where: { id, restaurantId },
        data: { status: 'CANCELLED', tableId: null, cancellationReason },
        select: reservationSelect,
      });
      if (existing.tableId) {
        await reconcileTableStatus(tx, restaurantId, existing.tableId);
      }
      return { outcome: 'cancelled', reservation };
    });
  }

  async findPage(
    restaurantId: string,
    filters: ReservationPageFilters,
  ): Promise<{ items: ReservationRecord[]; total: number }> {
    const where: Prisma.ReservationWhereInput = {
      restaurantId,
      ...(filters.status && { status: filters.status }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.reservation.findMany({
        where,
        select: reservationSelect,
        orderBy: [{ reservationAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
        skip: filters.skip,
        take: filters.take,
      }),
      this.prisma.reservation.count({ where }),
    ]);

    return { items, total };
  }

  createWalkIn(
    restaurantId: string,
    createdByUserId: string,
    details: WalkInDetails,
    validate: (context: ReservationTableContext) => Promise<void>,
  ): Promise<ReservationRecord> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM restaurant_tables WHERE id = ${details.tableId}::uuid AND restaurant_id = ${restaurantId}::uuid FOR UPDATE`;
      await validate(this.tableContext(tx, restaurantId));

      const guest = await this.guests.findOrCreate(
        tx,
        restaurantId,
        details.guestName,
        details.phoneNumber,
      );

      await setTableLifecycleStatus(tx, restaurantId, details.tableId, 'OCCUPIED');

      return tx.reservation.create({
        data: {
          restaurantId,
          guestId: guest.id,
          tableId: details.tableId,
          createdByUserId,
          reservationAt: details.reservationAt,
          partySize: details.partySize,
          status: ReservationStatus.SEATED,
          notes: details.notes,
        },
        select: reservationSelect,
      });
    });
  }

  /**
   * Books a future reservation. When a table is given, the table row is locked
   * for the duration of the transaction so concurrent bookings for it serialise
   * and the overlap check cannot be raced.
   */
  createBooking(
    restaurantId: string,
    createdByUserId: string,
    details: BookingDetails,
    validate: (context: ReservationTableContext) => Promise<void>,
  ): Promise<ReservationRecord> {
    return this.prisma.$transaction(async (tx) => {
      if (details.tableId) {
        await tx.$queryRaw`SELECT id FROM restaurant_tables WHERE id = ${details.tableId}::uuid AND restaurant_id = ${restaurantId}::uuid FOR UPDATE`;
      }

      await validate(this.tableContext(tx, restaurantId));

      const guest = await this.guests.findOrCreate(
        tx,
        restaurantId,
        details.guestName,
        details.phoneNumber,
      );

      return tx.reservation.create({
        data: {
          restaurantId,
          guestId: guest.id,
          tableId: details.tableId,
          createdByUserId,
          reservationAt: details.reservationAt,
          partySize: details.partySize,
          status: ReservationStatus.BOOKED,
          notes: details.notes,
        },
        select: reservationSelect,
      });
    });
  }
}
