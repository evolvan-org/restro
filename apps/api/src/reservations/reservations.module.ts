import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../common/auth/authorization.module';
import { DatabaseModule } from '../common/database/database.module';
import { GuestsController } from './guests/guests.controller';
import { GuestsRepository } from './guests/guests.repository';
import { GuestsService } from './guests/guests.service';
import { ReservationsController } from './reservations/reservations.controller';
import { ReservationsRepository } from './reservations/reservations.repository';
import { ReservationsService } from './reservations/reservations.service';
import { WalkInsController } from './walk-ins/walk-ins.controller';
import { WalkInsService } from './walk-ins/walk-ins.service';

@Module({
  imports: [DatabaseModule, AuthorizationModule],
  controllers: [ReservationsController, GuestsController, WalkInsController],
  providers: [
    ReservationsService,
    ReservationsRepository,
    GuestsService,
    GuestsRepository,
    WalkInsService,
  ],
})
export class ReservationsModule {}
