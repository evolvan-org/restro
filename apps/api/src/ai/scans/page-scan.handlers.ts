import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type AiJobErrorCode,
  type AiJobKind,
  dishKey,
  menuScanRowSchema,
  type ScanPageResult,
} from '@rms/api-contract';

import type { AiJobHandler, JobOutcome, JobRunContext } from '../jobs/ai-job-runner';
import type { AiJobRecord, AiJobResult } from '../jobs/ai-jobs.repository';
import { AiJobsRepository } from '../jobs/ai-jobs.repository';
import {
  INVOICE_SCHEMA,
  INVOICE_SYSTEM,
  invoicePagePrompt,
  MENU_SCHEMA,
  MENU_SYSTEM,
  menuPagePrompt,
} from '../prompts/prompts';
import {
  AI_PROVIDER,
  AI_STREAM_RESUME_ATTEMPTS,
  type AiProvider,
  AiStreamInterruptedError,
  AiUnavailableError,
  resumeDelay,
} from '../provider/ai-provider';
import { ScanImageStore } from '../storage/scan-image.store';
import { JsonArrayStream, parseJsonObject } from '../streaming/json-array-stream';
import { mapInvoiceLine, mapMenuRow, mergeInvoiceHeader } from './row-mapping';

type PageReader = {
  /** Element key of the streamed array. */
  arrayKey: string;
  /** Maps one raw element; null drops it. */
  map(raw: Record<string, unknown>, page: number): Record<string, unknown> | null;
  /** Reads the page-level fields once the page's JSON is complete. */
  finish(full: Record<string, unknown> | null, result: AiJobResult): void;
  /**
   * Fields that identify a row when an interrupted page is read again. Kept to what any model
   * reads the same way: kind, category and raw text vary when the fallback model does the re-read.
   */
  keyFields: readonly string[];
};

const UNUSABLE_QUALITY = new Set(['blurry', 'cluttered', 'unreadable']);

function pageQuality(value: unknown): ScanPageResult['quality'] {
  if (value === 'unreadable') return 'blurry';
  return value === 'blurry' || value === 'cropped' || value === 'dark' || value === 'cluttered'
    ? value
    : 'ok';
}

/**
 * Reads the page-level fields (`documentType`, `quality`) from the start of a streamed response.
 * `stop` is set as soon as the page is known to be unusable; `decided` once it is known to be
 * fine (both fields seen, or rows already started).
 */
export function pageVerdict(
  text: string,
  expected: 'menu' | 'invoice',
  arrayKey: string,
): {
  stop: 'not_document' | 'unreadable' | null;
  quality: ScanPageResult['quality'];
  decided: boolean;
} {
  const documentType = /"documentType"\s*:\s*"(\w+)"/.exec(text)?.[1];
  const quality = /"quality"\s*:\s*"(\w+)"/.exec(text)?.[1];
  if (documentType && documentType !== expected) {
    return { stop: 'not_document', quality: quality ? pageQuality(quality) : null, decided: true };
  }
  if (quality && UNUSABLE_QUALITY.has(quality)) {
    return { stop: 'unreadable', quality: pageQuality(quality), decided: true };
  }
  const decided = Boolean(documentType && quality) || text.includes(`"${arrayKey}"`);
  return { stop: null, quality: null, decided };
}

/** Content key of a raw row: the identifying fields, whitespace- and case-insensitive. */
export function rowKey(raw: Record<string, unknown>, fields: readonly string[]): string {
  const normalize = (value: unknown): unknown =>
    typeof value === 'string'
      ? value.trim().replace(/\s+/g, ' ').toLowerCase()
      : Array.isArray(value)
        ? value.map(normalize)
        : value && typeof value === 'object'
          ? Object.fromEntries(
              Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, normalize(v)]),
            )
          : (value ?? null);
  return JSON.stringify(fields.map((field) => normalize(raw[field])));
}

/**
 * Shared page-by-page reading for menu and invoice scans. Each pending page is read with one
 * streamed call; rows are saved and pushed as they arrive. Pages a restart interrupted, or that
 * the owner retook, are read again from scratch.
 */
abstract class PageScanHandler implements AiJobHandler {
  abstract readonly kind: AiJobKind;
  protected abstract readonly model: string;
  protected abstract readonly fallbackModel: string | undefined;
  protected abstract readonly system: string;
  protected abstract readonly schema: Record<string, unknown>;
  protected abstract readonly task: 'menu-page' | 'invoice-page';
  protected abstract readonly wrongDocument: AiJobErrorCode;
  protected abstract prompt(page: number, pages: number): string;
  protected abstract reader(job: AiJobRecord): Promise<PageReader>;

