import { Injectable } from '@nestjs/common';
import { Prisma, type UserStatus } from '@rms/db';

import { PrismaService } from '../../common/database/prisma.service';

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
      isOwner: true,
      permissions: { select: { permissionKey: true } },
    },
  },
} satisfies Prisma.UserSelect;

const roleSelect = {
  id: true,
  name: true,
  isOwner: true,
  permissions: { select: { permissionKey: true } },
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

/** Email is fixed at creation, so edits never carry one. */
export type StaffUpdateDetails = Omit<StaffDetails, 'email'>;

export class StaffEmailConflictError extends Error {
  constructor() {
    super('Email address is already in use');
    this.name = StaffEmailConflictError.name;
  }
}

/** Staff are all of the restaurant's users, Account Owners included (their changes are guarded). */
function staffWhere(restaurantId: string): Prisma.UserWhereInput {
  return { restaurantId };
}

/** A change that would leave the restaurant without an active Account Owner. */
export class LastOwnerError extends Error {
  constructor(
    readonly ownerName: string,
    readonly change: 'role' | 'status',
  ) {
    super(`${ownerName} is the only active Account Owner`);
    this.name = LastOwnerError.name;
  }
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

  async isEmailTaken(email: string): Promise<boolean> {
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });

    return user !== null;
  }

  async create(data: StaffDetails & { restaurantId: string }): Promise<StaffRecord> {
    try {
      return await this.prisma.user.create({
        data: { ...data, passwordHash: null, status: 'INVITED' },
        select: staffSelect,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new StaffEmailConflictError();
      }
      throw error;
    }
  }

  findInvitationContext(
    restaurantId: string,
    inviterId: string,
  ): Promise<{ inviterName: string; restaurantName: string } | null> {
    return this.prisma.user
      .findFirst({
        where: { id: inviterId, restaurantId },
        select: { name: true, restaurant: { select: { name: true } } },
      })
      .then((record) =>
        record ? { inviterName: record.name, restaurantName: record.restaurant.name } : null,
      );
  }

  async update(
    restaurantId: string,
    userId: string,
    data: StaffUpdateDetails,
  ): Promise<StaffRecord | null> {
    // Tenant-scoped write: never touches a user outside this restaurant.
    const count = await this.guardedUpdate(restaurantId, userId, data);
    return count === 0 ? null : this.findById(restaurantId, userId);
  }

  /**
   * Updates the user inside a transaction that first locks the restaurant's active Owners, so two
   * concurrent demotions cannot both pass the "at least one active Owner" check.
   */
  private async guardedUpdate(
    restaurantId: string,
    userId: string,
    data: { roleId?: string; status?: UserStatus } & Prisma.UserUpdateManyMutationInput,
  ): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
        WHERE u.restaurant_id = ${restaurantId}::uuid AND r.is_owner AND u.status = 'ACTIVE'
        FOR UPDATE OF u`;
      const target = await tx.user.findFirst({
        where: { id: userId, restaurantId },
        select: { name: true, status: true, role: { select: { isOwner: true } } },
      });
      if (target?.role.isOwner && target.status === 'ACTIVE') {
        const staysOwner = data.roleId
          ? (await tx.role.findFirst({ where: { id: data.roleId, restaurantId } }))?.isOwner
          : true;
        const staysActive = data.status ? data.status === 'ACTIVE' : true;
        if (!staysOwner || !staysActive) {
          const owners = await tx.user.count({
            where: { restaurantId, status: 'ACTIVE', role: { isOwner: true } },
          });
          if (owners <= 1) throw new LastOwnerError(target.name, staysOwner ? 'status' : 'role');
        }
      }
      const { count } = await tx.user.updateMany({
        where: { id: userId, restaurantId },
        data,
      });
      return count;
    });
  }

  async updateStatus(
    restaurantId: string,
    userId: string,
    status: UserStatus,
  ): Promise<StaffRecord | null> {
    const count = await this.guardedUpdate(restaurantId, userId, { status });
    return count === 0 ? null : this.findById(restaurantId, userId);
  }

  async updatePassword(
    restaurantId: string,
    userId: string,
    passwordHash: string,
  ): Promise<StaffRecord | null> {
    const { count } = await this.prisma.user.updateMany({
      where: { id: userId, ...staffWhere(restaurantId) },
      data: { passwordHash },
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
