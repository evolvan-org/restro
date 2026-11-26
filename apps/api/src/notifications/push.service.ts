import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import webpush from 'web-push';

import { errorDiagnostics } from '../common/logging/error-diagnostics';
import { PushRepository } from './push.repository';

export type PushMessage = {
  title: string;
  body: string;
  /** Path in the staff app the notification opens, e.g. `/qr-orders/rounds/<id>`. */
  url: string;
  /** Collapses repeats of the same alert on the device. */
  tag: string;
  silent?: boolean;
};

/**
 * Web Push to staff devices (service worker + VAPID). Best effort: a failed push never fails the
 * business operation, and endpoints the push service reports as gone are deleted.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly publicKey: string | null;

  constructor(
    config: ConfigService,
    private readonly repository: PushRepository,
  ) {
    const publicKey = config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = config.get<string>('VAPID_PRIVATE_KEY');
    const subject = config.get<string>('VAPID_SUBJECT');
    if (publicKey && privateKey && subject) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.publicKey = publicKey;
    } else {
      this.publicKey = null;
    }
  }

  config(): { publicKey: string | null } {
    return { publicKey: this.publicKey };
  }

  async subscribe(
    restaurantId: string,
    userId: string,
    input: { endpoint: string; keys: { p256dh: string; auth: string } },
  ): Promise<void> {
    await this.repository.upsert(restaurantId, userId, input);
  }

  async unsubscribe(restaurantId: string, userId: string, endpoint: string): Promise<void> {
    await this.repository.delete(restaurantId, userId, endpoint);
  }

  async send(restaurantId: string, userIds: string[], message: PushMessage): Promise<void> {
    if (!this.publicKey || userIds.length === 0) return;
    try {
      const subscriptions = await this.repository.findForUsers(restaurantId, userIds);
      const payload = JSON.stringify(message);
      await Promise.all(
        subscriptions.map(async (subscription) => {
          try {
            await webpush.sendNotification(
              {
                endpoint: subscription.endpoint,
                keys: { p256dh: subscription.p256dh, auth: subscription.auth },
              },
              payload,
              { TTL: 300, urgency: message.silent ? 'normal' : 'high', timeout: 5000 },
            );
          } catch (error) {
            const status = (error as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) {
              await this.repository.deleteById(subscription.id);
              return;
            }
            this.logger.warn('Web push delivery failed', errorDiagnostics(error));
          }
        }),
      );
    } catch (error) {
      this.logger.warn('Web push lookup failed', errorDiagnostics(error));
    }
  }
}
