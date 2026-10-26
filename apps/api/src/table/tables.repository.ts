import { Injectable } from '@nestjs/common';
import { Prisma, UserStatus } from '@rms/db';

import { PrismaService } from '../common/database/prisma.service';
import { reconcileRestaurantTableStatuses } from '../common/database/table-lifecycle';

const restaurantTableSelect = {
  id: true,
  tableNumber: true,
  capacity: true,
  isActive: true,
  statusChangedAt: true,
  createdAt: true,
  updatedAt: true,
  captainUserId: true,
  captain: { select: { id: true, name: true, role: { select: { name: true } } } },
  reservations: {
    where: { status: { in: ['BOOKED', 'SEATED'] } },
    select: {
      id: true,
      reservationAt: true,
      partySize: true,
      status: true,
      notes: true,
      guest: { select: { id: true, guestName: true, phoneNumber: true } },
    },
    orderBy: [{ reservationAt: 'asc' }, { id: 'asc' }],
  },
  orders: {
    where: { status: { in: ['OPEN', 'SUBMITTED'] } },
    select: { id: true },
    orderBy: [{ openedAt: 'asc' }, { id: 'asc' }],
    take: 1,
  },
  section: {
    select: {
      id: true,
      name: true,
    },
  },
  currentStatus: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
} satisfies Prisma.RestaurantTableSelect;

const sectionSelect = {
  id: true,
  name: true,
} satisfies Prisma.DiningSectionSelect;

const statusSelect = {
  id: true,
  code: true,
  name: true,
} satisfies Prisma.TableStatusSelect;

const lifecycleStatusSelect = {
  id: true,
  code: true,
  name: true,
  sortOrder: true,
} satisfies Prisma.TableStatusSelect;

const captainCandidateSelect = {
  id: true,
  restaurantId: true,
  name: true,
  status: true,
  role: { select: { name: true } },
} satisfies Prisma.UserSelect;

export type CaptainCandidate = Prisma.UserGetPayload<{ select: typeof captainCandidateSelect }>;

export type TableRecord = Prisma.RestaurantTableGetPayload<{
  select: typeof restaurantTableSelect;
}>;
export type DiningSectionRecord = Prisma.DiningSectionGetPayload<{ select: typeof sectionSelect }>;
export type TableStatusRecord = Prisma.TableStatusGetPayload<{ select: typeof statusSelect }>;
export type LifecycleStatusRecord = Prisma.TableStatusGetPayload<{
  select: typeof lifecycleStatusSelect;
}>;

export type TablePageFilters = {
  search?: string;
  sectionId?: string;
  statusId?: string;
  isActive?: boolean;
  skip: number;
  take: number;
};

export type TableDetails = {
  tableNumber: string;
  capacity: number;
  sectionId: string;
  currentStatusId: string;
  captainUserId?: string | null;
};

