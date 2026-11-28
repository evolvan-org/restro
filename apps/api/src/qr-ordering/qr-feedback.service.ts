import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  OkResponse,
  QrFeedbackListQuery,
  QrFeedbackListResponse,
  QrFeedbackRequest,
} from '@rms/api-contract';
import { buildPageMeta } from '@rms/shared';

import { PrismaService } from '../common/database/prisma.service';
import { RateLimitService } from '../common/rate-limit/rate-limit.service';

const FEEDBACK_WINDOW_MS = 15 * 60_000;

@Injectable()
export class QrFeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimit: RateLimitService,
  ) {}

  async submit(token: string, ip: string, input: QrFeedbackRequest): Promise<OkResponse> {
    await this.rateLimit.consume('QR_FEEDBACK_WINDOW', `ip:${ip}`, 30, FEEDBACK_WINDOW_MS);
    const table = await this.prisma.restaurantTable.findFirst({
      where: { qrToken: token, isActive: true, restaurant: { status: 'ACTIVE' } },
      select: { id: true, restaurantId: true },
    });
    if (!table) throw new NotFoundException('This QR code isn’t working');

    const key = { tableId: table.id, submissionId: input.submissionId };
    // A retry of the same submission succeeds without storing another response.
    if (
      await this.prisma.qrFeedback.findUnique({
        where: { tableId_submissionId: key },
        select: { id: true },
      })
    ) {
      return { ok: true };
    }
    await this.rateLimit.consume(
      'QR_FEEDBACK_WINDOW',
      `table:${table.id}:ip:${ip}`,
      5,
      FEEDBACK_WINDOW_MS,
    );
    await this.prisma.qrFeedback.createMany({
      data: [
        {
          ...key,
          restaurantId: table.restaurantId,
          rating: input.rating,
          comment: input.comment || null,
        },
      ],
      skipDuplicates: true,
    });
    return { ok: true };
  }

  async list(restaurantId: string, query: QrFeedbackListQuery): Promise<QrFeedbackListResponse> {
    const { page, pageSize, rating } = query;
    const where = { restaurantId, rating };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.qrFeedback.findMany({
        where,
        select: {
          id: true,
          rating: true,
          comment: true,
          createdAt: true,
          table: { select: { tableNumber: true, section: { select: { name: true } } } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.qrFeedback.count({ where }),
    ]);
    return {
      data: rows.map(({ table, createdAt, ...feedback }) => ({
        ...feedback,
        tableNumber: table.tableNumber,
        section: table.section.name,
        createdAt: createdAt.toISOString(),
      })),
      meta: buildPageMeta(page, pageSize, total),
    };
  }
}
