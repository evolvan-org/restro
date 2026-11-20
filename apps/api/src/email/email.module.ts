import { Module } from '@nestjs/common';

import { BrevoEmailAdapter } from './brevo-email.adapter';
import { EmailService } from './email.service';
import { EMAIL_ADAPTER } from './email.types';

@Module({
  providers: [
    BrevoEmailAdapter,
    EmailService,
    { provide: EMAIL_ADAPTER, useExisting: BrevoEmailAdapter },
  ],
  exports: [EmailService],
})
export class EmailModule {}
