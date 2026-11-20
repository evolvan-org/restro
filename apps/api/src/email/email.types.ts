export type VerifyEmailVariables = {
  name: string;
  restaurantName: string;
  verifyUrl: string;
  expiresInHours: number;
};

export type ResetPasswordVariables = {
  name: string;
  resetUrl: string;
  expiresInMinutes: number;
};

export type StaffInviteVariables = {
  staffName: string;
  restaurantName: string;
  inviterName: string;
  roleName: string;
  acceptUrl: string;
  expiresInDays: number;
};

export type EmailRequest =
  | {
      to: { email: string; name: string };
      template: 'VERIFY_EMAIL';
      variables: VerifyEmailVariables;
      idempotencyKey: string;
    }
  | {
      to: { email: string; name: string };
      template: 'RESET_PASSWORD';
      variables: ResetPasswordVariables;
      idempotencyKey: string;
    }
  | {
      to: { email: string; name: string };
      template: 'STAFF_INVITE';
      variables: StaffInviteVariables;
      idempotencyKey: string;
    };

export type ProviderEmail = {
  to: { email: string; name: string };
  templateId: number;
  templateKey: EmailRequest['template'];
  variables: Record<string, string | number>;
  idempotencyKey: string;
};

export interface EmailAdapter {
  send(message: ProviderEmail): Promise<void>;
}

export const EMAIL_ADAPTER = Symbol('EMAIL_ADAPTER');

export class EmailDeliveryError extends Error {
  constructor(readonly status?: number) {
    super('Transactional email delivery failed');
    this.name = EmailDeliveryError.name;
  }
}
