import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NOTIFICATION_CHANGED_EVENT,
  type NotificationChangedEvent,
  type NotificationChannelAuthRequest,
  type NotificationChannelAuthResponse,
  type NotificationRealtimeConfig,
} from '@rms/api-contract';
import Pusher from 'pusher';

import type { Actor } from '../common/auth/authenticated-request';

@Injectable()
export class NotificationPublisher {
  private readonly logger = new Logger(NotificationPublisher.name);
  private readonly client: Pusher;

  constructor(private readonly config: ConfigService) {
    this.client = new Pusher({
      appId: config.getOrThrow<string>('PUSHER_APP_ID'),
      key: config.getOrThrow<string>('PUSHER_KEY'),
      secret: config.getOrThrow<string>('PUSHER_SECRET'),
      cluster: config.getOrThrow<string>('PUSHER_CLUSTER'),
      useTLS: true,
      timeout: 3000,
    });
  }

  private channel(restaurantId: string, userId: string): string {
    return `private-restaurant-${restaurantId}-user-${userId}-notifications`;
  }

  configuration(actor: Actor): NotificationRealtimeConfig {
    return {
      key: this.config.getOrThrow<string>('PUSHER_KEY'),
      cluster: this.config.getOrThrow<string>('PUSHER_CLUSTER'),
      channel: this.channel(actor.restaurantId, actor.userId),
    };
  }

  authorize(actor: Actor, input: NotificationChannelAuthRequest): NotificationChannelAuthResponse {
    if (input.channel_name !== this.channel(actor.restaurantId, actor.userId)) {
      throw new ForbiddenException('You cannot subscribe to this notification channel');
    }
    return this.client.authorizeChannel(input.socket_id, input.channel_name);
  }

  async publish(
    restaurantId: string,
    userIds: string[],
    event: NotificationChangedEvent,
  ): Promise<void> {
    // Pusher accepts at most 100 channels per trigger. Never include alert contents or credentials.
    for (let offset = 0; offset < userIds.length; offset += 100) {
      const channels = userIds
        .slice(offset, offset + 100)
        .map((id) => this.channel(restaurantId, id));
      try {
        await this.client.trigger(channels, NOTIFICATION_CHANGED_EVENT, event);
      } catch {
        // Persistence has committed. Do not report a failed business operation or retry blindly.
        this.logger.warn('Notification live delivery failed; saved alerts remain available');
      }
    }
  }
}
