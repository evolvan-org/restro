import { Injectable } from '@nestjs/common';

import { PrismaService } from '../common/database/prisma.service';

@Injectable()
export class PushRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(
    restaurantId: string,
    userId: string,
    input: { endpoint: string; keys: { p256dh: string; auth: string } },
  ): Promise<void> {
    const data = { restaurantId, userId, p256dh: input.keys.p256dh, auth: input.keys.auth };
    // An endpoint belongs to one browser; re-subscribing on a shared device moves it to the caller.
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: { ...data, endpoint: input.endpoint },
      update: data,
    });
  }

  async delete(restaurantId: string, userId: string, endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({ where: { restaurantId, userId, endpoint } });
  }

  async deleteById(id: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({ where: { id } });
  }

  findForUsers(
    restaurantId: string,
    userIds: string[],
  ): Promise<{ id: string; endpoint: string; p256dh: string; auth: string }[]> {
    return this.prisma.pushSubscription.findMany({
      where: { restaurantId, userId: { in: userIds } },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
  }
}
