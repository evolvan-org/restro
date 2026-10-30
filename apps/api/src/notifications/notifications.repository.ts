import { Injectable } from '@nestjs/common';
import type { NotificationListQuery } from '@rms/api-contract';
import { Prisma } from '@rms/db';

import type { Actor } from '../common/auth/authenticated-request';
import { PrismaService } from '../common/database/prisma.service';

const notificationSelect = {
  id: true,
  type: true,
  title: true,
  body: true,
  entity: true,
  entityId: true,
  tableId: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

export type NotificationRecord = Prisma.NotificationGetPayload<{
  select: typeof notificationSelect;
}>;
export type NewNotification = Pick<
  Prisma.NotificationCreateManyInput,
  'type' | 'title' | 'body' | 'entity' | 'entityId' | 'tableId'
>;

const ticketSelect = {
  id: true,
  kotNumber: true,
  destination: true,
  orderId: true,
  order: {
    select: {
      tableId: true,
      table: { select: { tableNumber: true } },
      reservation: { select: { captainUserId: true } },
    },
  },
} satisfies Prisma.KotSelect;
type NotificationTicket = Prisma.KotGetPayload<{ select: typeof ticketSelect }>;

@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    actor: Actor,
    query: NotificationListQuery,
  ): Promise<{
    data: NotificationRecord[];
    total: number;
    unreadCount: number;
  }> {
    const where = { restaurantId: actor.restaurantId, recipientUserId: actor.userId };
    const [data, total, unreadCount] = await this.prisma.$transaction(
      [
        this.prisma.notification.findMany({
          where,
          select: notificationSelect,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.prisma.notification.count({ where }),
        this.prisma.notification.count({ where: { ...where, readAt: null } }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return { data, total, unreadCount };
  }

  async markRead(actor: Actor, id?: string): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: {
        restaurantId: actor.restaurantId,
        recipientUserId: actor.userId,
        ...(id && { id }),
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    return result.count;
  }

  findOwned(actor: Actor, id: string): Promise<NotificationRecord | null> {
    return this.prisma.notification.findFirst({
      where: { id, restaurantId: actor.restaurantId, recipientUserId: actor.userId },
      select: notificationSelect,
    });
  }

  findActiveUsers(restaurantId: string): Promise<{ id: string; role: { name: string } }[]> {
    return this.prisma.user.findMany({
      where: { restaurantId, status: 'ACTIVE' },
      select: { id: true, role: { select: { name: true } } },
    });
  }

  async createForUsers(
    restaurantId: string,
    userIds: string[],
    payload: NewNotification,
  ): Promise<void> {
    await this.prisma.notification.createMany({
      data: userIds.map((recipientUserId) => ({ ...payload, restaurantId, recipientUserId })),
    });
  }

  findTicket(restaurantId: string, id: string): Promise<NotificationTicket | null> {
    return this.prisma.kot.findFirst({
      where: { id, restaurantId },
      select: ticketSelect,
    });
  }
}
