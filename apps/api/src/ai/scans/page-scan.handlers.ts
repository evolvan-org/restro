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
  /** How sure the model was of a mapped row; null for rows that don't count (headers, notes). */
  score(row: Record<string, unknown>): { confidence: number; priceDoubt: boolean } | null;
};

/** Rows held back at default detail before deciding whether the read is good enough to show. */
export const PROBATION_ROWS = 8;
/** Below this average row confidence, or above this share of price doubts, a read is poor. */
export const POOR_CONFIDENCE = 70;
export const POOR_PRICE_DOUBT_SHARE = 0.2;

export type RowStats = { rows: number; confidenceSum: number; priceDoubts: number };

/** A read is poor when its rows are, on average, doubtful (see the thresholds above). */
export function isPoorRead(stats: RowStats): boolean {
  if (stats.rows === 0) return false;
  return (
    stats.confidenceSum / stats.rows < POOR_CONFIDENCE ||
    stats.priceDoubts / stats.rows > POOR_PRICE_DOUBT_SHARE
  );
}

type HeldRow = { key: string; row: Record<string, unknown> | null };
type ReadOptions = { detail: 'default' | 'ultra'; probation: boolean };
type ReadOutcome =
  /** Finished; rows were saved and pushed. */
  | { kind: 'read'; stats: RowStats }
  /** The verdict stopped the read before any row: not this kind of document, or unreadable. */
  | { kind: 'stopped'; status: 'not_document' | 'unreadable'; quality: ScanPageResult['quality'] }
  /** The held rows were too doubtful; nothing was saved or shown. */
  | { kind: 'poor'; held: HeldRow[] };
