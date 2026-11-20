import { Module } from '@nestjs/common';

import { AuthTokenModule } from '../auth-tokens/auth-token.module';
import { AuthorizationModule } from '../common/auth/authorization.module';
import { DatabaseModule } from '../common/database/database.module';
import { RateLimitModule } from '../common/rate-limit/rate-limit.module';
import { EmailModule } from '../email/email.module';
import { ProfileController } from './profile/profile.controller';
import { ProfileRepository } from './profile/profile.repository';
import { ProfileService } from './profile/profile.service';
import { StaffController } from './staff/staff.controller';
import { StaffRepository } from './staff/staff.repository';
import { StaffService } from './staff/staff.service';

@Module({
  imports: [DatabaseModule, AuthorizationModule, AuthTokenModule, EmailModule, RateLimitModule],
  controllers: [ProfileController, StaffController],
  providers: [ProfileService, ProfileRepository, StaffService, StaffRepository],
})
export class UsersModule {}
