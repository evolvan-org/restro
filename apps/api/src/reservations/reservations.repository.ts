import { Injectable } from '@nestjs/common';
import { Prisma, ReservationStatus } from '@rms/db';

import { PrismaService } from '../common/database/prisma.service';

const guestSelect = {
  id: true,
  guestName: true,
  phoneNumber: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.GuestSelect;

const reservationSelect = {
  id: true,
  guestId: true,
  tableId: true,
  createdByUserId: true,
  reservationAt: true,
  partySize: true,
  status: true,
  notes: true,
  guest: {
    select: guestSelect,
  },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ReservationSelect;

export type GuestRecord = Prisma.GuestGetPayload<{ select: typeof guestSelect }>;
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

export type TableAvailability = 'OK' | 'TABLE_NOT_FOUND' | 'OVER_CAPACITY' | 'CONFLICT';

export type BookingResult =
  | { outcome: 'CREATED'; reservation: ReservationRecord }
  | { outcome: Exclude<TableAvailability, 'OK'> };

const ACTIVE_STATUSES = [ReservationStatus.BOOKED, ReservationStatus.SEATED];

@Injectable()
export class ReservationsRepository {
  constructor(private readonly prisma: PrismaService) {}

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

  findGuestByPhone(restaurantId: string, phoneNumber: string): Promise<GuestRecord | null> {
    return this.prisma.guest.findFirst({
      where: { restaurantId, phoneNumber },
      select: guestSelect,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  createWalkIn(
    restaurantId: string,
    createdByUserId: string,
    details: WalkInDetails,
  ): Promise<ReservationRecord> {
    return this.prisma.$transaction(async (tx) => {
      const existingGuest = await tx.guest.findFirst({
        where: { restaurantId, phoneNumber: details.phoneNumber },
        select: guestSelect,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });

      const guest =
        existingGuest ??
        (await tx.guest.create({
          data: {
            restaurantId,
            guestName: details.guestName,
            phoneNumber: details.phoneNumber,
          },
          select: guestSelect,
        }));

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
        const conflict = await tx.reservation.findFirst({
          where: {
            restaurantId,
            tableId: details.tableId,
            status: { in: ACTIVE_STATUSES },
            reservationAt: {
              gt: new Date(details.reservationAt.getTime() - windowMs),
              lt: new Date(details.reservationAt.getTime() + windowMs),
            },
          },
          select: { id: true },
        });
        if (conflict) return { outcome: 'CONFLICT' };
      }

      const existingGuest = await tx.guest.findFirst({
        where: { restaurantId, phoneNumber: details.phoneNumber },
        select: guestSelect,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      const guest =
        existingGuest ??
        (await tx.guest.create({
          data: { restaurantId, guestName: details.guestName, phoneNumber: details.phoneNumber },
          select: guestSelect,
        }));

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
