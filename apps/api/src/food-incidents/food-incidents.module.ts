import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../common/auth/authorization.module';
import { DatabaseModule } from '../common/database/database.module';
import { FoodIncidentsController } from './food-incidents.controller';
import { FoodIncidentsRepository } from './food-incidents.repository';
import { FoodIncidentsService } from './food-incidents.service';

@Module({
  imports: [AuthorizationModule, DatabaseModule],
  controllers: [FoodIncidentsController],
  providers: [FoodIncidentsRepository, FoodIncidentsService],
})
export class FoodIncidentsModule {}
