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

  async issue(input: {
    restaurantId: string;
    userId: string;
    type: UserTokenType;
    tokenHash: string;
    expiresAt: Date;
    now: Date;
  }): Promise<{ id: string }> {
    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          await tx.userToken.updateMany({
            where: { userId: input.userId, type: input.type, usedAt: null },
            data: { usedAt: input.now },
          });
          return tx.userToken.create({
            data: {
              restaurantId: input.restaurantId,
              userId: input.userId,
              type: input.type,
              tokenHash: input.tokenHash,
              expiresAt: input.expiresAt,
            },
            select: { id: true },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
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

  private async withSerializableRetry<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        return operation();
      }
      throw error;
    }
  }
}

export class InvalidTokenTargetError extends Error {}