export class TableNumberConflictError extends Error {
  constructor() {
    super('Table number is already in use');
    this.name = TableNumberConflictError.name;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Injectable()
export class TablesRepository {
  constructor(private readonly prisma: PrismaService) {}

  reconcileStatuses(restaurantId: string): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      await reconcileRestaurantTableStatuses(tx, restaurantId);
    });
  }

  async reconcileAllStatuses(): Promise<void> {
    const restaurants = await this.prisma.restaurantTable.findMany({
      distinct: ['restaurantId'],
      select: { restaurantId: true },
    });
    for (const { restaurantId } of restaurants) {
      await this.reconcileStatuses(restaurantId);
    }
  }

  async findPage(
    restaurantId: string,
    filters: TablePageFilters,
  ): Promise<{ items: TableRecord[]; total: number }> {
    const where: Prisma.RestaurantTableWhereInput = {
      restaurantId,
      ...(filters.search && {
        tableNumber: { contains: filters.search, mode: 'insensitive' },
      }),
      ...(filters.sectionId && { sectionId: filters.sectionId }),
      ...(filters.statusId && { currentStatusId: filters.statusId }),
      ...(filters.isActive !== undefined && { isActive: filters.isActive }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.restaurantTable.findMany({
        where,
        select: restaurantTableSelect,
        orderBy: [{ tableNumber: 'asc' }, { id: 'asc' }],
        skip: filters.skip,
        take: filters.take,
      }),
      this.prisma.restaurantTable.count({ where }),
    ]);

    return { items, total };
  }

  findById(restaurantId: string, tableId: string): Promise<TableRecord | null> {
    return this.prisma.restaurantTable.findFirst({
      where: { id: tableId, restaurantId },
      select: restaurantTableSelect,
    });
  }

  findCaptainCandidate(restaurantId: string, userId: string): Promise<CaptainCandidate | null> {
    return this.prisma.user.findFirst({
      where: { id: userId, restaurantId },
      select: captainCandidateSelect,
    });
  }

  listActiveUsers(restaurantId: string): Promise<CaptainCandidate[]> {
    return this.prisma.user.findMany({
      where: { restaurantId, status: UserStatus.ACTIVE },
      select: captainCandidateSelect,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  async updateCaptain(
    restaurantId: string,
    tableId: string,
    captainUserId: string | null,
  ): Promise<TableRecord | null> {
    const { count } = await this.prisma.restaurantTable.updateMany({
      where: { id: tableId, restaurantId },
      data: { captainUserId },
    });
    return count === 0 ? null : this.findById(restaurantId, tableId);
  }

  findSection(restaurantId: string, sectionId: string): Promise<DiningSectionRecord | null> {
    return this.prisma.diningSection.findFirst({
      where: { id: sectionId, restaurantId },
      select: sectionSelect,
    });
  }

  findStatus(restaurantId: string, statusId: string): Promise<TableStatusRecord | null> {
    return this.prisma.tableStatus.findFirst({
      where: { id: statusId, restaurantId },
      select: statusSelect,
    });
  }

  findDefaultStatus(restaurantId: string): Promise<TableStatusRecord | null> {
    return this.prisma.tableStatus.findFirst({
      where: { restaurantId, isActive: true },
      select: statusSelect,
      orderBy: [{ isSystem: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    });
  }

  findSections(restaurantId: string): Promise<DiningSectionRecord[]> {
    return this.prisma.diningSection.findMany({
      where: { restaurantId, isActive: true },
      select: sectionSelect,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    });
  }

  findStatuses(restaurantId: string): Promise<TableStatusRecord[]> {
    return this.prisma.tableStatus.findMany({
      where: { restaurantId, isActive: true },
      select: statusSelect,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    });
  }

  async findLifecycleStatuses(restaurantId: string): Promise<LifecycleStatusRecord[]> {
    return this.prisma.tableStatus.findMany({
      where: {
        restaurantId,
        isActive: true,
      },
      select: lifecycleStatusSelect,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { code: 'asc' }],
    });
  }

  async findLifecycleStatus(
    restaurantId: string,
    code: string,
  ): Promise<LifecycleStatusRecord | null> {
    return this.prisma.tableStatus.findFirst({
      where: { restaurantId, code, isActive: true },
      select: lifecycleStatusSelect,
    });
  }

  async isTableNumberTaken(
    restaurantId: string,
    tableNumber: string,
    excludeTableId?: string,
  ): Promise<boolean> {
    const table = await this.prisma.restaurantTable.findFirst({
      where: {
        restaurantId,
        tableNumber: { equals: tableNumber, mode: 'insensitive' },
        ...(excludeTableId && { id: { not: excludeTableId } }),
      },
      select: { id: true },
    });

    return table !== null;
  }

  async create(restaurantId: string, data: TableDetails): Promise<TableRecord> {
    try {
      return await this.prisma.restaurantTable.create({
        data: { restaurantId, ...data },
        select: restaurantTableSelect,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new TableNumberConflictError();
      }
      throw error;
    }
  }

  async update(
    restaurantId: string,
    tableId: string,
    data: Partial<TableDetails>,
  ): Promise<TableRecord | null> {
    try {
      const { count } = await this.prisma.restaurantTable.updateMany({
        where: { id: tableId, restaurantId },
        data,
      });
      return count === 0 ? null : this.findById(restaurantId, tableId);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new TableNumberConflictError();
      }
      throw error;
    }
  }

  async updateActiveState(
    restaurantId: string,
    tableId: string,
    isActive: boolean,
  ): Promise<TableRecord | null> {
    const { count } = await this.prisma.restaurantTable.updateMany({
      where: { id: tableId, restaurantId },
      data: { isActive },
    });
    return count === 0 ? null : this.findById(restaurantId, tableId);
  }

  async updateStatus(
    restaurantId: string,
    tableId: string,
    expectedCurrentStatusId: string,
    targetStatusId: string,
  ): Promise<TableRecord | null> {
    const { count } = await this.prisma.restaurantTable.updateMany({
      where: { id: tableId, restaurantId, currentStatusId: expectedCurrentStatusId },
      data: { currentStatusId: targetStatusId, statusChangedAt: new Date() },
    });
    return count === 0 ? null : this.findById(restaurantId, tableId);
  }
}
