import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type AiJobKind, type AiUsageResponse, API_ERROR_CODES } from '@rms/api-contract';

import { PrismaService } from '../../common/database/prisma.service';

type MeteredKind = Extract<AiJobKind, 'MENU_SCAN' | 'INVOICE_SCAN'>;

/** The restaurant's calendar day (limits reset at local midnight), as a UTC date for the column. */
export function usageDay(now: Date, timeZone: string): Date {
  let day: string;
  try {
    day = new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
  } catch {
    day = now.toISOString().slice(0, 10);
  }
  return new Date(`${day}T00:00:00.000Z`);
}

/**
 * Daily scan limits per restaurant and token accounting. Reserving a scan is one atomic upsert that
 * only increments below the limit, so concurrent uploads can't overshoot it.
 */
@Injectable()
export class AiQuotaService {
  private readonly limits: Record<MeteredKind, number>;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.limits = {
      MENU_SCAN: config.get<number>('AI_DAILY_MENU_SCANS') ?? 10,
      INVOICE_SCAN: config.get<number>('AI_DAILY_INVOICE_SCANS') ?? 20,
    };
  }

  private async today(restaurantId: string): Promise<Date> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { timezone: true },
    });
    return usageDay(new Date(), restaurant?.timezone ?? 'Asia/Kolkata');
  }

  async reserve(restaurantId: string, kind: MeteredKind): Promise<void> {
    const limit = this.limits[kind];
    const day = await this.today(restaurantId);
    const rows = await this.prisma.$queryRaw<{ jobs: number }[]>`
      INSERT INTO ai_usage (restaurant_id, day, kind, jobs)
      VALUES (${restaurantId}::uuid, ${day}::date, ${kind}::"AiJobKind", 1)
      ON CONFLICT (restaurant_id, day, kind)
      DO UPDATE SET jobs = ai_usage.jobs + 1 WHERE ai_usage.jobs < ${limit}
      RETURNING jobs
    `;
    if (rows.length === 0 || limit === 0) {
      if (rows.length) await this.release(restaurantId, kind);
      throw new HttpException(
        {
          message: `You've used today's ${limit} ${kind === 'MENU_SCAN' ? 'menu' : 'invoice'} scans. Try again tomorrow, or import a CSV or add items by hand.`,
          error: 'Too Many Requests',
          code: API_ERROR_CODES.AI_QUOTA_EXCEEDED,
          limit,
          used: limit,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** Gives a reserved scan back (the upload was rejected before any AI call). */
  async release(restaurantId: string, kind: MeteredKind): Promise<void> {
    const day = await this.today(restaurantId);
    await this.prisma.aiUsage.updateMany({
      where: { restaurantId, day, kind, jobs: { gt: 0 } },
      data: { jobs: { decrement: 1 } },
    });
  }

  async recordTokens(
    restaurantId: string,
    kind: AiJobKind,
    usage: { inputTokens: number; outputTokens: number },
  ): Promise<void> {
    if (!usage.inputTokens && !usage.outputTokens) return;
    const day = await this.today(restaurantId);
    await this.prisma.$executeRaw`
      INSERT INTO ai_usage (restaurant_id, day, kind, jobs, input_tokens, output_tokens)
      VALUES (${restaurantId}::uuid, ${day}::date, ${kind}::"AiJobKind", 0, ${usage.inputTokens}, ${usage.outputTokens})
      ON CONFLICT (restaurant_id, day, kind) DO UPDATE SET
        input_tokens = ai_usage.input_tokens + EXCLUDED.input_tokens,
        output_tokens = ai_usage.output_tokens + EXCLUDED.output_tokens
    `;
  }

  async summary(restaurantId: string, enabled: boolean): Promise<AiUsageResponse> {
    const day = await this.today(restaurantId);
    const rows = await this.prisma.aiUsage.findMany({
      where: { restaurantId, day, kind: { in: ['MENU_SCAN', 'INVOICE_SCAN'] } },
      select: { kind: true, jobs: true },
    });
    const used = (kind: MeteredKind): number => rows.find((row) => row.kind === kind)?.jobs ?? 0;
    return {
      enabled,
      menuScans: { used: used('MENU_SCAN'), limit: this.limits.MENU_SCAN },
      invoiceScans: { used: used('INVOICE_SCAN'), limit: this.limits.INVOICE_SCAN },
    };
  }
}
