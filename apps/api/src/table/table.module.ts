import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../common/auth/authorization.module';
import { DatabaseModule } from '../common/database/database.module';
import { DiningSectionsController } from './dining-sections/dining-sections.controller';
import { DiningSectionsRepository } from './dining-sections/dining-sections.repository';
import { DiningSectionsService } from './dining-sections/dining-sections.service';
import { TableStatusesController } from './table-statuses/table-statuses.controller';
import { TableStatusesRepository } from './table-statuses/table-statuses.repository';
import { TableStatusesService } from './table-statuses/table-statuses.service';

@Module({
  imports: [DatabaseModule, AuthorizationModule],
  controllers: [TableStatusesController, DiningSectionsController],
  providers: [
    TableStatusesService,
    TableStatusesRepository,
    DiningSectionsService,
    DiningSectionsRepository,
  ],
})
export class TableModule {}
