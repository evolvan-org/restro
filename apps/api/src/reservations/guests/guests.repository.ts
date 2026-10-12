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

  /**
   * Reuses the guest registered under this phone number or creates one, inside the caller's
   * transaction. Backed by the unique (restaurant_id, phone_number) index: the insert is
   * `ON CONFLICT DO NOTHING`, so a concurrent request creating the same guest can't produce a
   * duplicate row or abort this transaction; whichever row won is then read back.
   */
  async findOrCreate(
    tx: Prisma.TransactionClient,
    restaurantId: string,
    guestName: string,
    phoneNumber: string,
  ): Promise<GuestRecord> {
    const existing = await this.findByPhoneIn(tx, restaurantId, phoneNumber);
    if (existing) return existing;

    await tx.guest.createMany({
      data: [{ restaurantId, guestName, phoneNumber }],
      skipDuplicates: true,
    });
    return tx.guest.findUniqueOrThrow({
      where: { restaurantId_phoneNumber: { restaurantId, phoneNumber } },
      select: guestSelect,
    });
  }

  private findByPhoneIn(
    client: Prisma.TransactionClient | PrismaService,
    restaurantId: string,
    phoneNumber: string,
  ): Promise<GuestRecord | null> {
    return client.guest.findUnique({
      where: { restaurantId_phoneNumber: { restaurantId, phoneNumber } },
      select: guestSelect,
    });
  }
}
