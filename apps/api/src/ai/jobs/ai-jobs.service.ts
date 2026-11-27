import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  type AiJob,
  type AiJobDetailResponse,
  type AiUsageResponse,
  API_ERROR_CODES,
  type CreateRecipeDraftRequest,
  type CreateScanFields,
  SCAN_MAX_PAGE_BYTES,
  SCAN_MAX_PAGES,
  SCAN_MIN_SHORT_EDGE,
} from '@rms/api-contract';
import { Permission } from '@rms/permissions';

import { actorCan } from '../../common/auth/actor-permissions';
import type { Actor } from '../../common/auth/authenticated-request';
import { errorDiagnostics } from '../../common/logging/error-diagnostics';
import { IngredientCatalogService } from '../catalog/ingredient-catalog.service';
import { AI_PROVIDER, type AiProvider } from '../provider/ai-provider';
import {
  detectImageType,
  imageDimensions,
  ScanImageStore,
  type ScanImageType,
} from '../storage/scan-image.store';
import { AiQuotaService } from '../usage/ai-quota.service';
import { AiJobRunner } from './ai-job-runner';
import { type AiJobRecord, AiJobsRepository } from './ai-jobs.repository';

export type UploadedPage = { buffer: Buffer; size: number };
type ScanKind = 'MENU_SCAN' | 'INVOICE_SCAN';

const SCAN_PERMISSION: Record<ScanKind, Permission> = {
  MENU_SCAN: Permission.MENU_SCAN,
  INVOICE_SCAN: Permission.INVENTORY_SCAN_INVOICE,
};

function unavailable(): HttpException {
  return new HttpException(
    {
      message:
        'Photo reading is unavailable right now. Import a CSV or add items by hand; nothing is lost.',
      error: 'Service Unavailable',
      code: API_ERROR_CODES.AI_UNAVAILABLE,
    },
    HttpStatus.SERVICE_UNAVAILABLE,
  );
}

function checkPages(
  files: readonly UploadedPage[] | undefined,
): { type: ScanImageType; data: Buffer }[] {
  if (!files?.length) throw new BadRequestException('Add at least one photo');
  if (files.length > SCAN_MAX_PAGES)
    throw new BadRequestException(`Add at most ${SCAN_MAX_PAGES} pages`);
  return files.map((file, index) => {
    if (file.size > SCAN_MAX_PAGE_BYTES) {
      throw new BadRequestException(
        `Page ${index + 1} is larger than ${SCAN_MAX_PAGE_BYTES / 1024 / 1024} MB`,
      );
    }
    const type = detectImageType(file.buffer);
    if (!type) throw new BadRequestException(`Page ${index + 1} is not a JPG, PNG or WebP image`);
    // Refused before any quota or AI tokens are used: text this small can't be read reliably.
    const size = imageDimensions(file.buffer, type);
    if (!size) throw new BadRequestException(`Page ${index + 1} could not be opened`);
    if (Math.min(size.width, size.height) < SCAN_MIN_SHORT_EDGE) {
      throw new BadRequestException(
        `Page ${index + 1} is too small to read (${size.width}×${size.height}). Retake it closer so the page fills the frame.`,
      );
    }
    return { type, data: file.buffer };
  });
}

/** Contract view of a job. */
export function toAiJob(job: AiJobRecord, itemCount: number): AiJob {
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    context: job.context,
    pagesTotal: job.pagesTotal,
    pagesDone: job.pagesDone,
    itemCount,
    errorCode: job.errorCode,
    pages: job.result.pages,
    invoiceHeader: job.result.invoiceHeader,
    droppedRows: job.result.droppedRows,
    imagesAvailable: job.kind !== 'RECIPE_DRAFT' && job.imagesPurgedAt === null,
    createdAt: job.createdAt.toISOString(),
    finishedAt: job.finishedAt?.toISOString() ?? null,
  };
}

@Injectable()
export class AiJobsService {
  private readonly logger = new Logger(AiJobsService.name);

  constructor(
    private readonly repository: AiJobsRepository,
    private readonly runner: AiJobRunner,
    private readonly images: ScanImageStore,
    private readonly quota: AiQuotaService,
    private readonly catalog: IngredientCatalogService,
    @Inject(AI_PROVIDER) private readonly provider: AiProvider,
  ) {}

  usage(actor: Actor): Promise<AiUsageResponse> {
    return this.quota.summary(actor.restaurantId, this.provider.isAvailable());
  }

  async createScan(
    actor: Actor,
    kind: ScanKind,
    files: readonly UploadedPage[] | undefined,
    fields: CreateScanFields,
  ): Promise<AiJobDetailResponse> {
    if (!this.provider.isAvailable()) throw unavailable();
    const pages = checkPages(files);
    if (fields.pageInfo.length !== pages.length) {
      throw new BadRequestException('Send one page entry per uploaded photo');
    }
    await this.quota.reserve(actor.restaurantId, kind);

    // Photos go to disk before the job row exists, so the runner can never claim it early.
    const jobId = randomUUID();
    let job: AiJobRecord;
    try {
      for (const [index, page] of pages.entries()) {
        await this.images.save(actor.restaurantId, jobId, index + 1, page.type, page.data);
      }
      job = await this.repository.create({
        id: jobId,
        restaurantId: actor.restaurantId,
        userId: actor.userId,
        kind,
        context: fields.context,
        input: { pages: fields.pageInfo },
        pagesTotal: pages.length,
        result: {
          pages: pages.map((_, index) => ({
            page: index + 1,
            status: 'pending',
            quality: null,
            itemCount: 0,
            title: null,
          })),
          invoiceHeader: null,
          droppedRows: 0,
        },
      });
    } catch (error) {
      await this.quota.release(actor.restaurantId, kind);
      await this.images.purge(actor.restaurantId, jobId).catch(() => undefined);
      throw error;
    }
    this.runner.kick();
    return { job: toAiJob(job, 0), items: [] };
  }

