import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../common/auth/authorization.module';
import { DatabaseModule } from '../common/database/database.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { StockModule } from '../stock/stock.module';
import { MenuCategoriesController } from './menu-categories.controller';
import { MenuCategoriesRepository } from './menu-categories.repository';
import { MenuCategoriesService } from './menu-categories.service';
import { MenuItemsController } from './menu-items.controller';
import { MenuItemsRepository } from './menu-items.repository';
import { MenuItemsService } from './menu-items.service';

@Module({
  imports: [DatabaseModule, AuthorizationModule, StockModule, RealtimeModule],
  controllers: [MenuCategoriesController, MenuItemsController],
  providers: [
    MenuCategoriesService,
    MenuCategoriesRepository,
    MenuItemsService,
    MenuItemsRepository,
  ],
})
export class MenuModule {}
