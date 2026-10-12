import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from './auth/auth.module';
import { validateEnv } from './config/env.validation';
import { ReservationsModule } from './reservations/reservations.module';
import { RestaurantModule } from './restaurant/restaurant.module';
import { StatusModule } from './status/status.module';
import { TableModule } from './table/table.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Prefer an API-local .env, fall back to the monorepo root .env.
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
    }),
    StatusModule,
    AuthModule,
    UsersModule,
    RestaurantModule,
    TableModule,
    ReservationsModule,
  ],
})
export class AppModule {}
