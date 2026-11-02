import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../common/auth/authorization.module';
import { DatabaseModule } from '../common/database/database.module';
import { NotificationPublisher } from './notification-publisher.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [DatabaseModule, AuthorizationModule],
  controllers: [NotificationsController],
  providers: [NotificationsRepository, NotificationsService, NotificationPublisher],
  exports: [NotificationsService],
})
export class NotificationsModule {}
