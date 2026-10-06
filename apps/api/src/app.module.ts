import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from './auth/auth.module';
import { validateEnv } from './config/env.validation';
import { DiningSectionsModule } from './dining-sections/dining-sections.module';
import { ProfileModule } from './profile/profile.module';
import { StaffModule } from './staff/staff.module';
import { StatusModule } from './status/status.module';
import { TableStatusesModule } from './table-statuses/table-statuses.module';

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
    ProfileModule,
    StaffModule,
    DiningSectionsModule,
    TableStatusesModule,
  ],
})
export class AppModule {}
