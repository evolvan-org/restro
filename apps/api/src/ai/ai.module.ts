import { Module, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthorizationModule } from '../common/auth/authorization.module';
import { DatabaseModule } from '../common/database/database.module';
import { AiController } from './ai.controller';
import {
  IngredientCatalogService,
  RecipeTemplateRepository,
} from './catalog/ingredient-catalog.service';
import { AiJobRunner } from './jobs/ai-job-runner';
import { AiJobsRepository } from './jobs/ai-jobs.repository';
import { AiJobsService } from './jobs/ai-jobs.service';
import { AiRealtimePublisher } from './jobs/ai-realtime.publisher';
import { AI_PROVIDER, type AiProvider } from './provider/ai-provider';
import { FakeProvider, type FakeScenario } from './provider/fake.provider';
import { GeminiProvider } from './provider/gemini.provider';
import { InvoiceScanHandler, MenuScanHandler } from './scans/page-scan.handlers';
import { RecipeDraftHandler } from './scans/recipe-draft.handler';
import { ScanImageJanitor } from './storage/scan-image.janitor';
import { ScanImageStore } from './storage/scan-image.store';
import { AiQuotaService } from './usage/ai-quota.service';

/** `AI_PROVIDER` unset: Gemini in production, the fake everywhere else. */
function createProvider(config: ConfigService): AiProvider {
  const configured = config.get<'gemini' | 'fake'>('AI_PROVIDER');
  const provider = configured ?? (config.get('NODE_ENV') === 'production' ? 'gemini' : 'fake');
  if (provider === 'fake') {
    return new FakeProvider(config.get<FakeScenario>('AI_FAKE_SCENARIO') ?? 'ok');
  }
  return new GeminiProvider(config.get<string>('GEMINI_API_KEY'));
}

@Module({
  imports: [DatabaseModule, AuthorizationModule],
  controllers: [AiController],
  providers: [
    { provide: AI_PROVIDER, useFactory: createProvider, inject: [ConfigService] },
    AiJobsRepository,
    AiJobsService,
    AiJobRunner,
    AiRealtimePublisher,
    AiQuotaService,
    ScanImageStore,
    ScanImageJanitor,
    IngredientCatalogService,
    RecipeTemplateRepository,
    MenuScanHandler,
    InvoiceScanHandler,
    RecipeDraftHandler,
  ],
  exports: [AiJobsService, IngredientCatalogService],
})
export class AiModule implements OnModuleInit {
  constructor(
    private readonly runner: AiJobRunner,
    private readonly menu: MenuScanHandler,
    private readonly invoice: InvoiceScanHandler,
    private readonly recipes: RecipeDraftHandler,
  ) {}

  onModuleInit(): void {
    this.runner.register([this.menu, this.invoice, this.recipes]);
  }
}
