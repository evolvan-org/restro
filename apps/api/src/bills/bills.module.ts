import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../common/auth/authorization.module';
import { DatabaseModule } from '../common/database/database.module';
import { BillsController } from './bills.controller';
import { BillsRepository } from './bills.repository';
import { BillsService } from './bills.service';

@Module({
  imports: [DatabaseModule, AuthorizationModule],
  controllers: [BillsController],
  providers: [BillsService, BillsRepository],
})
export class BillsModule {}