type PageAttempt = ReadOutcome | { kind: 'failed'; unavailable: boolean } | { kind: 'aborted' };

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
   * One streamed read of a page.
   *
   * - With `probation`, the first rows are held back: if they turn out doubtful the read is
   *   aborted and the caller re-reads at more detail, so weak rows never reach the owner's screen.
   * - On a resumed attempt (after an interrupted stream) the model reads the page again from the
   *   top, so rows matching ones already handled (same content, counted so repeats on a menu
   *   survive) are skipped and only the rest are saved.
   */
  private async readPage(
    context: JobRunContext,
    reader: PageReader,
    image: { type: string; data: Buffer },
    pageResult: ScanPageResult,
    result: AiJobResult,
    handled: Map<string, number>,
    options: ReadOptions,
  ): Promise<ReadOutcome> {
    const skip = new Map(handled);
    const stream = new JsonArrayStream(reader.arrayKey);
    const expected = this.task === 'menu-page' ? 'menu' : 'invoice';
    const stats: RowStats = { rows: 0, confidenceSum: 0, priceDoubts: 0 };
    const held: HeldRow[] = [];
    let probation = options.probation;
    // Stops the request once the page-level verdict (or the held rows) say it isn't worth reading.
    const stop = new AbortController();
    let checking = true;
    const release = async (entry: HeldRow): Promise<void> => {
      handled.set(entry.key, (handled.get(entry.key) ?? 0) + 1);
      await this.saveRow(context, entry.row, pageResult, result);
    };

    for await (const chunk of this.provider.stream({
      task: this.task,
      model: this.model,
      fallbackModel: this.fallbackModel,
      system: this.system,
      prompt: this.prompt(pageResult.page, result.pages.length),
      images: [{ mimeType: image.type, data: image.data }],
      imageDetail: options.detail,
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
          // Not this kind of document, or unreadable: no rows are generated.
          stop.abort();
          return { kind: 'stopped', status: verdict.stop, quality: verdict.quality };
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
        const row = reader.map(raw, pageResult.page);
        const score = row ? reader.score(row) : null;
        if (score) {
          stats.rows += 1;
          stats.confidenceSum += score.confidence;
          if (score.priceDoubt) stats.priceDoubts += 1;
        }
        if (!probation) {
          await release({ key, row });
          continue;
        }
        held.push({ key, row });
        if (stats.rows >= PROBATION_ROWS) {
          if (isPoorRead(stats)) {
            stop.abort();
            return { kind: 'poor', held };
          }
          probation = false;
          for (const entry of held.splice(0)) await release(entry);
        }
      }
    }
    // A short page ends inside probation: judge what was held.
    if (probation && isPoorRead(stats)) return { kind: 'poor', held };
    for (const entry of held) await release(entry);

    const full = parseJsonObject(stream.fullText);
    reader.finish(full, result);
    pageResult.quality = pageQuality(full?.quality);
    pageResult.title = typeof full?.title === 'string' ? full.title.slice(0, 100) : null;
    if (pageResult.itemCount > 0) pageResult.status = 'done';
    else if (full && full.documentType !== expected) pageResult.status = 'not_document';
    else pageResult.status = 'unreadable';
    return { kind: 'read', stats };
  }

  private async saveRow(
    context: JobRunContext,
    row: Record<string, unknown> | null,
    pageResult: ScanPageResult,
    result: AiJobResult,
  ): Promise<void> {
    if (!row) {
      result.droppedRows += 1;
      return;
    }
    await context.emit({
      page: pageResult.page,
      confidence: Number(row.confidence ?? 0),
      data: row,
    });
    pageResult.itemCount += 1;
  }

  /** One read of a page, resuming interrupted streams (see `readPage`). */
  private async readWithResume(
    context: JobRunContext,
    reader: PageReader,
    image: { type: string; data: Buffer },
    pageResult: ScanPageResult,
    result: AiJobResult,
    options: ReadOptions,
  ): Promise<PageAttempt> {
    // Rows of this read already handled (saved or dropped), by content, across attempts.
    const handled = new Map<string, number>();
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.readPage(context, reader, image, pageResult, result, handled, options);
      } catch (error) {
        if (context.signal.aborted) return { kind: 'aborted' };
        if (error instanceof AiStreamInterruptedError && attempt < AI_STREAM_RESUME_ATTEMPTS) {
          this.logger.warn(
            `job=${context.job.id} page=${pageResult.page} stream interrupted after ${pageResult.itemCount} row(s); resuming (attempt ${attempt + 1})`,
          );
          await resumeDelay(attempt);
          continue;
        }
        return { kind: 'failed', unavailable: error instanceof AiUnavailableError };
      }
    }
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
      delete pageResult.retakeSuggested;
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

      // Default detail first; a poor or unreadable read is re-read once at extra detail.
      const first = await this.readWithResume(context, reader, image, pageResult, result, {
        detail: 'default',
        probation: true,
      });
      if (first.kind === 'aborted') break;
      let last: PageAttempt = first;
      if (first.kind === 'poor' || (first.kind === 'stopped' && first.status === 'unreadable')) {
        this.logger.log(
          `job=${job.id} page=${pageResult.page} ${first.kind === 'poor' ? 'doubtful rows' : 'unreadable'} at default detail; re-reading at ultra detail`,
        );
        last = await this.readWithResume(context, reader, image, pageResult, result, {
          detail: 'ultra',
          probation: false,
        });
        if (last.kind === 'aborted') break;
        if (first.kind === 'poor' && last.kind !== 'read') {
          // The re-read gave nothing better: keep the first read's rows, and suggest a retake.
          for (const entry of first.held) {
            await this.saveRow(context, entry.row, pageResult, result);
          }
          pageResult.status = pageResult.itemCount > 0 ? 'done' : 'unreadable';
          pageResult.quality = 'blurry';
          pageResult.retakeSuggested = pageResult.itemCount > 0;
          last = { kind: 'read', stats: { rows: 0, confidenceSum: 0, priceDoubts: 0 } };
        }
      }

      if (last.kind === 'read') {
        if (isPoorRead(last.stats) && pageResult.status === 'done')
          pageResult.retakeSuggested = true;
      } else if (last.kind === 'stopped') {
        pageResult.status = last.status;
        pageResult.quality = last.quality;
      } else if (last.kind === 'failed') {
        // Rows saved before the failure stay, but the page is incomplete: the owner retakes it.
        pageResult.status = 'failed';
        if (last.unavailable) unavailable = true;
      }
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
      // Every dish line counts, including ones flagged as a possible duplicate.
      score: (row) =>
        row.flag !== 'not_a_dish'
          ? {
              confidence: Number(row.confidence ?? 0),
              priceDoubt: Array.isArray(row.issues)
                ? row.issues.some((issue) => typeof issue === 'string' && /price/i.test(issue))
                : false,
            }
          : null,
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
      score: (row) => ({ confidence: Number(row.confidence ?? 0), priceDoubt: false }),
      map: (raw, page) => mapInvoiceLine(raw, page),
      finish: (full, result) => {
        result.invoiceHeader = mergeInvoiceHeader(result.invoiceHeader, full?.header);
      },
    });
  }
}
