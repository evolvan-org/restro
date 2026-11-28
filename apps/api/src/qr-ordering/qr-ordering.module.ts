import { Module } from '@nestjs/common';

import { BillsModule } from '../bills/bills.module';
import { AuthorizationModule } from '../common/auth/authorization.module';
import { DatabaseModule } from '../common/database/database.module';
import { RateLimitModule } from '../common/rate-limit/rate-limit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ThermalPrintingModule } from '../thermal-printing/thermal-printing.module';
import { QrEscalationService } from './qr-escalation.service';
import { QrFeedbackService } from './qr-feedback.service';
import { QrGuestController } from './qr-guest.controller';
import { QrGuestRepository } from './qr-guest.repository';
import { QrGuestService } from './qr-guest.service';
import { QrNotifier } from './qr-notifier.service';
import { QrOrdersController } from './qr-orders.controller';
import { QrSettingsService } from './qr-settings.service';
import { QrStaffRepository } from './qr-staff.repository';
import { QrStaffService } from './qr-staff.service';

/** REST-88: QR table ordering with captain approval. */
@Module({
  imports: [
    DatabaseModule,
    AuthorizationModule,
    RateLimitModule,
    NotificationsModule,
    BillsModule,
    ThermalPrintingModule,
  ],
  controllers: [QrGuestController, QrOrdersController],
  providers: [
    QrFeedbackService,
    QrGuestRepository,
    QrStaffRepository,
    QrGuestService,
    QrStaffService,
    QrSettingsService,
    QrNotifier,
    QrEscalationService,
  ],
})
export class QrOrderingModule {}
