import { Module } from '@nestjs/common';

import { BillsModule } from '../bills/bills.module';
import { AuthorizationModule } from '../common/auth/authorization.module';
import { DatabaseModule } from '../common/database/database.module';
import { OrdersModule } from '../orders/orders.module';
import { ThermalPrintingController } from './thermal-printing.controller';
import { ThermalPrintingRepository } from './thermal-printing.repository';
import { ThermalPrintingService } from './thermal-printing.service';

@Module({
  imports: [AuthorizationModule, BillsModule, DatabaseModule, OrdersModule],
  controllers: [ThermalPrintingController],
  providers: [ThermalPrintingService, ThermalPrintingRepository],
})
export class ThermalPrintingModule {}
