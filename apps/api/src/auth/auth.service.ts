import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type AcceptInviteRequest,
  type AcceptInviteResponse,
  type ForgotPasswordRequest,
  type ForgotPasswordResponse,
  type LoginRequest,
  type LoginResponse,
  type RegisterRequest,
  type RegisterResponse,
  type ResendVerificationResponse,
  type ResetPasswordRequest,
  type ResetPasswordResponse,
  type VerifyEmailRequest,
  type VerifyEmailResponse,
} from '@rms/api-contract';
import { compare, hash } from 'bcrypt';
import jwt from 'jsonwebtoken';

import { AuthTokenService } from '../auth-tokens/auth-token.service';
import { BCRYPT_ROUNDS } from '../common/auth/password';
import { errorDiagnostics } from '../common/logging/error-diagnostics';
import { RateLimitService } from '../common/rate-limit/rate-limit.service';
import { deliverBestEffort } from '../email/email-delivery';
import { EmailService } from '../email/email.service';
import { ProvisioningService } from '../provisioning/provisioning.service';
import { AuthRepository, type AuthUserRecord } from './auth.repository';

const FORGOT_PASSWORD_MESSAGE =
  'If an active account exists for that email, a password reset link has been sent.';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly repository: AuthRepository,
    private readonly config: ConfigService,
    private readonly provisioning: ProvisioningService,
    private readonly tokens: AuthTokenService,
    private readonly email: EmailService,
    private readonly rateLimit: RateLimitService,
  ) {}

  async register(input: RegisterRequest): Promise<RegisterResponse> {
    const { userId, restaurantId, roleId } = await this.provisioning.provisionOwner(input);
    // The account is committed at this point, so a provider outage must not turn registration into
    // an error: a retry would only hit "Email is already registered". The user can resend later.
    const emailSent = await deliverBestEffort(
      this.logger,
      { flow: 'register', userId },
      () =>
        this.tokens.issueAndDeliver(restaurantId, userId, 'EMAIL_VERIFICATION', (token) =>
          this.email.send({
            to: { email: input.email, name: input.name },
            template: 'VERIFY_EMAIL',
            variables: {
              name: input.name,
              restaurantName: input.restaurantName,
              verifyUrl: this.publicUrl('/auth/verify-email', token.rawToken),
              expiresInHours: 24,
            },
            idempotencyKey: token.id,
          }),
        ),
    );

    return {
      success: true,
      message: emailSent
        ? 'User registered successfully. Check your inbox to verify your email.'
        : "User registered successfully, but we couldn't send the verification email. Use Resend to try again.",
      accessToken: this.signAccessToken({ userId, restaurantId, roleId, authVersion: 0 }),
      emailSent,
    };
  }

  async login(input: LoginRequest): Promise<LoginResponse> {
    const user = await this.repository.findByEmail(input.email);
    if (!user?.passwordHash || user.status !== 'ACTIVE') throw invalidCredentials();
    if (!(await compare(input.password, user.passwordHash))) throw invalidCredentials();

    return {
      success: true,
      message: 'Login successful',
      accessToken: this.signAccessToken(user),
    };
  }

  async verifyEmail(input: VerifyEmailRequest): Promise<VerifyEmailResponse> {
    await this.tokens.verifyEmail(input.token);
    return { message: 'Email verified successfully' };
  }

  async resendVerification(userId: string): Promise<ResendVerificationResponse> {
    const user = await this.repository.findById(userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User account is not active');
    }
    if (user.emailVerifiedAt) return { message: 'Email is already verified' };

    await this.rateLimit.consume('RESEND_VERIFICATION_MINUTE', userId, 1, 60_000);
    await this.rateLimit.consume('RESEND_VERIFICATION_HOUR', userId, 5, 60 * 60_000);
    await this.tokens.issueAndDeliver(user.restaurantId, user.id, 'EMAIL_VERIFICATION', (token) =>
      this.email.send({
        to: { email: user.email, name: user.name },
        template: 'VERIFY_EMAIL',
        variables: {
          name: user.name,
          restaurantName: user.restaurant.name,
          verifyUrl: this.publicUrl('/auth/verify-email', token.rawToken),
          expiresInHours: 24,
        },
        idempotencyKey: token.id,
      }),
    );
    return { message: 'Verification email sent' };
  }

  async forgotPassword(
    input: ForgotPasswordRequest,
    clientIp: string,
  ): Promise<ForgotPasswordResponse> {
    await this.rateLimit.consume('FORGOT_PASSWORD_IP', clientIp, 20, 60 * 60_000);
    await this.rateLimit.consume('FORGOT_PASSWORD_EMAIL', input.email, 5, 60 * 60_000);

    const user = await this.repository.findByEmail(input.email);
    if (user?.status === 'ACTIVE' && user.passwordHash) {
      // Deliberately not awaited: issuing the token and calling the provider takes far longer than
      // the unknown-email path, and that timing difference would reveal which emails have accounts.
      void this.sendPasswordReset(user).catch((error: unknown) => {
        this.logger.error('Password reset email not delivered', {
          flow: 'forgot-password',
          userId: user.id,
          ...errorDiagnostics(error),
        });
      });
    }
    return { message: FORGOT_PASSWORD_MESSAGE };
  }

  async resetPassword(input: ResetPasswordRequest): Promise<ResetPasswordResponse> {
    await this.tokens.resetPassword(input.token, await hash(input.newPassword, BCRYPT_ROUNDS));
    return { message: 'Password reset successfully. Please sign in again.' };
  }

  async acceptInvite(input: AcceptInviteRequest): Promise<AcceptInviteResponse> {
    await this.tokens.acceptInvite(input.token, await hash(input.password, BCRYPT_ROUNDS));
    return { message: 'Invitation accepted. You can now sign in.' };
  }

  private sendPasswordReset(user: AuthUserRecord): Promise<void> {
    return this.tokens.issueAndDeliver(user.restaurantId, user.id, 'PASSWORD_RESET', (token) =>
      this.email.send({
        to: { email: user.email, name: user.name },
        template: 'RESET_PASSWORD',
        variables: {
          name: user.name,
          resetUrl: this.publicUrl('/auth/reset-password', token.rawToken),
          expiresInMinutes: 60,
        },
        idempotencyKey: token.id,
      }),
    );
  }

  private publicUrl(path: string, token: string): string {
    const url = new URL(path, this.config.getOrThrow<string>('APP_PUBLIC_URL'));
    url.searchParams.set('token', token);
    return url.toString();
  }

  private signAccessToken(payload: {
    id?: string;
    userId?: string;
    restaurantId: string;
    roleId: string;
    authVersion: number;
  }): string {
    return jwt.sign(
      {
        userId: payload.userId ?? payload.id,
        restaurantId: payload.restaurantId,
        roleId: payload.roleId,
        authVersion: payload.authVersion,
      },
      this.config.getOrThrow<string>('JWT_SECRET'),
      { expiresIn: '1d', algorithm: 'HS256' },
    );
  }
}

function invalidCredentials(): UnauthorizedException {
  return new UnauthorizedException('Invalid email or password');
}
