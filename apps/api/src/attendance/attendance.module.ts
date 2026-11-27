import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../common/auth/authorization.module';
import { DatabaseModule } from '../common/database/database.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceRepository } from './attendance.repository';
import { AttendanceService } from './attendance.service';

@Module({
  imports: [DatabaseModule, AuthorizationModule],
  controllers: [AttendanceController],
  providers: [AttendanceRepository, AttendanceService],
})
export class AttendanceModule {}
