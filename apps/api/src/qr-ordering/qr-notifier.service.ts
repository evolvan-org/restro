import { Injectable } from '@nestjs/common';
import { type QrChangedEvent } from '@rms/api-contract';
import { NotificationEntity, NotificationType } from '@rms/db';
import { Permission } from '@rms/permissions';
import { formatRupees } from '@rms/shared';

import { NotificationsService } from '../notifications/notifications.service';
import { QrRealtimePublisher } from '../notifications/qr-realtime.publisher';

/**
 * Notification targeting for QR ordering — the acceptance contract of REST-88:
 *
 * - A round, a later round, a bill request, "call server" and a payment request reach ONLY the
 *   table's owner captain. Nobody else is pinged.
 * - An escalation reaches managers (`qr-order:manage`); a no-captain scan reaches managers,
 *   silently (no chime/vibration), de-duplicated per table upstream.
 * - Visibility is separate: anyone with `qr-order:read` can see the queue.
 *
 * Live screen updates (Pusher, ids only) go to the restaurant's staff QR channel and the affected
 * guest sessions.
 */
@Injectable()
export class QrNotifier {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly realtime: QrRealtimePublisher,
  ) {}

  live(restaurantId: string, sessionIds: readonly string[], event: QrChangedEvent): Promise<void> {
    return this.realtime.publish(restaurantId, sessionIds, event);
  }

  async roundSubmitted(input: {
    restaurantId: string;
    captainUserId: string;
    roundId: string;
    tableId: string;
    tableNumber: string;
    roundNumber: number;
    itemCount: number;
    total: string;
  }): Promise<void> {
    const summary = `Round ${input.roundNumber} · ${input.itemCount} ${
      input.itemCount === 1 ? 'item' : 'items'
    } · ${formatRupees(input.total)}`;
    await this.notifications.deliver(
      input.restaurantId,
      [input.captainUserId],
      {
        type: NotificationType.QR_ORDER_SUBMITTED,
        title: `New guest order · Table ${input.tableNumber}`,
        body: `${summary}. Tap to review.`,
        entity: NotificationEntity.QR_ROUND,
        entityId: input.roundId,
        tableId: input.tableId,
      },
      { url: `/qr-orders/rounds/${input.roundId}`, tag: `qr-round-${input.roundId}` },
    );
  }

  async roundEscalated(input: {
    restaurantId: string;
    roundId: string;
    tableId: string;
    tableNumber: string;
    captainName: string | null;
    waitedMinutes: number;
  }): Promise<void> {
    const managers = await this.notifications.usersWith(
      input.restaurantId,
      Permission.QR_ORDER_MANAGE,
    );
    const captain = input.captainName ? ` · Captain: ${input.captainName}` : '';
    await this.notifications.deliver(
      input.restaurantId,
      managers,
      {
        type: NotificationType.QR_ORDER_ESCALATED,
        title: `Order waiting ${input.waitedMinutes}m at Table ${input.tableNumber}${captain}`,
        body: 'Approve it yourself or reassign the table.',
        entity: NotificationEntity.QR_ROUND,
        entityId: input.roundId,
        tableId: input.tableId,
      },
      { url: `/qr-orders/alerts`, tag: `qr-escalation-${input.roundId}` },
    );
  }

  async noCaptainScan(input: {
    restaurantId: string;
    tableId: string;
    tableNumber: string;
  }): Promise<void> {
    const managers = await this.notifications.usersWith(
      input.restaurantId,
      Permission.QR_ORDER_MANAGE,
    );
    await this.notifications.deliver(
      input.restaurantId,
      managers,
      {
        type: NotificationType.QR_NO_CAPTAIN,
        title: `A guest scanned Table ${input.tableNumber}, which has no captain assigned`,
        body: 'Assign a captain so they can order.',
        entity: NotificationEntity.TABLE,
        entityId: input.tableId,
        tableId: input.tableId,
      },
      { url: `/qr-orders/alerts`, tag: `qr-no-captain-${input.tableId}`, silent: true },
    );
  }

  async toCaptain(input: {
    restaurantId: string;
    captainUserId: string | null;
    type: 'bill' | 'call' | 'payment';
    sessionId: string;
    tableId: string;
    tableNumber: string;
    body: string;
  }): Promise<void> {
    if (!input.captainUserId) return;
    const config = {
      bill: {
        type: NotificationType.QR_BILL_REQUESTED,
        title: `Table ${input.tableNumber} requested the bill`,
      },
      call: {
        type: NotificationType.QR_CALL_SERVER,
        title: `Table ${input.tableNumber} is asking for you`,
      },
      payment: {
        type: NotificationType.QR_PAYMENT_REQUESTED,
        title: `Table ${input.tableNumber} wants to pay`,
      },
    }[input.type];
    await this.notifications.deliver(
      input.restaurantId,
      [input.captainUserId],
      {
        type: config.type,
        title: config.title,
        body: input.body,
        entity: NotificationEntity.QR_SESSION,
        entityId: input.sessionId,
        tableId: input.tableId,
      },
      {
        url: `/qr-orders/sessions/${input.sessionId}/bill`,
        tag: `qr-${input.type}-${input.sessionId}`,
      },
    );
  }
}