  private readonly logger = new Logger(PageScanHandler.name);

  constructor(
    protected readonly provider: AiProvider,
    protected readonly images: ScanImageStore,
    protected readonly repository: AiJobsRepository,
  ) {}

  /**
   * One streamed read of a page. On a resumed attempt the model reads the page again from the top,
   * so rows matching ones already handled (same content, counted so repeats on a menu survive)
   * are skipped and only the rest are saved.
   */
  private async readPage(
    context: JobRunContext,
    reader: PageReader,
    image: { type: string; data: Buffer },
    pageResult: ScanPageResult,
    result: AiJobResult,
    handled: Map<string, number>,
  ): Promise<void> {
    const skip = new Map(handled);
    const stream = new JsonArrayStream(reader.arrayKey);
    const expected = this.task === 'menu-page' ? 'menu' : 'invoice';
    // Stops the request once the page-level verdict says the page isn't worth reading.
    const stop = new AbortController();
    let checking = true;
    for await (const chunk of this.provider.stream({
      task: this.task,
      model: this.model,
      fallbackModel: this.fallbackModel,
      system: this.system,
      prompt: this.prompt(pageResult.page, result.pages.length),
      images: [{ mimeType: image.type, data: image.data }],
      responseSchema: this.schema,
      signal: AbortSignal.any([context.signal, stop.signal]),
    })) {
      if ('usage' in chunk) {
        await context.recordUsage(chunk.usage);
        continue;
      }
      const elements = stream.push(chunk.text);
      if (checking) {
        const verdict = pageVerdict(stream.fullText, expected, reader.arrayKey);
        if (verdict.stop) {
          // Unusable page (not a real menu / invoice, blurry, cluttered): no rows are generated.
          stop.abort();
          pageResult.status = verdict.stop;
          pageResult.quality = verdict.quality;
          return;
        }
        checking = !verdict.decided;
      }
      for (const element of elements) {
        const raw = element as Record<string, unknown>;
        const key = rowKey(raw, reader.keyFields);
        const pending = skip.get(key) ?? 0;
        if (pending > 0) {
          skip.set(key, pending - 1);
          continue;
        }
        handled.set(key, (handled.get(key) ?? 0) + 1);
        const row = reader.map(raw, pageResult.page);
        if (!row) {
          result.droppedRows += 1;
          continue;
        }
        await context.emit({
          page: pageResult.page,
          confidence: Number(row.confidence ?? 0),
          data: row,
        });
        pageResult.itemCount += 1;
      }
    }
    const full = parseJsonObject(stream.fullText);
    reader.finish(full, result);
    const quality = full?.quality;
    pageResult.quality = pageQuality(quality);
    pageResult.title = typeof full?.title === 'string' ? full.title.slice(0, 100) : null;
    if (pageResult.itemCount > 0) pageResult.status = 'done';
    else if (full && full.documentType !== (this.task === 'menu-page' ? 'menu' : 'invoice')) {
      pageResult.status = 'not_document';
    } else pageResult.status = 'unreadable';
  }

  async run(context: JobRunContext): Promise<JobOutcome> {
    const { job } = context;
    const result: AiJobResult = structuredClone(job.result);
    const reader = await this.reader(job);
    let unavailable = false;

    for (const pageResult of result.pages) {
      if (pageResult.status !== 'pending' && pageResult.status !== 'reading') continue;
      if (context.signal.aborted) break;
      if (pageResult.status === 'reading')
        await this.repository.deletePageItems(job.id, pageResult.page);
      Object.assign(pageResult, { status: 'reading', itemCount: 0, quality: null, title: null });
      await context.saveResult(result, doneCount(result.pages));

      const image = await this.images.read(job.restaurantId, job.id, pageResult.page);
      if (!image) {
        pageResult.status = 'failed';
        await context.saveResult(result, doneCount(result.pages));
        continue;
      }
      if (unavailable) {
        pageResult.status = 'failed';
        continue;
      }

      // Rows of this page already handled (saved or dropped), by content, across attempts.
      const handled = new Map<string, number>();
      for (let attempt = 1; ; attempt += 1) {
        try {
          await this.readPage(context, reader, image, pageResult, result, handled);
          break;
        } catch (error) {
          if (context.signal.aborted) break;
          if (error instanceof AiStreamInterruptedError && attempt < AI_STREAM_RESUME_ATTEMPTS) {
            this.logger.warn(
              `job=${job.id} page=${pageResult.page} stream interrupted after ${pageResult.itemCount} row(s); resuming (attempt ${attempt + 1})`,
            );
            await resumeDelay(attempt);
            continue;
          }
          // Rows saved before the failure stay, but the page is incomplete: the owner retakes it.
          pageResult.status = 'failed';
          if (error instanceof AiUnavailableError) unavailable = true;
          break;
        }
      }
      if (context.signal.aborted) break;
      await context.saveResult(result, doneCount(result.pages));
    }

    return outcome(result.pages, unavailable, this.wrongDocument);
  }
}

