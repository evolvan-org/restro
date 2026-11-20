import { createHmac } from 'node:crypto';

import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type AuthRateLimitAction } from '@rms/db';

import { errorDiagnostics } from '../logging/error-diagnostics';
import { RateLimitRepository } from './rate-limit.repository';

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  private cleanupCounter = 0;

  constructor(
    private readonly repository: RateLimitRepository,
    private readonly config: ConfigService,
  ) {}

  async consume(
    action: AuthRateLimitAction,
    subject: string,
    limit: number,
    windowMs: number,
  ): Promise<void> {
    const now = new Date();
    const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
    const count = await this.repository.increment({
      action,
      subjectHash: createHmac('sha256', this.config.getOrThrow<string>('RATE_LIMIT_HASH_SECRET'))
        .update(subject)
        .digest('hex'),
      windowStart,
      expiresAt: new Date(windowStart.getTime() + windowMs * 2),
    });

    this.cleanupCounter += 1;
    // Housekeeping runs in the background: a failed cleanup must not fail a request within limits.
    if (this.cleanupCounter % 100 === 0) {
      this.repository.deleteExpired(now).catch((error: unknown) => {
        this.logger.warn('Rate-limit counter cleanup failed', errorDiagnostics(error));
      });
    }

    if (count > limit) {
      throw new HttpException(
        'Too many requests. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
