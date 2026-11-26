import type { ConfigService } from '@nestjs/config';

import type {
  IngredientCatalogService,
  RecipeTemplateRepository,
} from '../catalog/ingredient-catalog.service';
import type { JobItemInput, JobRunContext } from '../jobs/ai-job-runner';
import type { AiJobRecord, AiJobResult, AiJobsRepository } from '../jobs/ai-jobs.repository';
import { AiStreamInterruptedError } from '../provider/ai-provider';
import { FakeProvider } from '../provider/fake.provider';
import { GeminiProvider } from '../provider/gemini.provider';
import type { ScanImageStore } from '../storage/scan-image.store';
import { InvoiceScanHandler, MenuScanHandler, rowKey } from './page-scan.handlers';
import { RecipeDraftHandler } from './recipe-draft.handler';

/*
 * Gemini sometimes closes a stream mid-response. Every scan kind must resume the read without
 * losing or duplicating rows (the `flaky` fake drops each request's first stream halfway).
 */

jest.setTimeout(20_000);

const config = { get: () => undefined } as unknown as ConfigService;
const images = {
  read: () => Promise.resolve({ type: 'image/jpeg', data: Buffer.from('photo') }),
} as unknown as ScanImageStore;
const repository = {
  items: () => Promise.resolve([]),
  deletePageItems: () => Promise.resolve(),
} as unknown as AiJobsRepository;

function job(kind: AiJobRecord['kind'], input: unknown = {}, pages = 1): AiJobRecord {
  const result: AiJobResult = {
    pages: Array.from({ length: pages }, (_, index) => ({
      page: index + 1,
      status: 'pending' as const,
      quality: null,
      itemCount: 0,
      title: null,
    })),
    invoiceHeader: null,
    droppedRows: 0,
  };
  return {
    id: 'job-1',
    restaurantId: 'restaurant-1',
    createdByUserId: 'user-1',
    kind,
    status: 'RUNNING',
    context: 'ONBOARDING',
    input,
    result,
    pagesTotal: pages,
    pagesDone: 0,
    errorCode: null,
    attempts: 1,
  } as AiJobRecord;
}

function context(record: AiJobRecord): {
  context: JobRunContext;
  items: JobItemInput[];
  result: () => AiJobResult;
} {
  const items: JobItemInput[] = [];
  let last = record.result;
  return {
    items,
    result: () => last,
    context: {
      job: record,
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
    },
  };
}

async function read(
  makeHandler: (provider: FakeProvider) => {
    run(context: JobRunContext): Promise<{ status: string }>;
  },
  kind: AiJobRecord['kind'],
): Promise<{ status: string; names: string[]; pageStatus: string | undefined }> {
  const run = async (scenario: 'ok' | 'flaky') => {
    const harness = context(job(kind));
    const outcome = await makeHandler(new FakeProvider(scenario, 0)).run(harness.context);
    const names = harness.items.map((item) =>
      String(item.data.name ?? item.data.description ?? ''),
    );
    return { status: outcome.status, names, pageStatus: harness.result().pages[0]?.status };
  };
  const [clean, flaky] = [await run('ok'), await run('flaky')];
  // The resumed read must produce exactly what an uninterrupted read produces.
  expect(flaky.names).toEqual(clean.names);
  return flaky;
}

