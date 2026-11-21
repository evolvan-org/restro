import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../common/auth/authorization.module';
import { DatabaseModule } from '../common/database/database.module';
import { RolesController } from './roles.controller';
import { RolesRepository } from './roles.repository';
import { RolesService } from './roles.service';

@Module({
  imports: [DatabaseModule, AuthorizationModule],
  controllers: [RolesController],
  providers: [RolesService, RolesRepository],
})
export class RolesModule {}
