import { type Notification, notificationSchema } from '@rms/api-contract';
import { NotificationEntity, NotificationType } from '@rms/db';

import type { NotificationRecord } from './notifications.repository';

const notificationTypes = {
  [NotificationType.KOT_SENT]: 'kot.sent',
  [NotificationType.KOT_READY]: 'kot.ready',
  [NotificationType.RESERVATION_CREATED]: 'reservation.created',
  [NotificationType.QR_ORDER_SUBMITTED]: 'qr.order.submitted',
  [NotificationType.QR_ORDER_ESCALATED]: 'qr.order.escalated',
  [NotificationType.QR_NO_CAPTAIN]: 'qr.no-captain',
  [NotificationType.QR_BILL_REQUESTED]: 'qr.bill.requested',
  [NotificationType.QR_CALL_SERVER]: 'qr.call-server',
  [NotificationType.QR_PAYMENT_REQUESTED]: 'qr.payment.requested',
} satisfies Record<NotificationType, Notification['type']>;

const notificationEntities = {
  [NotificationEntity.ORDER]: 'order',
  [NotificationEntity.RESERVATION]: 'reservation',
  [NotificationEntity.QR_ROUND]: 'qr-round',
  [NotificationEntity.QR_SESSION]: 'qr-session',
  [NotificationEntity.TABLE]: 'table',
} satisfies Record<NotificationEntity, Notification['entity']>;

export function toNotification(record: NotificationRecord): Notification {
  return notificationSchema.parse({
    ...record,
    type: notificationTypes[record.type],
    entity: notificationEntities[record.entity],
    readAt: record.readAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
  });
}
