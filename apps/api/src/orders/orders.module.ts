import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../common/auth/authorization.module';
import { DatabaseModule } from '../common/database/database.module';
import { KotsController } from './kots.controller';
import { OrderItemsService } from './order-items.service';
import { OrdersController } from './orders.controller';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';

@Module({
  imports: [DatabaseModule, AuthorizationModule],
  controllers: [OrdersController, KotsController],
  providers: [OrdersService, OrdersRepository, OrderItemsService],
})
export class OrdersModule {}
