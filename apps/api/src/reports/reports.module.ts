import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../common/auth/authorization.module';
import { DatabaseModule } from '../common/database/database.module';
import { ReportsController } from './reports.controller';
import { ReportsRepository } from './reports.repository';
import { ReportsService } from './reports.service';

@Module({
  imports: [DatabaseModule, AuthorizationModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsRepository],
})
export class ReportsModule {}
