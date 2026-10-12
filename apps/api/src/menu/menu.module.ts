import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../common/auth/authorization.module';
import { DatabaseModule } from '../common/database/database.module';
import { MenuCategoriesController } from './menu-categories.controller';
import { MenuCategoriesRepository } from './menu-categories.repository';
import { MenuCategoriesService } from './menu-categories.service';

@Module({
  imports: [DatabaseModule, AuthorizationModule],
  controllers: [MenuCategoriesController],
  providers: [MenuCategoriesService, MenuCategoriesRepository],
})
export class MenuModule {}
