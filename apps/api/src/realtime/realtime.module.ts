import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../common/auth/authorization.module';
import { RealtimeController } from './realtime.controller';
import { RealtimeService } from './realtime.service';

@Module({
  imports: [AuthorizationModule],
  controllers: [RealtimeController],
  providers: [RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
