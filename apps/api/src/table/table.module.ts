import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../common/auth/authorization.module';
import { DatabaseModule } from '../common/database/database.module';
import { DiningSectionsController } from './dining-sections/dining-sections.controller';
import { DiningSectionsRepository } from './dining-sections/dining-sections.repository';
import { DiningSectionsService } from './dining-sections/dining-sections.service';
import { TableStatusesController } from './table-statuses/table-statuses.controller';
import { TableStatusesRepository } from './table-statuses/table-statuses.repository';
import { TableStatusesService } from './table-statuses/table-statuses.service';
import { TablesController } from './tables/tables.controller';
import { TablesRepository } from './tables/tables.repository';
import { TablesService } from './tables/tables.service';

@Module({
  imports: [DatabaseModule, AuthorizationModule],
  controllers: [TableStatusesController, DiningSectionsController, TablesController],
  providers: [
    TableStatusesService,
    TableStatusesRepository,
    DiningSectionsService,
    DiningSectionsRepository,
    TablesService,
    TablesRepository,
  ],
})
export class TableModule {}