function doneCount(pages: readonly ScanPageResult[]): number {
  return pages.filter((page) => page.status !== 'pending' && page.status !== 'reading').length;
}

function outcome(
  pages: readonly ScanPageResult[],
  unavailable: boolean,
  wrongDocument: AiJobErrorCode,
): JobOutcome {
  const read = pages.filter((page) => page.status === 'done').length;
  if (read === pages.length) return { status: 'SUCCEEDED', errorCode: null };
  if (read > 0) return { status: 'PARTIAL', errorCode: unavailable ? 'AI_UNAVAILABLE' : null };
  if (unavailable) return { status: 'FAILED', errorCode: 'AI_UNAVAILABLE' };
  if (pages.every((page) => page.status === 'not_document')) {
    return { status: 'FAILED', errorCode: wrongDocument };
  }
  return { status: 'FAILED', errorCode: 'UNREADABLE' };
}

@Injectable()
export class MenuScanHandler extends PageScanHandler {
  readonly kind = 'MENU_SCAN' as const;
  protected readonly system = MENU_SYSTEM;
  protected readonly schema = MENU_SCHEMA;
  protected readonly task = 'menu-page' as const;
  protected readonly wrongDocument = 'NOT_A_MENU' as const;
  protected readonly model: string;
  protected readonly fallbackModel: string | undefined;

  constructor(
    @Inject(AI_PROVIDER) provider: AiProvider,
    images: ScanImageStore,
    repository: AiJobsRepository,
    config: ConfigService,
  ) {
    super(provider, images, repository);
    this.model = config.get<string>('AI_MODEL_MENU') ?? 'gemini-3.5-flash-lite';
    this.fallbackModel = config.get<string>('AI_MODEL_MENU_FALLBACK');
  }

  protected prompt(page: number, pages: number): string {
    return menuPagePrompt(page, pages);
  }

  protected async reader(job: AiJobRecord): Promise<PageReader> {
    // Duplicate detection spans pages, including rows read before a restart or retake.
    const seen = new Map<string, string>();
    for (const item of await this.repository.items(job.id)) {
      const row = menuScanRowSchema.safeParse(item.data);
      if (row.success && row.data.flag === 'dish') seen.set(dishKey(row.data.name), row.data.name);
    }
    return {
      arrayKey: 'rows',
      keyFields: ['name', 'price'],
      map: (raw, page) => mapMenuRow(raw, page, dishKey, seen),
      finish: () => undefined,
    };
  }
}

@Injectable()
export class InvoiceScanHandler extends PageScanHandler {
  readonly kind = 'INVOICE_SCAN' as const;
  protected readonly system = INVOICE_SYSTEM;
  protected readonly schema = INVOICE_SCHEMA;
  protected readonly task = 'invoice-page' as const;
  protected readonly wrongDocument = 'NOT_AN_INVOICE' as const;
  protected readonly model: string;
  protected readonly fallbackModel: string | undefined;

  constructor(
    @Inject(AI_PROVIDER) provider: AiProvider,
    images: ScanImageStore,
    repository: AiJobsRepository,
    config: ConfigService,
  ) {
    super(provider, images, repository);
    this.model = config.get<string>('AI_MODEL_INVOICE') ?? 'gemini-3.8-flash';
    this.fallbackModel = config.get<string>('AI_MODEL_INVOICE_FALLBACK');
  }

  protected prompt(page: number, pages: number): string {
    return invoicePagePrompt(page, pages);
  }

  protected reader(): Promise<PageReader> {
    return Promise.resolve({
      arrayKey: 'lines',
      keyFields: ['description', 'amount'],
      map: (raw, page) => mapInvoiceLine(raw, page),
      finish: (full, result) => {
        result.invoiceHeader = mergeInvoiceHeader(result.invoiceHeader, full?.header);
      },
    });
  }
}
