import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  type MarkNotificationsReadResponse,
  type NotificationListQuery,
  type NotificationListResponse,
  notificationSchema,
  type Reservation,
} from '@rms/api-contract';
import { isRole, Permission, roleHasPermission } from '@rms/permissions';
import { buildPageMeta } from '@rms/shared';

import type { Actor } from '../common/auth/authenticated-request';
import { NotificationPublisher } from './notification-publisher.service';
import { type NewNotification, NotificationsRepository } from './notifications.repository';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly repository: NotificationsRepository,
    private readonly publisher: NotificationPublisher,
  ) {}

  async list(actor: Actor, query: NotificationListQuery): Promise<NotificationListResponse> {
    const { data, total, unreadCount } = await this.repository.list(actor, query);
    return {
      data: data.map((item) =>
        notificationSchema.parse({
          ...item,
          readAt: item.readAt?.toISOString() ?? null,
          createdAt: item.createdAt.toISOString(),
        }),
      ),
      meta: buildPageMeta(query.page, query.pageSize, total),
      unreadCount,
    };
  }

  async markRead(actor: Actor, id?: string): Promise<MarkNotificationsReadResponse> {
    if (id && !(await this.repository.findOwned(actor, id))) {
      throw new NotFoundException('Notification not found');
    }
    const count = await this.repository.markRead(actor, id);
    if (count > 0) {
      await this.publisher.publish(actor.restaurantId, [actor.userId], { kind: 'read' });
    }
    return { ok: true };
  }

  async ticketSent(restaurantId: string, ticketIds: string[]): Promise<void> {
    await this.bestEffort(async () => {
      for (const id of ticketIds) {
        const ticket = await this.repository.findTicket(restaurantId, id);
        if (!ticket) continue;
        await this.notify(restaurantId, Permission.KOT_UPDATE_STATUS, {
          type: 'kot.sent',
          title: 'New order',
          body: `${ticket.destination === 'KITCHEN' ? 'Kitchen' : 'Bar'} ticket ${ticket.kotNumber} — Table ${ticket.order.table.tableNumber}`,
          entity: 'order',
          entityId: ticket.orderId,
          tableId: ticket.order.tableId,
        });
      }
    });
  }

  async ticketReady(restaurantId: string, ticketId: string): Promise<void> {
    await this.bestEffort(async () => {
      const ticket = await this.repository.findTicket(restaurantId, ticketId);
      const captainId = ticket?.order.reservation?.captainUserId;
      if (!ticket || !captainId) return;
      await this.notify(
        restaurantId,
        Permission.ORDER_READ,
        {
          type: 'kot.ready',
          title: 'Order ready',
          body: `Ticket ${ticket.kotNumber} — Table ${ticket.order.table.tableNumber} is ready to serve`,
          entity: 'order',
          entityId: ticket.orderId,
          tableId: ticket.order.tableId,
        },
        captainId,
      );
    });
  }

  async reservationCreated(restaurantId: string, reservation: Reservation): Promise<void> {
    await this.bestEffort(() =>
      this.notify(restaurantId, Permission.RESERVATION_WRITE, {
        type: 'reservation.created',
        title: 'New reservation',
        body: `${reservation.guest.guestName} — party of ${reservation.partySize}, ${reservation.reservationAt}`,
        entity: 'reservation',
        entityId: reservation.id,
        tableId: reservation.tableId,
      }),
    );
  }

  private async notify(
    restaurantId: string,
    permission: Permission,
    payload: NewNotification,
    recipientId?: string,
  ): Promise<void> {
    const users = await this.repository.findActiveUsers(restaurantId);
    const ids = users
      .filter(
        (user) =>
          (!recipientId || user.id === recipientId) &&
          isRole(user.role.name) &&
          roleHasPermission(user.role.name, permission),
      )
      .map((user) => user.id);
    if (ids.length === 0) return;
    await this.repository.createForUsers(restaurantId, ids, payload);
    await this.publisher.publish(restaurantId, ids, { kind: 'created' });
  }

  private async bestEffort(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch {
      this.logger.warn('Notification creation failed after a committed operation');
    }
  }
}
