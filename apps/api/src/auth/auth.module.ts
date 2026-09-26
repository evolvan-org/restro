import { Module } from '@nestjs/common';

import { DatabaseModule } from '../common/database/database.module';
import { ProvisioningModule } from '../provisioning/provisioning.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [DatabaseModule, ProvisioningModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
