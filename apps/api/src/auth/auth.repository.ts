import { Injectable } from '@nestjs/common';
import { Prisma } from '@rms/db';

import { PrismaService } from '../common/database/prisma.service';

const authUserSelect = {
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
  role: { select: { name: true } },
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

  findById(userId: string): Promise<AuthUserRecord | null> {
    return this.prisma.user.findUnique({ where: { id: userId }, select: authUserSelect });
  }
}
