import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ActorRepository } from './actor.repository';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PermissionsGuard } from './permissions.guard';

/** Import in any feature module whose controllers use `@UseGuards(JwtAuthGuard, PermissionsGuard)`. */
@Module({
  imports: [DatabaseModule],
  providers: [ActorRepository, JwtAuthGuard, PermissionsGuard],
  exports: [ActorRepository, JwtAuthGuard, PermissionsGuard],
})
export class AuthorizationModule {}
