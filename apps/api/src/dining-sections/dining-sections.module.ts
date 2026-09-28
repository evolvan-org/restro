import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../common/auth/authorization.module';
import { DatabaseModule } from '../common/database/database.module';
import { DiningSectionsController } from './dining-sections.controller';
import { DiningSectionsRepository } from './dining-sections.repository';
import { DiningSectionsService } from './dining-sections.service';

@Module({
  imports: [DatabaseModule, AuthorizationModule],
  controllers: [DiningSectionsController],
  providers: [DiningSectionsService, DiningSectionsRepository],
})
export class DiningSectionsModule {}
