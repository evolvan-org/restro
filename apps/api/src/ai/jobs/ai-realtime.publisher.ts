import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AI_JOB_EVENT,
  type AiJobEvent,
  type AiRealtimeConfig,
  type NotificationChannelAuthRequest,
  type NotificationChannelAuthResponse,
} from '@rms/api-contract';
import Pusher from 'pusher';

import type { Actor } from '../../common/auth/authenticated-request';
import { errorDiagnostics } from '../../common/logging/error-diagnostics';

/**
 * Live job progress on a private per-user channel. Best effort: the client also refetches items
 * (`GET /ai/jobs/:id?afterSeq=`) whenever the socket is down, so a dropped event loses nothing.
 */
@Injectable()
export class AiRealtimePublisher {
  private readonly logger = new Logger(AiRealtimePublisher.name);
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
    return `private-restaurant-${restaurantId}-user-${userId}-ai`;
  }

  configuration(actor: Actor): AiRealtimeConfig {
    return {
      key: this.config.getOrThrow<string>('PUSHER_KEY'),
      cluster: this.config.getOrThrow<string>('PUSHER_CLUSTER'),
      channel: this.channel(actor.restaurantId, actor.userId),
    };
  }

  authorize(actor: Actor, input: NotificationChannelAuthRequest): NotificationChannelAuthResponse {
    if (input.channel_name !== this.channel(actor.restaurantId, actor.userId)) {
      throw new ForbiddenException('You cannot subscribe to this channel');
    }
    return this.client.authorizeChannel(input.socket_id, input.channel_name);
  }

  async publish(restaurantId: string, userId: string, event: AiJobEvent): Promise<void> {
    try {
      await this.client.trigger(this.channel(restaurantId, userId), AI_JOB_EVENT, event);
    } catch (error) {
      this.logger.warn('AI job event not delivered', {
        jobId: event.jobId,
        ...errorDiagnostics(error),
      });
    }
  }
}
