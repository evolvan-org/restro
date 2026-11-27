import { Injectable } from '@nestjs/common';
import type {
  AiJobContext,
  AiJobErrorCode,
  AiJobKind,
  AiJobStatus,
  InvoiceScanHeader,
  ScanPageResult,
} from '@rms/api-contract';
import { Prisma } from '@rms/db';

import { PrismaService } from '../../common/database/prisma.service';

/** What a job keeps in `ai_jobs.result` while and after it runs. */
export type AiJobResult = {
  pages: ScanPageResult[];
  invoiceHeader: InvoiceScanHeader | null;
  droppedRows: number;
};

export type AiJobRecord = {
  id: string;
  restaurantId: string;
  createdByUserId: string;
  kind: AiJobKind;
  status: AiJobStatus;
  context: AiJobContext;
  input: Prisma.JsonValue;
  result: AiJobResult;
  pagesTotal: number;
  pagesDone: number;
  errorCode: AiJobErrorCode | null;
  attempts: number;
  imagesPurgedAt: Date | null;
  createdAt: Date;
  finishedAt: Date | null;
};

export type AiJobItemRecord = {
  seq: number;
  page: number | null;
  confidence: number;
  data: Prisma.JsonValue;
};

const EMPTY_RESULT: AiJobResult = { pages: [], invoiceHeader: null, droppedRows: 0 };

function toRecord(row: {
  id: string;
  restaurantId: string;
  createdByUserId: string;
  kind: AiJobKind;
  status: AiJobStatus;
  context: AiJobContext;
  input: Prisma.JsonValue;
  result: Prisma.JsonValue;
  pagesTotal: number;
  pagesDone: number;
  errorCode: string | null;
  attempts: number;
  imagesPurgedAt: Date | null;
  createdAt: Date;
  finishedAt: Date | null;
}): AiJobRecord {
  const result = (row.result ?? null) as Partial<AiJobResult> | null;
  return {
    ...row,
    errorCode: row.errorCode as AiJobErrorCode | null,
    result: {
      pages: result?.pages ?? [],
      invoiceHeader: result?.invoiceHeader ?? null,
      droppedRows: result?.droppedRows ?? 0,
    },
  };
}

const JOB_SELECT = {
  id: true,
  restaurantId: true,
  createdByUserId: true,
  kind: true,
  status: true,
  context: true,
  input: true,
  result: true,
  pagesTotal: true,
  pagesDone: true,
  errorCode: true,
  attempts: true,
  imagesPurgedAt: true,
  createdAt: true,
  finishedAt: true,
} as const;

