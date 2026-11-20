import { Module } from '@nestjs/common';

import { DatabaseModule } from '../common/database/database.module';
import { AuthTokenRepository } from './auth-token.repository';
import { AuthTokenService } from './auth-token.service';

@Module({
  imports: [DatabaseModule],
  providers: [AuthTokenRepository, AuthTokenService],
  exports: [AuthTokenService],
})
export class AuthTokenModule {}
