import { Module } from '@nestjs/common';

import { AuthTokenModule } from '../auth-tokens/auth-token.module';
import { AuthorizationModule } from '../common/auth/authorization.module';
import { DatabaseModule } from '../common/database/database.module';
import { RateLimitModule } from '../common/rate-limit/rate-limit.module';
import { EmailModule } from '../email/email.module';
import { ProvisioningModule } from '../provisioning/provisioning.module';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';

@Module({
  imports: [
    DatabaseModule,
    ProvisioningModule,
    AuthTokenModule,
    EmailModule,
    RateLimitModule,
    AuthorizationModule,
  ],
  controllers: [AuthController],
  providers: [AuthRepository, AuthService],
  exports: [AuthService],
})
export class AuthModule {}
