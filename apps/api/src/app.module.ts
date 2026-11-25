import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { BillsModule } from './bills/bills.module';
import { validateEnv } from './config/env.validation';
import { DashboardModule } from './dashboard/dashboard.module';
import { MenuModule } from './menu/menu.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { OrdersModule } from './orders/orders.module';
import { ReportsModule } from './reports/reports.module';
import { ReservationsModule } from './reservations/reservations.module';
import { RestaurantModule } from './restaurant/restaurant.module';
import { RolesModule } from './roles/roles.module';
import { StatusModule } from './status/status.module';
import { StockModule } from './stock/stock.module';
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
    DashboardModule,
    ReportsModule,
    UsersModule,
    RolesModule,
    RestaurantModule,
    TableModule,
    MenuModule,
    NotificationsModule,
    OrdersModule,
    BillsModule,
    StockModule,
    ReservationsModule,
    OnboardingModule,
    AiModule,
  ],
})
export class AppModule {}
