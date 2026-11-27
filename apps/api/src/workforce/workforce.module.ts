import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../common/auth/authorization.module';
import { DatabaseModule } from '../common/database/database.module';
import { WorkforceController } from './workforce.controller';
import { WorkforceRepository } from './workforce.repository';
import { WorkforceService } from './workforce.service';

@Module({
  imports: [DatabaseModule, AuthorizationModule],
  controllers: [WorkforceController],
  providers: [WorkforceRepository, WorkforceService],
})
export class WorkforceModule {}
