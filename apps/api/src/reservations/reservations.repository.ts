import { Injectable } from '@nestjs/common';
import { ACTIVE_RESERVATION_STATUSES } from '@rms/api-contract';
import { Prisma, ReservationStatus } from '@rms/db';

import { PrismaService } from '../common/database/prisma.service';
import { guestSelect, GuestsRepository, type GuestUpdateDetails } from './guests/guests.repository';

const reservationSelect = {
  id: true,
  guestId: true,
  tableId: true,
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
};

export type BookingDetails = WalkInDetails & { tableId: string | null };

export type ReservationTransition = {
  status: ReservationStatus;
  tableId: string | null;
  cancellationReason: string | null;
};

export type TableAvailability = 'OK' | 'TABLE_NOT_FOUND' | 'OVER_CAPACITY' | 'CONFLICT';

export type BookingResult =
  | { outcome: 'CREATED'; reservation: ReservationRecord }
  | { outcome: Exclude<TableAvailability, 'OK'> };

export type ReservationUpdateDetails = {
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

export type ReservationEditContext = {
  reservation: ReservationRecord;
  findTable: () => Promise<{ capacity: number; isActive: boolean } | null>;
  findOverlap: (filters: ReservationOverlapFilters) => Promise<{ id: string } | null>;
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
  ): Promise<ReservationRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM reservations WHERE id = ${id}::uuid AND restaurant_id = ${restaurantId}::uuid FOR UPDATE`;
      const reservation = await tx.reservation.findFirst({
        where: { id, restaurantId },
        select: reservationSelect,
      });
      if (!reservation) return null;

      if (reservation.tableId) {
        await tx.$queryRaw`SELECT id FROM restaurant_tables WHERE id = ${reservation.tableId}::uuid AND restaurant_id = ${restaurantId}::uuid FOR UPDATE`;
      }

      return edit({
        reservation,
        findTable: () =>
          reservation.tableId
            ? tx.restaurantTable.findFirst({
                where: { id: reservation.tableId, restaurantId },
                select: { capacity: true, isActive: true },
              })
            : Promise.resolve(null),
        findOverlap: (filters) => this.findOverlapIn(tx, restaurantId, filters),
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

  private findOverlapIn(
    tx: Prisma.TransactionClient,
    restaurantId: string,
    filters: ReservationOverlapFilters,
  ): Promise<{ id: string } | null> {
    return tx.reservation.findFirst({
      where: {
        restaurantId,
        tableId: filters.tableId,
        status: { in: filters.statuses },
        ...(filters.excludeId && { id: { not: filters.excludeId } }),
        reservationAt: { gt: filters.from, lt: filters.to },
      },
      select: { id: true },
    });
  }

  /** Update only eligible rows, returning the same transaction's resource snapshot. */
  updateForStatuses(
    restaurantId: string,
    id: string,
    allowedStatuses: ReservationStatus[],
    data: ReservationTransition,
  ): Promise<ReservationRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.reservation.updateMany({
        where: { id, restaurantId, status: { in: allowedStatuses } },
        data,
      });
      if (updated.count === 0) return null;

      return tx.reservation.findFirst({
        where: { id, restaurantId },
        select: reservationSelect,
      });
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
  ): Promise<ReservationRecord> {
    return this.prisma.$transaction(async (tx) => {
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
    durationMinutes: number,
  ): Promise<BookingResult> {
    return this.prisma.$transaction(async (tx) => {
      if (details.tableId) {
        await tx.$queryRaw`SELECT id FROM restaurant_tables WHERE id = ${details.tableId}::uuid AND restaurant_id = ${restaurantId}::uuid FOR UPDATE`;

        const table = await tx.restaurantTable.findFirst({
          where: { id: details.tableId, restaurantId, isActive: true },
          select: { capacity: true },
        });
        if (!table) return { outcome: 'TABLE_NOT_FOUND' };
        if (details.partySize > table.capacity) return { outcome: 'OVER_CAPACITY' };

        const windowMs = durationMinutes * 60_000;
        const conflict = await this.findOverlapIn(tx, restaurantId, {
          tableId: details.tableId,
          statuses: [...ACTIVE_RESERVATION_STATUSES],
          from: new Date(details.reservationAt.getTime() - windowMs),
          to: new Date(details.reservationAt.getTime() + windowMs),
        });
        if (conflict) return { outcome: 'CONFLICT' };
      }

      const guest = await this.guests.findOrCreate(
        tx,
        restaurantId,
        details.guestName,
        details.phoneNumber,
      );

      const reservation = await tx.reservation.create({
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
      return { outcome: 'CREATED', reservation };
    });
  }
}
