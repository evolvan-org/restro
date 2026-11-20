import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EMAIL_ADAPTER, type EmailAdapter, type EmailRequest } from './email.types';

@Injectable()
export class EmailService {
  constructor(
    @Inject(EMAIL_ADAPTER) private readonly adapter: EmailAdapter,
    private readonly config: ConfigService,
  ) {}

  send(request: EmailRequest): Promise<void> {
    return this.adapter.send({
      to: request.to,
      templateId: this.templateId(request.template),
      templateKey: request.template,
      variables: request.variables,
      idempotencyKey: request.idempotencyKey,
    });
  }

  private templateId(template: EmailRequest['template']): number {
    const key = {
      VERIFY_EMAIL: 'EMAIL_TEMPLATE_VERIFY_EMAIL_ID',
      RESET_PASSWORD: 'EMAIL_TEMPLATE_RESET_PASSWORD_ID',
      STAFF_INVITE: 'EMAIL_TEMPLATE_STAFF_INVITE_ID',
    }[template];
    return this.config.getOrThrow<number>(key);
  }
}
