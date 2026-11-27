import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { errorDiagnostics } from '../../common/logging/error-diagnostics';
import { AiJobsRepository } from '../jobs/ai-jobs.repository';
import { AiJobsService } from '../jobs/ai-jobs.service';

const SWEEP_INTERVAL_MS = 60 * 60_000;

/**
 * Deletes scan photos nobody used: anything past `AI_IMAGE_TTL_HOURS` (abandoned scans). Photos of
 * used scans are deleted straight away by the import / receipt / setup that used them.
 */
@Injectable()
export class ScanImageJanitor implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ScanImageJanitor.name);
  private readonly ttlMs: number;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly repository: AiJobsRepository,
    private readonly jobs: AiJobsService,
    config: ConfigService,
  ) {
    this.ttlMs = (config.get<number>('AI_IMAGE_TTL_HOURS') ?? 72) * 60 * 60_000;
  }

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    this.timer.unref();
    void this.sweep();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async sweep(): Promise<number> {
    try {
      const expired = await this.repository.expiredImageJobs(new Date(Date.now() - this.ttlMs));
      await this.jobs.purge(expired);
      if (expired.length) this.logger.log(`Deleted photos of ${expired.length} expired scan(s)`);
      return expired.length;
    } catch (error) {
      this.logger.warn('Scan photo sweep failed', errorDiagnostics(error));
      return 0;
    }
  }
}
