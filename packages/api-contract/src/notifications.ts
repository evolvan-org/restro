import { z } from 'zod';

import { paginatedResponseSchema, paginationQuerySchema } from './common';

export const notificationTypeSchema = z.enum(['kot.sent', 'kot.ready', 'reservation.created']);
export const notificationSchema = z
  .object({
    id: z.string().uuid(),
    type: notificationTypeSchema,
    title: z.string(),
    body: z.string(),
    entity: z.enum(['order', 'reservation']),
    entityId: z.string().uuid(),
    tableId: z.string().uuid().nullable(),
    readAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
  })
  .strict();

export const notificationListQuerySchema = paginationQuerySchema.strict();
export const notificationListResponseSchema = paginatedResponseSchema(notificationSchema).extend({
  unreadCount: z.number().int().nonnegative(),
});
export const markNotificationsReadResponseSchema = z.object({ ok: z.literal(true) }).strict();
export const notificationRealtimeConfigSchema = z
  .object({ key: z.string().min(1), cluster: z.string().min(1), channel: z.string().min(1) })
  .strict();
export const notificationChannelAuthRequestSchema = z
  .object({
    socket_id: z
      .string()
      .regex(/^\d+\.\d+$/)
      .max(100),
    channel_name: z.string().min(1).max(200),
  })
  .strict();
export const notificationChannelAuthResponseSchema = z.object({ auth: z.string() }).strict();
export const NOTIFICATION_CHANGED_EVENT = 'notifications.changed';
export const notificationChangedEventSchema = z
  .object({ kind: z.enum(['created', 'read']) })
  .strict();

export type Notification = z.infer<typeof notificationSchema>;
export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;
export type NotificationListResponse = z.infer<typeof notificationListResponseSchema>;
export type MarkNotificationsReadResponse = z.infer<typeof markNotificationsReadResponseSchema>;
export type NotificationRealtimeConfig = z.infer<typeof notificationRealtimeConfigSchema>;
export type NotificationChannelAuthRequest = z.infer<typeof notificationChannelAuthRequestSchema>;
export type NotificationChannelAuthResponse = z.infer<typeof notificationChannelAuthResponseSchema>;
export type NotificationChangedEvent = z.infer<typeof notificationChangedEventSchema>;
