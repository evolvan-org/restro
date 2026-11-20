import { Injectable } from '@nestjs/common';
import { Prisma, type UserTokenType } from '@rms/db';

import { PrismaService } from '../common/database/prisma.service';

const tokenSelect = {
  id: true,
  userId: true,
  type: true,
  expiresAt: true,
  usedAt: true,
  user: {
    select: {
      status: true,
    },
  },
} satisfies Prisma.UserTokenSelect;

export type AuthTokenRecord = Prisma.UserTokenGetPayload<{ select: typeof tokenSelect }>;

@Injectable()
export class AuthTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  issue(input: {
    restaurantId: string;
    userId: string;
    type: UserTokenType;
    tokenHash: string;
    expiresAt: Date;
    now: Date;
  }): Promise<{ id: string; createdAt: Date }> {
    return this.prisma.userToken.create({
      data: {
        restaurantId: input.restaurantId,
        userId: input.userId,
        type: input.type,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        createdAt: input.now,
      },
      select: { id: true, createdAt: true },
    });
  }

  /**
   * Retires unused tokens of the same type issued before `issuedAt`. Only strictly older tokens are
   * retired, so two concurrent issues can never revoke each other: the newest link always survives.
   */
  async revokeOlder(
    userId: string,
    type: UserTokenType,
    keepId: string,
    issuedAt: Date,
    now: Date,
  ): Promise<void> {
    await this.prisma.userToken.updateMany({
      where: { userId, type, usedAt: null, id: { not: keepId }, createdAt: { lt: issuedAt } },
      data: { usedAt: now },
    });
  }

  /** Deletes tokens (used or not) that expired before `cutoff`; they can never be redeemed. */
  async deleteExpired(cutoff: Date): Promise<void> {
    await this.prisma.userToken.deleteMany({ where: { expiresAt: { lt: cutoff } } });
  }

  findByHash(tokenHash: string): Promise<AuthTokenRecord | null> {
    return this.prisma.userToken.findUnique({ where: { tokenHash }, select: tokenSelect });
  }

  consumeEmailVerification(id: string, userId: string, now: Date): Promise<boolean> {
    return this.consume(id, now, async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { emailVerifiedAt: now } });
      return true;
    });
  }

  consumePasswordReset(
    id: string,
    userId: string,
    passwordHash: string,
    now: Date,
  ): Promise<boolean> {
    return this.consume(id, now, async (tx) => {
      const { count } = await tx.user.updateMany({
        where: { id: userId, status: { in: ['ACTIVE', 'INACTIVE'] } },
        data: { passwordHash, authVersion: { increment: 1 } },
      });
      return count === 1;
    });
  }

  consumeStaffInvite(
    id: string,
    userId: string,
    passwordHash: string,
    now: Date,
  ): Promise<boolean> {
    return this.consume(id, now, async (tx) => {
      const { count } = await tx.user.updateMany({
        where: { id: userId, status: 'INVITED', passwordHash: null },
        data: { passwordHash, status: 'ACTIVE', emailVerifiedAt: now },
      });
      return count === 1;
    });
  }

  private async consume(
    id: string,
    now: Date,
    apply: (tx: Prisma.TransactionClient) => Promise<boolean>,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.userToken.updateMany({
        where: { id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) return false;
      if (!(await apply(tx))) throw new InvalidTokenTargetError();
      return true;
    });
  }
}

export class InvalidTokenTargetError extends Error {}
