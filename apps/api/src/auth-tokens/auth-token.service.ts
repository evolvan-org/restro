import { createHash, randomBytes } from 'node:crypto';

import { BadRequestException, Injectable } from '@nestjs/common';
import { type UserTokenType } from '@rms/db';

import { AuthTokenRepository, InvalidTokenTargetError } from './auth-token.repository';

const TOKEN_BYTES = 32;
const EXPIRY_MS: Record<UserTokenType, number> = {
  EMAIL_VERIFICATION: 24 * 60 * 60 * 1_000,
  PASSWORD_RESET: 60 * 60 * 1_000,
  STAFF_INVITE: 7 * 24 * 60 * 60 * 1_000,
};

export type IssuedAuthToken = { rawToken: string; id: string; expiresAt: Date; issuedAt: Date };

@Injectable()
export class AuthTokenService {
  constructor(private readonly repository: AuthTokenRepository) {}

  /**
   * Issues a token and hands it to `deliver`. Older unused tokens of the same type are retired only
   * after delivery succeeds, so a failed send never leaves the user without a working link.
   */
  async issueAndDeliver(
    restaurantId: string,
    userId: string,
    type: UserTokenType,
    deliver: (token: IssuedAuthToken) => Promise<void>,
  ): Promise<void> {
    const token = await this.issue(restaurantId, userId, type);
    await deliver(token);
    await this.repository.revokeOlder(userId, type, token.id, token.issuedAt, new Date());
  }

  private async issue(
    restaurantId: string,
    userId: string,
    type: UserTokenType,
  ): Promise<IssuedAuthToken> {
    const now = new Date();
    const rawToken = randomBytes(TOKEN_BYTES).toString('base64url');
    const expiresAt = new Date(now.getTime() + EXPIRY_MS[type]);
    const created = await this.repository.issue({
      restaurantId,
      userId,
      type,
      tokenHash: hashToken(rawToken),
      expiresAt,
      now,
    });
    return { rawToken, id: created.id, expiresAt, issuedAt: created.createdAt };
  }

  async verifyEmail(rawToken: string): Promise<void> {
    const token = await this.validToken(rawToken, 'EMAIL_VERIFICATION');
    await this.consume(() =>
      this.repository.consumeEmailVerification(token.id, token.userId, new Date()),
    );
  }

  async resetPassword(rawToken: string, passwordHash: string): Promise<void> {
    const token = await this.validToken(rawToken, 'PASSWORD_RESET');
    await this.consume(() =>
      this.repository.consumePasswordReset(token.id, token.userId, passwordHash, new Date()),
    );
  }

  async acceptInvite(rawToken: string, passwordHash: string): Promise<void> {
    const token = await this.validToken(rawToken, 'STAFF_INVITE');
    await this.consume(() =>
      this.repository.consumeStaffInvite(token.id, token.userId, passwordHash, new Date()),
    );
  }

  private async validToken(rawToken: string, type: UserTokenType) {
    const token = await this.repository.findByHash(hashToken(rawToken));
    if (
      !token ||
      token.type !== type ||
      token.usedAt !== null ||
      token.expiresAt.getTime() <= Date.now()
    ) {
      throw invalidToken();
    }
    return token;
  }

  private async consume(operation: () => Promise<boolean>): Promise<void> {
    try {
      if (!(await operation())) throw invalidToken();
    } catch (error) {
      if (error instanceof InvalidTokenTargetError) throw invalidToken();
      throw error;
    }
  }
}

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

function invalidToken(): BadRequestException {
  return new BadRequestException('This link is invalid, expired, or has already been used');
}
