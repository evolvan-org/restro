import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../common/auth/authorization.module';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { DatabaseModule } from '../common/database/database.module';
import { ProfileController } from './profile/profile.controller';
import { ProfileRepository } from './profile/profile.repository';
import { ProfileService } from './profile/profile.service';
import { StaffController } from './staff/staff.controller';
import { StaffRepository } from './staff/staff.repository';
import { StaffService } from './staff/staff.service';

@Module({
  imports: [DatabaseModule, AuthorizationModule],
  controllers: [ProfileController, StaffController],
  providers: [JwtAuthGuard, ProfileService, ProfileRepository, StaffService, StaffRepository],
})
export class UsersModule {}
