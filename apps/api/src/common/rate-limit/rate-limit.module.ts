import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { RateLimitRepository } from './rate-limit.repository';
import { RateLimitService } from './rate-limit.service';

@Module({
  imports: [DatabaseModule],
  providers: [RateLimitRepository, RateLimitService],
  exports: [RateLimitService],
})
export class RateLimitModule {}
