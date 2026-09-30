import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../common/auth/authorization.module';
import { DatabaseModule } from '../common/database/database.module';
import { RestaurantSettingsController } from './restaurant-settings.controller';
import { RestaurantSettingsRepository } from './restaurant-settings.repository';
import { RestaurantSettingsService } from './restaurant-settings.service';

@Module({
  imports: [DatabaseModule, AuthorizationModule],
  controllers: [RestaurantSettingsController],
  providers: [RestaurantSettingsService, RestaurantSettingsRepository],
})
export class RestaurantSettingsModule {}
