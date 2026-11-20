import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { errorDiagnostics } from '../common/logging/error-diagnostics';
import { type EmailAdapter, EmailDeliveryError, type ProviderEmail } from './email.types';

const BREVO_SEND_URL = 'https://api.brevo.com/v3/smtp/email';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;

@Injectable()
export class BrevoEmailAdapter implements EmailAdapter {
  private readonly logger = new Logger(BrevoEmailAdapter.name);

  constructor(private readonly config: ConfigService) {}

  async send(message: ProviderEmail): Promise<void> {
    let lastStatus: number | undefined;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetch(BREVO_SEND_URL, {
          method: 'POST',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          headers: {
            accept: 'application/json',
            'api-key': this.config.getOrThrow<string>('EMAIL_PROVIDER_API_KEY'),
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            sender: {
              email: this.config.getOrThrow<string>('EMAIL_FROM_ADDRESS'),
              name: this.config.getOrThrow<string>('EMAIL_FROM_NAME'),
            },
            to: [message.to],
            templateId: message.templateId,
            params: message.variables,
            headers: { idempotencyKey: message.idempotencyKey },
            tags: [message.templateKey.toLowerCase()],
          }),
        });

        if (response.ok) return;
        lastStatus = response.status;
        if (!isRetryableStatus(response.status) || attempt === MAX_ATTEMPTS) break;
        await retryDelay(attempt, response.headers.get('retry-after'));
      } catch (error) {
        if (attempt === MAX_ATTEMPTS) {
          this.logger.error('Brevo request failed', errorDiagnostics(error));
          throw new EmailDeliveryError();
        }
        await retryDelay(attempt);
      }
    }

    this.logger.error('Brevo rejected transactional email', {
      template: message.templateKey,
      status: lastStatus,
    });
    throw new EmailDeliveryError(lastStatus);
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

async function retryDelay(attempt: number, retryAfter?: string | null): Promise<void> {
  const retryAfterMs = retryAfter ? Number(retryAfter) * 1_000 : Number.NaN;
  const delayMs = Number.isFinite(retryAfterMs)
    ? Math.min(Math.max(retryAfterMs, 0), 5_000)
    : 250 * 2 ** (attempt - 1);
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}
