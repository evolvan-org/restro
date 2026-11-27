import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { AuthTokenModule } from '../auth-tokens/auth-token.module';
import { AuthorizationModule } from '../common/auth/authorization.module';
import { DatabaseModule } from '../common/database/database.module';
import { EmailModule } from '../email/email.module';
import { StockModule } from '../stock/stock.module';
import { OnboardingController } from './onboarding.controller';
import { OnboardingRepository } from './onboarding.repository';
import { OnboardingService } from './onboarding.service';
import { OnboardingCompletionWriter } from './onboarding-completion.writer';

@Module({
  imports: [
    DatabaseModule,
    AuthorizationModule,
    StockModule,
    AuthTokenModule,
    EmailModule,
    AiModule,
  ],
  controllers: [OnboardingController],
  providers: [OnboardingService, OnboardingRepository, OnboardingCompletionWriter],
})
export class OnboardingModule {}