  /** Replaces one page's photo and reads it again (rows from the old photo are dropped). */
  async retakePage(
    actor: Actor,
    kind: ScanKind,
    jobId: string,
    page: number,
    file: UploadedPage | undefined,
  ): Promise<AiJobDetailResponse> {
    if (!this.provider.isAvailable()) throw unavailable();
    const job = await this.requireJob(actor, jobId);
    if (job.kind !== kind) throw new NotFoundException('Scan not found');
    if (job.status === 'QUEUED' || job.status === 'RUNNING') {
      throw new ConflictException('Wait for the current read to finish, then retake the page');
    }
    if (job.imagesPurgedAt) throw new ConflictException('This scan is closed. Start a new scan.');
    const pageResult = job.result.pages.find((entry) => entry.page === page);
    if (!pageResult) throw new BadRequestException('That page is not part of this scan');
    const [image] = checkPages(file ? [file] : undefined);

    await this.images.save(actor.restaurantId, job.id, page, image!.type, image!.data);
    await this.repository.deletePageItems(job.id, page);
    Object.assign(pageResult, { status: 'pending', quality: null, itemCount: 0, title: null });
    await this.repository.requeue(job.id, job.result);
    this.runner.kick();
    return this.detail(actor, job.id, -1);
  }

  async createRecipeDraft(
    actor: Actor,
    input: CreateRecipeDraftRequest,
  ): Promise<AiJobDetailResponse> {
    if (!this.provider.isAvailable()) throw unavailable();
    const refs = new Set(input.dishes.map((dish) => dish.ref));
    if (refs.size !== input.dishes.length)
      throw new BadRequestException('Each dish needs its own ref');
    const job = await this.repository.create({
      restaurantId: actor.restaurantId,
      userId: actor.userId,
      kind: 'RECIPE_DRAFT',
      context: input.context,
      input: { portionStyle: input.portionStyle, dishes: input.dishes },
      pagesTotal: input.dishes.length,
    });
    this.runner.kick();
    return { job: toAiJob(job, 0), items: [] };
  }

  async detail(actor: Actor, jobId: string, afterSeq: number): Promise<AiJobDetailResponse> {
    const job = await this.requireJob(actor, jobId);
    const [items, count] = await Promise.all([
      this.repository.items(job.id, afterSeq),
      this.repository.itemCount(job.id),
    ]);
    return {
      job: toAiJob(job, count),
      items: items.map((item) => ({
        seq: item.seq,
        page: item.page,
        confidence: item.confidence,
        data: (item.data ?? {}) as Record<string, unknown>,
      })),
    };
  }

  async pageImage(
    actor: Actor,
    jobId: string,
    page: number,
  ): Promise<{ type: ScanImageType; data: Buffer }> {
    const job = await this.requireJob(actor, jobId);
    const image = job.imagesPurgedAt
      ? null
      : await this.images.read(job.restaurantId, job.id, page);
    if (!image) throw new NotFoundException('This photo is no longer available');
    return image;
  }

  async cancel(actor: Actor, jobId: string, purge: boolean): Promise<AiJobDetailResponse> {
    const job = await this.requireJob(actor, jobId);
    await this.repository.cancel(job.id);
    this.runner.abort(job.id);
    if (purge) await this.purge([job]);
    return this.detail(actor, jobId, -1);
  }

  /** The owner is done with these scans (imported, saved or discarded): delete their photos. */
  async release(actor: Actor, jobId: string): Promise<void> {
    const job = await this.requireJob(actor, jobId);
    if (job.status === 'QUEUED' || job.status === 'RUNNING') {
      await this.repository.cancel(job.id);
      this.runner.abort(job.id);
    }
    await this.purge([job]);
  }

  /** Called after setup / an import / a receipt is saved. Never fails the caller. */
  async purgeAfterUse(restaurantId: string, jobIds: readonly string[]): Promise<void> {
    try {
      await this.purge(await this.repository.ownedScanJobs(restaurantId, jobIds));
    } catch (error) {
      this.logger.warn('Could not delete used scan photos', errorDiagnostics(error));
    }
  }

  async purge(jobs: readonly { id: string; restaurantId: string }[]): Promise<void> {
    for (const job of jobs) await this.images.purge(job.restaurantId, job.id);
    await this.repository.markImagesPurged(jobs.map((job) => job.id));
  }

  /** Same restaurant, and the person who started it (or the owner / someone allowed to scan). */
  private async requireJob(actor: Actor, jobId: string): Promise<AiJobRecord> {
    const job = await this.repository.find(actor.restaurantId, jobId);
    if (!job) throw new NotFoundException('Scan not found');
    const allowed =
      job.createdByUserId === actor.userId ||
      actor.isOwner ||
      (job.kind === 'RECIPE_DRAFT'
        ? actorCan(actor, Permission.MENU_WRITE)
        : actorCan(actor, SCAN_PERMISSION[job.kind]));
    if (!allowed) throw new ForbiddenException('You cannot open this scan');
    return job;
  }
}
