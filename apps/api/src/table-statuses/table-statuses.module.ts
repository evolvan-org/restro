import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../common/auth/authorization.module';
import { DatabaseModule } from '../common/database/database.module';
import { TableStatusesController } from './table-statuses.controller';
import { TableStatusesRepository } from './table-statuses.repository';
import { TableStatusesService } from './table-statuses.service';

@Module({
  imports: [DatabaseModule, AuthorizationModule],
  controllers: [TableStatusesController],
  providers: [TableStatusesService, TableStatusesRepository],
})
export class TableStatusesModule {}
