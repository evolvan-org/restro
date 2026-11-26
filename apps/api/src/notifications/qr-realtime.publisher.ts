import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  QR_CHANGED_EVENT,
  type QrChangedEvent,
  type QrChannelAuthRequest,
  type QrChannelAuthResponse,
} from '@rms/api-contract';
import Pusher from 'pusher';

import { errorDiagnostics } from '../common/logging/error-diagnostics';

/**
 * Live updates for QR ordering over the existing Pusher app. Two private channel families:
 *
 * - `private-qr-session-<sessionId>`: one per table visit; authorized by the guest secret.
 * - `private-restaurant-<id>-qr`: staff queue, floor board and station displays of a restaurant.
 *
 * Events carry ids only (no names, amounts or PII); clients refetch over HTTPS on receipt and fall
 * back to polling when the socket is unavailable.
 */
@Injectable()
export class QrRealtimePublisher {
  private readonly logger = new Logger(QrRealtimePublisher.name);
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

  publicConfig(): { key: string; cluster: string } {
    return {
      key: this.config.getOrThrow<string>('PUSHER_KEY'),
      cluster: this.config.getOrThrow<string>('PUSHER_CLUSTER'),
    };
  }

  sessionChannel(sessionId: string): string {
    return `private-qr-session-${sessionId}`;
  }

  staffChannel(restaurantId: string): string {
    return `private-restaurant-${restaurantId}-qr`;
  }

  authorize(expectedChannel: string, input: QrChannelAuthRequest): QrChannelAuthResponse {
    if (input.channel_name !== expectedChannel) {
      throw new ForbiddenException('You cannot subscribe to this channel');
    }
    return this.client.authorizeChannel(input.socket_id, input.channel_name);
  }

  /** Notify the guest phones of one or more sessions and the restaurant's staff screens. */
  async publish(
    restaurantId: string,
    sessionIds: readonly string[],
    event: QrChangedEvent,
  ): Promise<void> {
    const channels = [
      this.staffChannel(restaurantId),
      ...[...new Set(sessionIds)].map((id) => this.sessionChannel(id)),
    ];
    for (let offset = 0; offset < channels.length; offset += 100) {
      try {
        await this.client.trigger(channels.slice(offset, offset + 100), QR_CHANGED_EVENT, event);
      } catch (error) {
        // The write has committed; clients resync by polling. Never fail the operation here.
        this.logger.warn('QR live update failed; clients will resync', errorDiagnostics(error));
      }
    }
  }
}
