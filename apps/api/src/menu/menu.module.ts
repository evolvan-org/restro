import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { AuthorizationModule } from '../common/auth/authorization.module';
import { DatabaseModule } from '../common/database/database.module';
import { StockModule } from '../stock/stock.module';
import { MarginsController } from './margins.controller';
import { MarginsService } from './margins.service';
import { MenuCategoriesController } from './menu-categories.controller';
import { MenuCategoriesRepository } from './menu-categories.repository';
import { MenuCategoriesService } from './menu-categories.service';
import { MenuImportService } from './menu-import.service';
import { MenuItemsController } from './menu-items.controller';
import { MenuItemsRepository } from './menu-items.repository';
import { MenuItemsService } from './menu-items.service';

@Module({
  imports: [DatabaseModule, AuthorizationModule, StockModule, AiModule],
  controllers: [MenuCategoriesController, MenuItemsController, MarginsController],
  providers: [
    MenuCategoriesService,
    MenuCategoriesRepository,
    MenuItemsService,
    MenuItemsRepository,
    MenuImportService,
    MarginsService,
  ],
})
export class MenuModule {}
