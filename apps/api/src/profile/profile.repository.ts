import { Injectable } from '@nestjs/common';
import { Prisma } from '@rms/db';

import { PrismaService } from '../common/database/prisma.service';

const profileSelect = {
  restaurantId: true,
  name: true,
  email: true,
  phone: true,
  status: true,
  role: {
    select: {
      name: true,
    },
  },
} satisfies Prisma.UserSelect;

const passwordSelect = {
  passwordHash: true,
  status: true,
} satisfies Prisma.UserSelect;

export type ProfileRecord = Prisma.UserGetPayload<{ select: typeof profileSelect }>;
export type PasswordRecord = Prisma.UserGetPayload<{ select: typeof passwordSelect }>;

export class ProfileEmailConflictError extends Error {
  constructor() {
    super('Email address is already in use');
    this.name = ProfileEmailConflictError.name;
  }
}

@Injectable()
export class ProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(userId: string): Promise<ProfileRecord | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: profileSelect,
    });
  }

  async updateById(
    userId: string,
    data: { name: string; email: string; phone: string | null },
  ): Promise<ProfileRecord> {
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data,
        select: profileSelect,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ProfileEmailConflictError();
      }
      throw error;
    }
  }

  async findEmailOwnerId(restaurantId: string, email: string): Promise<string | null> {
    const user = await this.prisma.user.findFirst({
      where: {
        restaurantId,
        email: {
          equals: email,
          mode: 'insensitive',
        },
      },
      select: { id: true },
    });

    return user?.id ?? null;
  }

  findPasswordById(userId: string): Promise<PasswordRecord | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: passwordSelect,
    });
  }

  async updatePasswordById(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }
}
