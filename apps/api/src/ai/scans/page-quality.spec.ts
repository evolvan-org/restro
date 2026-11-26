import type { ConfigService } from '@nestjs/config';

import type { JobItemInput } from '../jobs/ai-job-runner';
import type { AiJobRecord, AiJobResult, AiJobsRepository } from '../jobs/ai-jobs.repository';
import type { AiRequest, AiStreamChunk } from '../provider/ai-provider';
import { FakeProvider } from '../provider/fake.provider';
import { imageDimensions, type ScanImageStore } from '../storage/scan-image.store';
import { InvoiceScanHandler, MenuScanHandler, pageVerdict } from './page-scan.handlers';

/*
 * Unusable pages must cost as little as possible: the read stops as soon as the model's page-level
 * verdict says the page isn't a real menu / invoice, or is too blurry or cluttered to read.
 */

const config = { get: () => undefined } as unknown as ConfigService;
const images = {
  read: () => Promise.resolve({ type: 'image/jpeg', data: Buffer.from('photo') }),
} as unknown as ScanImageStore;
const repository = {
  items: () => Promise.resolve([]),
  deletePageItems: () => Promise.resolve(),
} as unknown as AiJobsRepository;

function job(kind: AiJobRecord['kind']): AiJobRecord {
  return {
    id: 'job-1',
    restaurantId: 'restaurant-1',
    kind,
    input: {},
    result: {
      pages: [{ page: 1, status: 'pending', quality: null, itemCount: 0, title: null }],
      invoiceHeader: null,
      droppedRows: 0,
    },
  } as unknown as AiJobRecord;
}

/** A provider that streams `head`, then rows forever, counting how many chunks were taken. */
function scripted(head: string): {
  provider: FakeProvider;
  taken: () => number;
  aborted: () => boolean;
} {
  let taken = 0;
  let signal: AbortSignal | undefined;
  const provider = new FakeProvider('ok', 0);
  provider.stream = async function* (request: AiRequest): AsyncIterable<AiStreamChunk> {
    signal = request.signal;
    const chunks = [head, ...Array.from({ length: 50 }, () => '{"name":"Dish","price":"100"},')];
    for (const text of chunks) {
      if (request.signal?.aborted) return;
      taken += 1;
      yield { text };
    }
  };
  return { provider, taken: () => taken, aborted: () => signal?.aborted ?? false };
}

async function run(
  handler: MenuScanHandler | InvoiceScanHandler,
  kind: AiJobRecord['kind'],
): Promise<{
  status: string;
  errorCode: string | null;
  page: AiJobResult['pages'][number];
  items: JobItemInput[];
}> {
  const items: JobItemInput[] = [];
  let last = job(kind).result;
  const outcome = await handler.run({
    job: job(kind),
    signal: new AbortController().signal,
    emit: (item) => {
      items.push(item);
      return Promise.resolve();
    },
    saveResult: (result) => {
      last = structuredClone(result);
      return Promise.resolve();
    },
    recordUsage: () => Promise.resolve(),
  });
  return { ...outcome, page: last.pages[0]!, items };
}

describe('stopping reads of unusable pages', () => {
  it('stops a cluttered menu page before any row is generated', async () => {
    const { provider, taken, aborted } = scripted(
      '{"documentType":"menu","quality":"cluttered","title":null,"rows":[',
    );
    const result = await run(
      new MenuScanHandler(provider, images, repository, config),
      'MENU_SCAN',
    );

    expect(result).toMatchObject({ status: 'FAILED', errorCode: 'UNREADABLE' });
    expect(result.page).toMatchObject({ status: 'unreadable', quality: 'cluttered' });
    expect(result.items).toHaveLength(0);
    expect(taken()).toBe(1);
    expect(aborted()).toBe(true);
  });

  it('stops a template / sample menu (documentType other) as not a menu', async () => {
    const { provider, taken } = scripted('{"documentType":"other","quality":"ok","rows":[');
    const result = await run(
      new MenuScanHandler(provider, images, repository, config),
      'MENU_SCAN',
    );

    expect(result).toMatchObject({ status: 'FAILED', errorCode: 'NOT_A_MENU' });
    expect(result.page.status).toBe('not_document');
    expect(taken()).toBe(1);
  });

  it('stops a blurry invoice even when the verdict arrives split across chunks', async () => {
    let taken = 0;
    const provider = new FakeProvider('ok', 0);
    provider.stream = async function* (): AsyncIterable<AiStreamChunk> {
      for (const text of ['{"documentType":"invo', 'ice","qual', 'ity":"blurry","lines":[', '{}']) {
        taken += 1;
        yield { text };
      }
    };
    const result = await run(
      new InvoiceScanHandler(provider, images, repository, config),
      'INVOICE_SCAN',
    );

    expect(result.page).toMatchObject({ status: 'unreadable', quality: 'blurry' });
    expect(taken).toBe(3);
  });

  it('reads a good page in full', async () => {
    const result = await run(
      new MenuScanHandler(new FakeProvider('ok', 0), images, repository, config),
      'MENU_SCAN',
    );
    expect(result.status).toBe('SUCCEEDED');
    expect(result.items.length).toBeGreaterThan(3);
  });
});

describe('pageVerdict', () => {
  it('waits until it knows, then decides', () => {
    expect(pageVerdict('{"documentType":"menu"', 'menu', 'rows')).toMatchObject({
      stop: null,
      decided: false,
    });
    expect(pageVerdict('{"documentType":"menu","quality":"ok"', 'menu', 'rows')).toMatchObject({
      stop: null,
      decided: true,
    });
    expect(pageVerdict('{"documentType":"menu","rows":[', 'menu', 'rows').decided).toBe(true);
  });

  it('maps the model’s "unreadable" to blurry and a wrong document to not_document', () => {
    expect(pageVerdict('{"quality":"unreadable"', 'menu', 'rows')).toMatchObject({
      stop: 'unreadable',
      quality: 'blurry',
    });
    expect(pageVerdict('{"documentType":"menu"', 'invoice', 'lines').stop).toBe('not_document');
  });
});

describe('imageDimensions', () => {
  it('reads PNG, JPEG and WebP headers', () => {
    const png = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
    png.write('IHDR', 12, 'ascii');
    png.writeUInt32BE(612, 16);
    png.writeUInt32BE(432, 20);
    expect(imageDimensions(png, 'image/png')).toEqual({ width: 612, height: 432 });

    // SOI, an APP0 segment to skip, then SOF0 with height 1500 / width 2000.
    const jpeg = Buffer.from([
      0xff,
      0xd8,
      0xff,
      0xe0,
      0x00,
      0x10,
      ...Array<number>(14).fill(0),
      0xff,
      0xc0,
      0x00,
      0x11,
      0x08,
      0x05,
      0xdc,
      0x07,
      0xd0,
      0x03,
      ...Array<number>(9).fill(0),
    ]);
    expect(imageDimensions(jpeg, 'image/jpeg')).toEqual({ width: 2000, height: 1500 });

    const webp = Buffer.alloc(30);
    webp.write('RIFF', 0, 'ascii');
    webp.write('WEBPVP8X', 8, 'ascii');
    webp.writeUIntLE(1999, 24, 3);
    webp.writeUIntLE(1499, 27, 3);
    expect(imageDimensions(webp, 'image/webp')).toEqual({ width: 2000, height: 1500 });
  });

  it('gives up on a header it cannot read', () => {
    expect(imageDimensions(Buffer.from([0xff, 0xd8, 0x00, 0x00]), 'image/jpeg')).toBeNull();
  });
});
