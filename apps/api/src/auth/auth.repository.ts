import { Injectable } from '@nestjs/common';
import { Prisma } from '@rms/db';

import { roleAccessSelect } from '../common/auth/role-access';
import { PrismaService } from '../common/database/prisma.service';

const authenticatorSelect = {
  authenticatorSecret: true,
  authenticatorPending: true,
  authenticatorPendingUntil: true,
  authenticatorCounter: true,
  authenticatorRecoveryHashes: true,
  authenticatorVersion: true,
} satisfies Prisma.UserSelect;

const authUserSelect = {
  ...authenticatorSelect,
  id: true,
  restaurantId: true,
  roleId: true,
  name: true,
  email: true,
  passwordHash: true,
  status: true,
  emailVerifiedAt: true,
  authVersion: true,
  mustChangePassword: true,
  role: { select: roleAccessSelect },
  restaurant: { select: { name: true, onboardingCompletedAt: true } },
} satisfies Prisma.UserSelect;

export type AuthUserRecord = Prisma.UserGetPayload<{ select: typeof authUserSelect }>;

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<AuthUserRecord | null> {
    return this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: authUserSelect,
    });
  }

  findAuthenticatorAccount(userId: string, restaurantId: string): Promise<AuthUserRecord | null> {
    return this.prisma.user.findFirst({
      where: { id: userId, restaurantId, status: 'ACTIVE' },
      select: authUserSelect,
    });
  }

  async saveAuthenticator(
    user: AuthUserRecord,
    changes: Pick<
      Prisma.UserUpdateManyMutationInput,
      keyof typeof authenticatorSelect | 'authVersion'
    >,
  ): Promise<boolean> {
    const result = await this.prisma.user.updateMany({
      where: {
        id: user.id,
        restaurantId: user.restaurantId,
        status: 'ACTIVE',
        authVersion: user.authVersion,
        authenticatorVersion: user.authenticatorVersion,
      },
      data: { ...changes, authenticatorVersion: { increment: 1 } },
    });
    return result.count === 1;
  }

  findById(userId: string): Promise<AuthUserRecord | null> {
    return this.prisma.user.findUnique({ where: { id: userId }, select: authUserSelect });
  }
}
