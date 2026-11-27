import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AiJobErrorCode, AiJobKind, AiJobStatus } from '@rms/api-contract';

import { errorDiagnostics } from '../../common/logging/error-diagnostics';
import type { AiUsage } from '../provider/ai-provider';
import { AiQuotaService } from '../usage/ai-quota.service';
import { type AiJobRecord, type AiJobResult, AiJobsRepository } from './ai-jobs.repository';
import { AiRealtimePublisher } from './ai-realtime.publisher';

const POLL_INTERVAL_MS = 3000;
/** A job interrupted this many times (restarts mid-run) fails instead of looping forever. */
const MAX_ATTEMPTS = 3;

export type JobItemInput = {
  page: number | null;
  confidence: number;
  data: Record<string, unknown>;
};

/** What a handler gets while its job runs. */
export type JobRunContext = {
  job: AiJobRecord;
  signal: AbortSignal;
  /** Saves a validated row and pushes it to the owner's screen. */
  emit(item: JobItemInput): Promise<void>;
  /** Saves page statuses / header and pushes a progress event. */
  saveResult(result: AiJobResult, pagesDone: number): Promise<void>;
  recordUsage(usage: AiUsage): Promise<void>;
};

export type JobOutcome = {
  status: Extract<AiJobStatus, 'SUCCEEDED' | 'PARTIAL' | 'FAILED'>;
  errorCode: AiJobErrorCode | null;
};

export interface AiJobHandler {
  readonly kind: AiJobKind;
  run(context: JobRunContext): Promise<JobOutcome>;
}

export const AI_JOB_HANDLERS = Symbol('AI_JOB_HANDLERS');

/**
 * In-process worker over the `ai_jobs` table: claims queued jobs (`FOR UPDATE SKIP LOCKED`), runs
 * up to `AI_MAX_CONCURRENT_JOBS` at once, and on boot puts jobs a restart interrupted back in the
 * queue (handlers resume from the pages / dishes already done).
 */
@Injectable()
export class AiJobRunner implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(AiJobRunner.name);
  private readonly maxConcurrent: number;
  private readonly running = new Map<string, AbortController>();
  private handlers = new Map<AiJobKind, AiJobHandler>();
  private timer: NodeJS.Timeout | null = null;
  private draining = false;
  private stopped = false;

  constructor(
    private readonly repository: AiJobsRepository,
    private readonly realtime: AiRealtimePublisher,
    private readonly quota: AiQuotaService,
    config: ConfigService,
  ) {
    this.maxConcurrent = config.get<number>('AI_MAX_CONCURRENT_JOBS') ?? 3;
  }

  register(handlers: readonly AiJobHandler[]): void {
    this.handlers = new Map(handlers.map((handler) => [handler.kind, handler]));
  }

  async onApplicationBootstrap(): Promise<void> {
    const recovered = await this.repository.recoverInterrupted(MAX_ATTEMPTS);
    if (recovered) this.logger.log(`Recovered ${recovered} interrupted AI job(s)`);
    this.timer = setInterval(() => this.kick(), POLL_INTERVAL_MS);
    this.timer.unref();
    this.kick();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    for (const controller of this.running.values()) controller.abort();
  }

  /** Starts queued jobs now instead of at the next poll. */
  kick(): void {
    if (this.draining || this.stopped) return;
    this.draining = true;
    void this.drain().finally(() => {
      this.draining = false;
    });
  }

  /** Stops a running job promptly (the cancel itself is recorded by the caller). */
  abort(jobId: string): void {
    this.running.get(jobId)?.abort();
  }

  private async drain(): Promise<void> {
    while (!this.stopped && this.running.size < this.maxConcurrent) {
      let job: AiJobRecord | null;
      try {
        job = await this.repository.claimNext();
      } catch (error) {
        this.logger.error('Could not claim an AI job', errorDiagnostics(error));
        return;
      }
      if (!job) return;
      const controller = new AbortController();
      this.running.set(job.id, controller);
      void this.execute(job, controller).finally(() => {
        this.running.delete(job.id);
        this.kick();
      });
    }
  }

  private async execute(job: AiJobRecord, controller: AbortController): Promise<void> {
    const handler = this.handlers.get(job.kind);
    if (!handler) {
      await this.repository.finish(job.id, 'FAILED', 'AI_UNAVAILABLE');
      return;
    }
    let seq = await this.repository.nextSeq(job.id);
    let pagesDone = job.pagesDone;
    const publish = async (status: AiJobStatus, item: (JobItemInput & { seq: number }) | null) =>
      this.realtime.publish(job.restaurantId, job.createdByUserId, {
        jobId: job.id,
        status,
        pagesDone,
        pagesTotal: job.pagesTotal,
        item: item
          ? { seq: item.seq, page: item.page, confidence: item.confidence, data: item.data }
          : null,
      });

    const context: JobRunContext = {
      job,
      signal: controller.signal,
      emit: async (item) => {
        const current = { ...item, seq: seq++ };
        await this.repository.addItem(job.id, current);
        await publish('RUNNING', current);
      },
      saveResult: async (result, done) => {
        pagesDone = done;
        await this.repository.saveProgress(job.id, { result, pagesDone: done });
        await publish('RUNNING', null);
      },
      recordUsage: (usage) => this.quota.recordTokens(job.restaurantId, job.kind, usage),
    };

    try {
      const outcome = await handler.run(context);
      if (controller.signal.aborted) return;
      await this.repository.finish(job.id, outcome.status, outcome.errorCode);
      await publish(outcome.status, null);
    } catch (error) {
      if (controller.signal.aborted) return;
      this.logger.error('AI job failed', {
        jobId: job.id,
        kind: job.kind,
        ...errorDiagnostics(error),
      });
      await this.repository.finish(job.id, 'FAILED', 'AI_UNAVAILABLE');
      await publish('FAILED', null);
    }
  }
}