@Injectable()
export class AiJobsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: {
    id?: string;
    restaurantId: string;
    userId: string;
    kind: AiJobKind;
    context: AiJobContext;
    input: Prisma.InputJsonValue;
    pagesTotal: number;
    result?: AiJobResult;
  }): Promise<AiJobRecord> {
    const row = await this.prisma.aiJob.create({
      data: {
        ...(input.id && { id: input.id }),
        restaurantId: input.restaurantId,
        createdByUserId: input.userId,
        kind: input.kind,
        context: input.context,
        input: input.input,
        pagesTotal: input.pagesTotal,
        result: (input.result ?? EMPTY_RESULT) as unknown as Prisma.InputJsonValue,
      },
      select: JOB_SELECT,
    });
    return toRecord(row);
  }

  async find(restaurantId: string, id: string): Promise<AiJobRecord | null> {
    const row = await this.prisma.aiJob.findFirst({
      where: { id, restaurantId },
      select: JOB_SELECT,
    });
    return row ? toRecord(row) : null;
  }

  async findById(id: string): Promise<AiJobRecord | null> {
    const row = await this.prisma.aiJob.findUnique({ where: { id }, select: JOB_SELECT });
    return row ? toRecord(row) : null;
  }

  async status(id: string): Promise<AiJobStatus | null> {
    const row = await this.prisma.aiJob.findUnique({ where: { id }, select: { status: true } });
    return row?.status ?? null;
  }

  /** Claims the oldest queued job; concurrent claimers skip rows another one holds. */
  async claimNext(): Promise<AiJobRecord | null> {
    const [claimed] = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE ai_jobs SET status = 'RUNNING', attempts = attempts + 1,
        started_at = COALESCE(started_at, NOW()), updated_at = NOW()
      WHERE id = (
        SELECT id FROM ai_jobs WHERE status = 'QUEUED'
        ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
      )
      RETURNING id
    `;
    return claimed ? this.findById(claimed.id) : null;
  }

  /** Jobs left RUNNING by a restart go back to the queue (or fail after repeated attempts). */
  async recoverInterrupted(maxAttempts: number): Promise<number> {
    const failed = await this.prisma.aiJob.updateMany({
      where: { status: 'RUNNING', attempts: { gte: maxAttempts } },
      data: { status: 'FAILED', errorCode: 'INTERRUPTED', finishedAt: new Date() },
    });
    const requeued = await this.prisma.aiJob.updateMany({
      where: { status: 'RUNNING' },
      data: { status: 'QUEUED' },
    });
    return failed.count + requeued.count;
  }

  async items(jobId: string, afterSeq = -1): Promise<AiJobItemRecord[]> {
    return this.prisma.aiJobItem.findMany({
      where: { jobId, seq: { gt: afterSeq } },
      orderBy: { seq: 'asc' },
      select: { seq: true, page: true, confidence: true, data: true },
    });
  }

  async itemCount(jobId: string): Promise<number> {
    return this.prisma.aiJobItem.count({ where: { jobId } });
  }

  async nextSeq(jobId: string): Promise<number> {
    const max = await this.prisma.aiJobItem.aggregate({ where: { jobId }, _max: { seq: true } });
    return (max._max.seq ?? -1) + 1;
  }

  async addItem(
    jobId: string,
    item: Omit<AiJobItemRecord, 'data'> & { data: Record<string, unknown> },
  ): Promise<void> {
    await this.prisma.aiJobItem.create({
      data: {
        jobId,
        seq: item.seq,
        page: item.page,
        confidence: item.confidence,
        data: item.data as Prisma.InputJsonValue,
      },
    });
  }

  async deletePageItems(jobId: string, page: number): Promise<void> {
    await this.prisma.aiJobItem.deleteMany({ where: { jobId, page } });
  }

  async saveProgress(
    id: string,
    update: { pagesDone?: number; pagesTotal?: number; result?: AiJobResult },
  ): Promise<void> {
    await this.prisma.aiJob.update({
      where: { id },
      data: {
        ...(update.pagesDone !== undefined && { pagesDone: update.pagesDone }),
        ...(update.pagesTotal !== undefined && { pagesTotal: update.pagesTotal }),
        ...(update.result && { result: update.result as unknown as Prisma.InputJsonValue }),
      },
    });
  }

  /** Final status, unless the owner cancelled meanwhile (a cancel always wins). */
  async finish(
    id: string,
    status: Extract<AiJobStatus, 'SUCCEEDED' | 'PARTIAL' | 'FAILED'>,
    errorCode: AiJobErrorCode | null,
  ): Promise<void> {
    await this.prisma.aiJob.updateMany({
      where: { id, status: 'RUNNING' },
      data: { status, errorCode, finishedAt: new Date() },
    });
  }

  async cancel(id: string): Promise<void> {
    await this.prisma.aiJob.updateMany({
      where: { id, status: { in: ['QUEUED', 'RUNNING'] } },
      data: { status: 'CANCELLED', errorCode: 'CANCELLED', finishedAt: new Date() },
    });
  }

  /** Puts a finished scan back in the queue (a retaken page needs reading). */
  async requeue(id: string, result: AiJobResult): Promise<void> {
    await this.prisma.aiJob.update({
      where: { id },
      data: {
        status: 'QUEUED',
        errorCode: null,
        finishedAt: null,
        attempts: 0,
        result: result as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async markImagesPurged(ids: readonly string[]): Promise<void> {
    if (!ids.length) return;
    await this.prisma.aiJob.updateMany({
      where: { id: { in: [...ids] }, imagesPurgedAt: null },
      data: { imagesPurgedAt: new Date() },
    });
  }

  /** Scan jobs whose photos are past their keep-by time. */
  async expiredImageJobs(olderThan: Date): Promise<{ id: string; restaurantId: string }[]> {
    return this.prisma.aiJob.findMany({
      where: {
        imagesPurgedAt: null,
        kind: { in: ['MENU_SCAN', 'INVOICE_SCAN'] },
        createdAt: { lt: olderThan },
        status: { notIn: ['QUEUED', 'RUNNING'] },
      },
      select: { id: true, restaurantId: true },
      take: 200,
    });
  }

  async ownedScanJobs(
    restaurantId: string,
    ids: readonly string[],
  ): Promise<{ id: string; restaurantId: string }[]> {
    if (!ids.length) return [];
    return this.prisma.aiJob.findMany({
      where: { restaurantId, id: { in: [...ids] }, imagesPurgedAt: null },
      select: { id: true, restaurantId: true },
    });
  }
}
