import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { API_ERROR_CODES } from '@rms/api-contract';
import { compare } from 'bcrypt';
import { Secret, TOTP } from 'otpauth';

import type { Actor } from '../common/auth/authenticated-request';
import { RateLimitService } from '../common/rate-limit/rate-limit.service';
import { signAccessToken } from './access-token';
import { AuthRepository, type AuthUserRecord } from './auth.repository';

@Injectable()
export class AuthenticatorService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly config: ConfigService,
    private readonly limits: RateLimitService,
  ) {}

  async status(actor: Actor): Promise<{ enabled: boolean; recoveryCodesRemaining: number }> {
    const user = await this.account(actor);
    return {
      enabled: user.authenticatorSecret !== null,
      recoveryCodesRemaining: user.authenticatorRecoveryHashes.length,
    };
  }

  async setup(
    actor: Actor,
    password: string,
  ): Promise<{ uri: string; secret: string; expiresAt: string }> {
    const user = await this.account(actor);
    await this.checkPassword(user, password);
    if (user.authenticatorSecret) throw new ConflictException('Authenticator is already enabled');
    const secret = new Secret({ size: 20 }).base32;
    const expiresAt = new Date(Date.now() + 10 * 60_000);
    if (
      !(await this.repository.saveAuthenticator(user, {
        authenticatorPending: this.encrypt(secret, user.id),
        authenticatorPendingUntil: expiresAt,
      }))
    )
      this.changed();
    return {
      uri: new TOTP({ issuer: 'Restro', label: user.email, secret }).toString(),
      secret,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async enable(
    actor: Actor,
    code: string,
  ): Promise<{ recoveryCodes: string[]; accessToken: string }> {
    const user = await this.account(actor);
    await this.limit(user);
    if (
      user.authenticatorSecret ||
      !user.authenticatorPending ||
      !user.authenticatorPendingUntil ||
      user.authenticatorPendingUntil.getTime() <= Date.now()
    ) {
      throw new ConflictException('Start a new authenticator setup');
    }
    const counter = this.counter(user, user.authenticatorPending, code);
    if (counter === null) this.invalid(false);
    const recoveryCodes = Array.from({ length: 8 }, () =>
      randomBytes(10).toString('hex').match(/.{5}/g)!.join('-'),
    );
    if (
      !(await this.repository.saveAuthenticator(user, {
        authenticatorSecret: user.authenticatorPending,
        authenticatorPending: null,
        authenticatorPendingUntil: null,
        authenticatorCounter: counter,
        authenticatorRecoveryHashes: recoveryCodes.map((entry) =>
          this.recoveryHash(user.id, entry),
        ),
        authVersion: { increment: 1 },
      }))
    )
      this.changed();
    return { recoveryCodes, accessToken: this.freshToken(user) };
  }

  async disable(
    actor: Actor,
    password: string,
    code: string,
  ): Promise<{ message: string; accessToken: string }> {
    const user = await this.account(actor);
    await this.checkPassword(user, password);
    if (!user.authenticatorSecret) throw new ConflictException('Authenticator is not enabled');
    this.verify(user, code, false);
    if (
      !(await this.repository.saveAuthenticator(user, {
        authenticatorSecret: null,
        authenticatorPending: null,
        authenticatorPendingUntil: null,
        authenticatorCounter: null,
        authenticatorRecoveryHashes: [],
        authVersion: { increment: 1 },
      }))
    )
      this.changed();
    return { message: 'Two-factor authentication disabled', accessToken: this.freshToken(user) };
  }

  async verifyLogin(user: AuthUserRecord, code: string | undefined): Promise<void> {
    if (!user.authenticatorSecret) return;
    if (!code)
      throw new UnauthorizedException({
        code: API_ERROR_CODES.AUTHENTICATOR_REQUIRED,
        message: 'Enter your authenticator code or a recovery code',
      });
    await this.limit(user);
    if (!(await this.repository.saveAuthenticator(user, this.verify(user, code)))) this.invalid();
  }

  private freshToken(user: AuthUserRecord): string {
    return signAccessToken(
      {
        userId: user.id,
        restaurantId: user.restaurantId,
        roleId: user.roleId,
        authVersion: user.authVersion + 1,
      },
      this.config.getOrThrow<string>('JWT_SECRET'),
    );
  }

  private async account(actor: Actor): Promise<AuthUserRecord> {
    const user = await this.repository.findAuthenticatorAccount(actor.userId, actor.restaurantId);
    if (!user?.passwordHash) throw new UnauthorizedException('Account unavailable');
    return user;
  }

  private async checkPassword(user: AuthUserRecord, password: string): Promise<void> {
    await this.limit(user);
    if (!user.passwordHash || !(await compare(password, user.passwordHash))) {
      throw new BadRequestException('Current password is incorrect');
    }
  }

  private limit(user: AuthUserRecord): Promise<void> {
    return this.limits.consume('AUTHENTICATOR_ATTEMPT', user.id, 8, 5 * 60_000);
  }

  private verify(
    user: AuthUserRecord,
    code: string,
    isLogin = true,
  ): { authenticatorCounter: number } | { authenticatorRecoveryHashes: string[] } {
    if (/^\d{6}$/.test(code) && user.authenticatorSecret) {
      const counter = this.counter(user, user.authenticatorSecret, code);
      if (counter !== null && counter > (user.authenticatorCounter ?? -1))
        return { authenticatorCounter: counter };
    } else {
      const hash = this.recoveryHash(user.id, code);
      if (user.authenticatorRecoveryHashes.includes(hash)) {
        return {
          authenticatorRecoveryHashes: user.authenticatorRecoveryHashes.filter(
            (entry) => entry !== hash,
          ),
        };
      }
    }
    return this.invalid(isLogin);
  }

  private counter(user: AuthUserRecord, encrypted: string, token: string): number | null {
    const totp = new TOTP({ secret: this.decrypt(encrypted, user.id) });
    const timestamp = Date.now();
    const delta = totp.validate({ token, timestamp, window: 1 });
    return delta === null ? null : totp.counter({ timestamp }) + delta;
  }

  private key(purpose: string): Buffer {
    const key =
      this.config.get<string>('AUTHENTICATOR_ENCRYPTION_KEY') ??
      this.config.getOrThrow<string>('JWT_SECRET');
    return createHmac('sha256', key).update(purpose).digest();
  }

  private encrypt(secret: string, subject: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(
      'aes-256-gcm',
      this.key('restro.authenticator.encryption.v1'),
      iv,
    );
    cipher.setAAD(Buffer.from(subject));
    const data = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
  }

  private decrypt(encrypted: string, subject: string): string {
    const data = Buffer.from(encrypted, 'base64');
    const cipher = createDecipheriv(
      'aes-256-gcm',
      this.key('restro.authenticator.encryption.v1'),
      data.subarray(0, 12),
    );
    cipher.setAAD(Buffer.from(subject));
    cipher.setAuthTag(data.subarray(12, 28));
    return Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString('utf8');
  }

  private recoveryHash(userId: string, code: string): string {
    return createHmac('sha256', this.key('restro.authenticator.recovery.v1'))
      .update(userId + ':' + code.toLowerCase().replaceAll('-', ''))
      .digest('hex');
  }

  private invalid(isLogin = true): never {
    const message = 'Verification code is invalid, expired, or already used';
    if (!isLogin) throw new BadRequestException(message);
    throw new UnauthorizedException({ code: API_ERROR_CODES.AUTHENTICATOR_INVALID, message });
  }

  private changed(): never {
    throw new ConflictException('Authenticator settings changed. Try again.');
  }
}
