import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  type MarkNotificationsReadResponse,
  type NotificationListQuery,
  type NotificationListResponse,
  type Reservation,
} from '@rms/api-contract';
import { NotificationEntity, NotificationType } from '@rms/db';
import { isRole, Permission, roleHasPermission } from '@rms/permissions';
import { buildPageMeta } from '@rms/shared';

import type { Actor } from '../common/auth/authenticated-request';
import { errorDiagnostics } from '../common/logging/error-diagnostics';
import { NotificationPublisher } from './notification-publisher.service';
import { toNotification } from './notifications.mapper';
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
      data: data.map(toNotification),
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
      if (ticketIds.length === 0) return;
      const recipients = await this.recipients(restaurantId, Permission.KOT_UPDATE_STATUS);
      if (recipients.length === 0) return;
      for (const id of ticketIds) {
        const ticket = await this.repository.findTicket(restaurantId, id);
        if (!ticket) continue;
        await this.repository.createForUsers(restaurantId, recipients, {
          type: NotificationType.KOT_SENT,
          title: 'New order',
          body: `${ticket.destination === 'KITCHEN' ? 'Kitchen' : 'Bar'} ticket ${ticket.kotNumber} — Table ${ticket.order.table.tableNumber}`,
          entity: NotificationEntity.ORDER,
          entityId: ticket.orderId,
          tableId: ticket.order.tableId,
        });
        await this.publisher.publish(restaurantId, recipients, { kind: 'created' });
      }
    });
  }

  async ticketReady(restaurantId: string, ticketId: string): Promise<void> {
    await this.bestEffort(async () => {
      const ticket = await this.repository.findTicket(restaurantId, ticketId);
      const captainId = ticket?.order.table.captainUserId;
      if (!ticket || !captainId) return;
      await this.notify(
        restaurantId,
        Permission.ORDER_READ,
        {
          type: NotificationType.KOT_READY,
          title: 'Order ready',
          body: `Ticket ${ticket.kotNumber} — Table ${ticket.order.table.tableNumber} is ready to serve`,
          entity: NotificationEntity.ORDER,
          entityId: ticket.orderId,
          tableId: ticket.order.tableId,
        },
        captainId,
        Permission.TABLE_BE_CAPTAIN,
      );
    });
  }

  async reservationCreated(restaurantId: string, reservation: Reservation): Promise<void> {
    await this.bestEffort(() =>
      this.notify(restaurantId, Permission.RESERVATION_WRITE, {
        type: NotificationType.RESERVATION_CREATED,
        title: 'New reservation',
        body: `${reservation.guest.guestName} — party of ${reservation.partySize}, ${reservation.reservationAt}`,
        entity: NotificationEntity.RESERVATION,
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
    eligibility?: Permission,
  ): Promise<void> {
    const ids = await this.recipients(restaurantId, permission, recipientId, eligibility);
    if (ids.length === 0) return;
    await this.repository.createForUsers(restaurantId, ids, payload);
    await this.publisher.publish(restaurantId, ids, { kind: 'created' });
  }

  private async recipients(
    restaurantId: string,
    permission: Permission,
    recipientId?: string,
    eligibility?: Permission,
  ): Promise<string[]> {
    const users = await this.repository.findActiveUsers(restaurantId);
    return users
      .filter(
        (user) =>
          (!recipientId || user.id === recipientId) &&
          isRole(user.role.name) &&
          roleHasPermission(user.role.name, permission) &&
          (!eligibility || roleHasPermission(user.role.name, eligibility)),
      )
      .map((user) => user.id);
  }

  private async bestEffort(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      this.logger.warn(
        'Notification creation failed after a committed operation',
        errorDiagnostics(error),
      );
    }
  }
}
