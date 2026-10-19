import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../common/auth/authorization.module';
import { DatabaseModule } from '../common/database/database.module';
import { StockItemsController } from './stock-items.controller';
import { StockItemsRepository } from './stock-items.repository';
import { StockItemsService } from './stock-items.service';

@Module({
  imports: [DatabaseModule, AuthorizationModule],
  controllers: [StockItemsController],
  providers: [StockItemsService, StockItemsRepository],
  exports: [StockItemsRepository],
})
export class StockModule {}
