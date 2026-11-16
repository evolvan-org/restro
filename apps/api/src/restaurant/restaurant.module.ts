import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../common/auth/authorization.module';
import { DatabaseModule } from '../common/database/database.module';
import { BillCancellationReasonsController } from './bill-cancellation-reasons.controller';
import { BillCancellationReasonsRepository } from './bill-cancellation-reasons.repository';
import { BillCancellationReasonsService } from './bill-cancellation-reasons.service';
import { RestaurantSettingsController } from './restaurant-settings.controller';
import { RestaurantSettingsRepository } from './restaurant-settings.repository';
import { RestaurantSettingsService } from './restaurant-settings.service';

@Module({
  imports: [DatabaseModule, AuthorizationModule],
  controllers: [RestaurantSettingsController, BillCancellationReasonsController],
  providers: [
    RestaurantSettingsService,
    RestaurantSettingsRepository,
    BillCancellationReasonsService,
    BillCancellationReasonsRepository,
  ],
})
export class RestaurantModule {}
