import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../common/auth/authorization.module';
import { DatabaseModule } from '../common/database/database.module';
import { NotificationPublisher } from './notification-publisher.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';
import { PushController } from './push.controller';
import { PushRepository } from './push.repository';
import { PushService } from './push.service';
import { QrRealtimePublisher } from './qr-realtime.publisher';

@Module({
  imports: [DatabaseModule, AuthorizationModule],
  controllers: [NotificationsController, PushController],
  providers: [
    NotificationsRepository,
    NotificationsService,
    NotificationPublisher,
    PushRepository,
    PushService,
    QrRealtimePublisher,
  ],
  exports: [NotificationsService, NotificationPublisher, QrRealtimePublisher],
})
export class NotificationsModule {}
