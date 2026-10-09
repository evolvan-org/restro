import { Injectable } from '@nestjs/common';
import { Prisma } from '@rms/db';

import { PrismaService } from '../../common/database/prisma.service';

export const guestSelect = {
  id: true,
  guestName: true,
  phoneNumber: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.GuestSelect;

export type GuestRecord = Prisma.GuestGetPayload<{ select: typeof guestSelect }>;

@Injectable()
export class GuestsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByPhone(restaurantId: string, phoneNumber: string): Promise<GuestRecord | null> {
    return this.findByPhoneIn(this.prisma, restaurantId, phoneNumber);
  }

  /** Reuses the guest registered under this phone number or creates one, inside the caller's transaction. */
  async findOrCreate(
    tx: Prisma.TransactionClient,
    restaurantId: string,
    guestName: string,
    phoneNumber: string,
  ): Promise<GuestRecord> {
    const existing = await this.findByPhoneIn(tx, restaurantId, phoneNumber);
    return (
      existing ??
      tx.guest.create({
        data: { restaurantId, guestName, phoneNumber },
        select: guestSelect,
      })
    );
  }

  private findByPhoneIn(
    client: Prisma.TransactionClient | PrismaService,
    restaurantId: string,
    phoneNumber: string,
  ): Promise<GuestRecord | null> {
    return client.guest.findFirst({
      where: { restaurantId, phoneNumber },
      select: guestSelect,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }
}
