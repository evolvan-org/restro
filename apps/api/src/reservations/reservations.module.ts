import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../common/auth/authorization.module';
import { DatabaseModule } from '../common/database/database.module';
import {
  GuestsController,
  ReservationsController,
  WalkInsController,
} from './reservations.controller';
import { ReservationsRepository } from './reservations.repository';
import { ReservationsService } from './reservations.service';

@Module({
  imports: [DatabaseModule, AuthorizationModule],
  controllers: [ReservationsController, GuestsController, WalkInsController],
  providers: [ReservationsService, ReservationsRepository],
})
export class ReservationsModule {}
