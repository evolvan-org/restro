import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../common/auth/authorization.module';
import { DatabaseModule } from '../common/database/database.module';
import { InventoryController } from './inventory.controller';
import { InventoryRepository } from './inventory.repository';
import { InventoryService } from './inventory.service';
import { StockItemsController } from './stock-items.controller';
import { StockItemsRepository } from './stock-items.repository';
import { StockItemsService } from './stock-items.service';

@Module({
  imports: [DatabaseModule, AuthorizationModule],
  controllers: [StockItemsController, InventoryController],
  providers: [StockItemsService, StockItemsRepository, InventoryService, InventoryRepository],
  exports: [StockItemsRepository, InventoryService],
})
export class StockModule {}
