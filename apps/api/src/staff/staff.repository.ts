import { Injectable } from '@nestjs/common';
import { Prisma, type UserStatus } from '@rms/db';
import { Role } from '@rms/permissions';

import { PrismaService } from '../common/database/prisma.service';

const staffSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  status: true,
  createdAt: true,
  role: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.UserSelect;

const roleSelect = {
  id: true,
  name: true,
} satisfies Prisma.RoleSelect;

export type StaffRecord = Prisma.UserGetPayload<{ select: typeof staffSelect }>;
export type RoleRecord = Prisma.RoleGetPayload<{ select: typeof roleSelect }>;

export type StaffPageFilters = {
  search?: string;
  status?: UserStatus;
  skip: number;
  take: number;
};

export type StaffDetails = {
  name: string;
  email: string;
  phone: string | null;
  roleId: string;
};

export class StaffEmailConflictError extends Error {
  constructor() {
    super('Email address is already in use');
    this.name = StaffEmailConflictError.name;
  }
}

/** Staff are the restaurant's users, excluding customer accounts. */
function staffWhere(restaurantId: string): Prisma.UserWhereInput {
  return { restaurantId, role: { name: { not: Role.CUSTOMER } } };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Injectable()
export class StaffRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findPage(
    restaurantId: string,
    filters: StaffPageFilters,
  ): Promise<{ items: StaffRecord[]; total: number }> {
    const where: Prisma.UserWhereInput = {
      ...staffWhere(restaurantId),
      ...(filters.status && { status: filters.status }),
      ...(filters.search && {
        OR: [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { email: { contains: filters.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: staffSelect,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: filters.skip,
        take: filters.take,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total };
  }

  findById(restaurantId: string, userId: string): Promise<StaffRecord | null> {
    return this.prisma.user.findFirst({
      where: { id: userId, ...staffWhere(restaurantId) },
      select: staffSelect,
    });
  }

  async isEmailTaken(
    restaurantId: string,
    email: string,
    excludeUserId?: string,
  ): Promise<boolean> {
    const user = await this.prisma.user.findFirst({
      where: {
        restaurantId,
        email: { equals: email, mode: 'insensitive' },
        ...(excludeUserId && { id: { not: excludeUserId } }),
      },
      select: { id: true },
    });

    return user !== null;
  }

  async create(
    data: StaffDetails & { restaurantId: string; passwordHash: string },
  ): Promise<StaffRecord> {
    try {
      return await this.prisma.user.create({ data, select: staffSelect });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new StaffEmailConflictError();
      }
      throw error;
    }
  }

  async update(
    restaurantId: string,
    userId: string,
    data: StaffDetails,
  ): Promise<StaffRecord | null> {
    try {
      // Tenant-scoped write: never touches a user outside this restaurant.
      const { count } = await this.prisma.user.updateMany({
        where: { id: userId, ...staffWhere(restaurantId) },
        data,
      });
      return count === 0 ? null : this.findById(restaurantId, userId);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new StaffEmailConflictError();
      }
      throw error;
    }
  }

  async updateStatus(
    restaurantId: string,
    userId: string,
    status: UserStatus,
  ): Promise<StaffRecord | null> {
    const { count } = await this.prisma.user.updateMany({
      where: { id: userId, ...staffWhere(restaurantId) },
      data: { status },
    });
    return count === 0 ? null : this.findById(restaurantId, userId);
  }

  findRoles(restaurantId: string): Promise<RoleRecord[]> {
    return this.prisma.role.findMany({
      where: { restaurantId },
      select: roleSelect,
      orderBy: { name: 'asc' },
    });
  }

  findRole(restaurantId: string, roleId: string): Promise<RoleRecord | null> {
    return this.prisma.role.findFirst({
      where: { id: roleId, restaurantId },
      select: roleSelect,
    });
  }
}
