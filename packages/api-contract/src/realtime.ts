import { z } from 'zod';

export const REALTIME_CHANGE_EVENT = 'data-changed';

export const realtimeResourceSchema = z.enum([
  'menu-items',
  'menu-categories',
  'tables',
  'table-statuses',
  'dining-sections',
]);

export const realtimeTopicSchema = z.enum(['menu', 'tables']);

export const realtimeChangeSchema = z.object({ resource: realtimeResourceSchema }).strict();

export const pusherClientConfigSchema = z
  .object({
    key: z.string().min(1),
    cluster: z.string().min(1),
    channels: z.array(
      z.object({ name: z.string().startsWith('private-'), topic: realtimeTopicSchema }).strict(),
    ),
  })
  .strict();

export const pusherAuthorizeRequestSchema = z
  .object({
    socket_id: z.string().regex(/^\d+\.\d+$/, 'Invalid Pusher socket id'),
    channel_name: z.string().min(1).max(200),
  })
  .strict();

export const pusherAuthorizeResponseSchema = z.object({ auth: z.string().min(1) }).strict();

export type RealtimeResource = z.infer<typeof realtimeResourceSchema>;
export type RealtimeTopic = z.infer<typeof realtimeTopicSchema>;
export type RealtimeChange = z.infer<typeof realtimeChangeSchema>;
export type PusherClientConfig = z.infer<typeof pusherClientConfigSchema>;
export type PusherAuthorizeRequest = z.infer<typeof pusherAuthorizeRequestSchema>;
export type PusherAuthorizeResponse = z.infer<typeof pusherAuthorizeResponseSchema>;

export function realtimeTopicForResource(resource: RealtimeResource): RealtimeTopic {
  return resource === 'menu-items' || resource === 'menu-categories' ? 'menu' : 'tables';
}

export function restaurantRealtimeChannel(restaurantId: string, topic: RealtimeTopic): string {
  return `private-restaurant-${restaurantId}-${topic}`;
}
