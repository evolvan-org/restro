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
}
