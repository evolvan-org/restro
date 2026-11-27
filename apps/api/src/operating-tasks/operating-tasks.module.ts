import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../common/auth/authorization.module';
import { DatabaseModule } from '../common/database/database.module';
import { OperatingTasksController } from './operating-tasks.controller';
import { OperatingTasksRepository } from './operating-tasks.repository';
import { OperatingTasksService } from './operating-tasks.service';

@Module({
  imports: [DatabaseModule, AuthorizationModule],
  controllers: [OperatingTasksController],
  providers: [OperatingTasksRepository, OperatingTasksService],
})
export class OperatingTasksModule {}
