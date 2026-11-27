import { Module } from '@nestjs/common';

import { BillsModule } from '../bills/bills.module';
import { AuthorizationModule } from '../common/auth/authorization.module';
import { DatabaseModule } from '../common/database/database.module';
import { OrdersModule } from '../orders/orders.module';
import { ThermalPrintConnectorController } from './thermal-print-connector.controller';
import { ThermalPrintConnectorService } from './thermal-print-connector.service';
import { ThermalPrintingController } from './thermal-printing.controller';
import { ThermalPrintingRepository } from './thermal-printing.repository';
import { ThermalPrintingService } from './thermal-printing.service';

@Module({
  imports: [AuthorizationModule, BillsModule, DatabaseModule, OrdersModule],
  controllers: [ThermalPrintingController, ThermalPrintConnectorController],
  providers: [ThermalPrintingService, ThermalPrintingRepository, ThermalPrintConnectorService],
})
export class ThermalPrintingModule {}
