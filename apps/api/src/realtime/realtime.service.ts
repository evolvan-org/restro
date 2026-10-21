import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type PusherAuthorizeRequest,
  type PusherAuthorizeResponse,
  type PusherClientConfig,
  REALTIME_CHANGE_EVENT,
  realtimeChangeSchema,
  type RealtimeResource,
  type RealtimeTopic,
  realtimeTopicForResource,
  restaurantRealtimeChannel,
} from '@rms/api-contract';
import { Permission, roleHasPermission } from '@rms/permissions';
import Pusher from 'pusher';

import type { Actor } from '../common/auth/authenticated-request';

const TOPIC_PERMISSIONS: Record<RealtimeTopic, Permission> = {
  menu: Permission.MENU_READ,
  tables: Permission.RESTAURANT_READ,
};

@Injectable()
export class RealtimeService {
  private readonly pusher: Pusher;
  private readonly logger = new Logger(RealtimeService.name);

  constructor(private readonly config: ConfigService) {
    this.pusher = new Pusher({
      appId: config.getOrThrow<string>('PUSHER_APP_ID'),
      key: config.getOrThrow<string>('PUSHER_KEY'),
      secret: config.getOrThrow<string>('PUSHER_SECRET'),
      cluster: config.getOrThrow<string>('PUSHER_CLUSTER'),
      useTLS: true,
      timeout: 5000,
    });
  }

  clientConfig(actor: Actor): PusherClientConfig {
    const topics: RealtimeTopic[] = ['menu', 'tables'];
    return {
      key: this.config.getOrThrow<string>('PUSHER_KEY'),
      cluster: this.config.getOrThrow<string>('PUSHER_CLUSTER'),
      channels: topics
        .filter((topic) => roleHasPermission(actor.role, TOPIC_PERMISSIONS[topic]))
        .map((topic) => ({
          name: restaurantRealtimeChannel(actor.restaurantId, topic),
          topic,
        })),
    };
  }

  authorize(actor: Actor, input: PusherAuthorizeRequest): PusherAuthorizeResponse {
    const allowed = this.clientConfig(actor).channels.some(
      (channel) => channel.name === input.channel_name,
    );
    if (!allowed) throw new ForbiddenException('Not authorized for this real-time channel');
    return this.pusher.authorizeChannel(input.socket_id, input.channel_name);
  }

  /** Publish only after the database write has committed. Never send entity data or credentials. */
  async publishChange(restaurantId: string, resource: RealtimeResource): Promise<void> {
    try {
      await this.pusher.trigger(
        restaurantRealtimeChannel(restaurantId, realtimeTopicForResource(resource)),
        REALTIME_CHANGE_EVENT,
        realtimeChangeSchema.parse({ resource }),
      );
    } catch {
      // The write is already committed. Preserve its success and explicitly log delivery failure;
      // throwing here would incorrectly invite the caller to repeat a successful database write.
      this.logger.error(`Could not publish ${resource} change; the database write is saved`);
    }
  }
}
