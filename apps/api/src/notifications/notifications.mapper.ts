import { type Notification, notificationSchema } from '@rms/api-contract';
import { NotificationEntity, NotificationType } from '@rms/db';

import type { NotificationRecord } from './notifications.repository';

const notificationTypes = {
  [NotificationType.KOT_SENT]: 'kot.sent',
  [NotificationType.KOT_READY]: 'kot.ready',
  [NotificationType.RESERVATION_CREATED]: 'reservation.created',
} satisfies Record<NotificationType, Notification['type']>;

const notificationEntities = {
  [NotificationEntity.ORDER]: 'order',
  [NotificationEntity.RESERVATION]: 'reservation',
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
