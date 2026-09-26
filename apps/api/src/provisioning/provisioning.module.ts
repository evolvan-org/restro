import { Module } from '@nestjs/common';

import { DatabaseModule } from '../common/database/database.module';
import { ProvisioningRepository } from './provisioning.repository';
import { ProvisioningService } from './provisioning.service';

@Module({
  imports: [DatabaseModule],
  providers: [ProvisioningService, ProvisioningRepository],
  exports: [ProvisioningService],
})
export class ProvisioningModule {}
