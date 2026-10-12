import { Injectable } from '@nestjs/common';
import { Prisma } from '@rms/db';

import { PrismaService } from '../../common/database/prisma.service';

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

@Injectable()
export class ProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(userId: string): Promise<ProfileRecord | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: profileSelect,
    });
  }

  updateById(userId: string, data: { name: string; phone: string | null }): Promise<ProfileRecord> {
    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: profileSelect,
    });
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