describe('resuming interrupted AI streams', () => {
  it('menu scan: re-reads the page and saves each row once', async () => {
    const result = await read(
      (provider) => new MenuScanHandler(provider, images, repository, config),
      'MENU_SCAN',
    );
    expect(result.status).toBe('SUCCEEDED');
    expect(result.pageStatus).toBe('done');
    expect(result.names.length).toBeGreaterThan(3);
  });

  it('invoice scan: re-reads the page and saves each line once', async () => {
    const result = await read(
      (provider) => new InvoiceScanHandler(provider, images, repository, config),
      'INVOICE_SCAN',
    );
    expect(result.status).toBe('SUCCEEDED');
    expect(result.names.length).toBeGreaterThan(1);
  });

  it('recipe drafts: asks again only for the dishes the stream did not reach', async () => {
    const dishes = ['Paneer Tikka', 'Dal Makhani', 'Jeera Rice', 'Butter Naan', 'Masala Chai'].map(
      (name, index) => ({
        ref: `d${index}`,
        name,
        category: 'Mains',
        type: 'KITCHEN' as const,
        dietType: 'VEG' as const,
      }),
    );
    const harness = context(job('RECIPE_DRAFT', { portionStyle: 'STANDARD', dishes }));
    // Each request's prompt, with the dishes already drafted when it was sent.
    const calls: { prompt: string; draftedBefore: string[] }[] = [];
    const provider = new FakeProvider('flaky', 0);
    const stream = provider.stream.bind(provider);
    provider.stream = (request) => {
      calls.push({
        prompt: request.prompt,
        draftedBefore: harness.items.map((item) => String(item.data.dishRef)),
      });
      return stream(request);
    };
    const handler = new RecipeDraftHandler(
      provider,
      repository,
      {
        canonicalNames: () => Promise.resolve([]),
        canonicalizeLines: (lines: unknown) => Promise.resolve(lines),
      } as unknown as IngredientCatalogService,
      {
        find: () => Promise.resolve(null),
        save: () => Promise.resolve(),
      } as unknown as RecipeTemplateRepository,
      config,
    );

    const outcome = await handler.run(harness.context);

    expect(outcome.status).toBe('SUCCEEDED');
    const refs = harness.items.map((item) => String(item.data.dishRef));
    expect([...refs].sort()).toEqual(dishes.map((dish) => dish.ref));
    // No dish fell back to the empty "couldn't draft" placeholder.
    expect(harness.items.every((item) => (item.data.lines as unknown[]).length > 0)).toBe(true);
    // The resumed request names only the dishes that weren't drafted before the drop.
    expect(calls).toHaveLength(2);
    const resumed = calls[1]!;
    expect(resumed.draftedBefore.length).toBeGreaterThan(0);
    for (const dish of dishes) {
      expect(resumed.prompt.includes(`- ref ${dish.ref}:`)).toBe(
        !resumed.draftedBefore.includes(dish.ref),
      );
    }
  });

  it('gives up after four interrupted reads and keeps the page marked failed', async () => {
    const provider = new FakeProvider('ok', 0);
    // eslint-disable-next-line require-yield
    provider.stream = async function* () {
      yield { text: '{"documentType":"menu","quality":"ok","rows":[' };
      throw new AiStreamInterruptedError('dropped');
    };
    const harness = context(job('MENU_SCAN'));
    const outcome = await new MenuScanHandler(provider, images, repository, config).run(
      harness.context,
    );
    expect(outcome).toEqual({ status: 'FAILED', errorCode: 'AI_UNAVAILABLE' });
    expect(harness.result().pages[0]?.status).toBe('failed');
  });
});

describe('Gemini overload fallback', () => {
  it('switches to the fallback model after a 503 and stays on it while cooling down', async () => {
    const provider = new GeminiProvider('test-key');
    const models: string[] = [];
    const generateContentStream = jest.fn((request: { model: string }) => {
      models.push(request.model);
      if (models.length === 1) {
        return Promise.reject(Object.assign(new Error('high demand'), { status: 503 }));
      }
      return Promise.resolve(
        (async function* () {
          yield { text: '{"rows":[]}', usageMetadata: { promptTokenCount: 1 } };
        })(),
      );
    });
    (provider as unknown as { client: { models: unknown } }).client.models = {
      generateContentStream,
    };
    const request = {
      task: 'menu-page' as const,
      model: 'primary',
      fallbackModel: 'fallback',
      system: '',
      prompt: '',
      responseSchema: {},
    };

    await provider.generate(request);
    await provider.generate(request);

    expect(models).toEqual(['primary', 'fallback', 'fallback']);
  });
});

describe('rowKey', () => {
  it('ignores case and spacing but not content', () => {
    const fields = ['name', 'price'];
    expect(rowKey({ name: ' Paneer  Tikka', price: '220' }, fields)).toBe(
      rowKey({ name: 'paneer tikka', price: '220' }, fields),
    );
    expect(rowKey({ name: 'Paneer Tikka', price: '220' }, fields)).not.toBe(
      rowKey({ name: 'Paneer Tikka', price: '240' }, fields),
    );
  });
});
