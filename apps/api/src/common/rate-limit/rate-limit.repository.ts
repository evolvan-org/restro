import { Injectable } from '@nestjs/common';
import { type AuthRateLimitAction } from '@rms/db';

import { PrismaService } from '../database/prisma.service';

@Injectable()
export class RateLimitRepository {
  constructor(private readonly prisma: PrismaService) {}

  async increment(input: {
    action: AuthRateLimitAction;
    subjectHash: string;
    windowStart: Date;
    expiresAt: Date;
  }): Promise<number> {
    const counter = await this.prisma.authRateLimitCounter.upsert({
      where: {
        action_subjectHash_windowStart: {
          action: input.action,
          subjectHash: input.subjectHash,
          windowStart: input.windowStart,
        },
      },
      create: input,
      update: { count: { increment: 1 }, expiresAt: input.expiresAt },
      select: { count: true },
    });
    return counter.count;
  }

  async deleteExpired(now: Date): Promise<void> {
    await this.prisma.authRateLimitCounter.deleteMany({ where: { expiresAt: { lt: now } } });
  }
}
