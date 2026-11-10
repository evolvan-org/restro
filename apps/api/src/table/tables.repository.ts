import { Injectable } from '@nestjs/common';
import { Prisma, UserStatus } from '@rms/db';

import { PrismaService } from '../common/database/prisma.service';
import { reconcileRestaurantTableStatuses } from '../common/database/table-lifecycle';

const restaurantTableSelect = (restaurantId: string, completedOrderIds: string[] = []) =>
  ({
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
      where: {
        restaurantId,
        OR: [{ status: { in: ['OPEN', 'SUBMITTED'] } }, { id: { in: completedOrderIds } }],
      },
      select: {
        id: true,
        status: true,
        openedAt: true,
        completedAt: true,
        bill: { select: { id: true, billNumber: true, status: true } },
        _count: { select: { kots: { where: { restaurantId, status: 'READY' } } } },
      },
      orderBy: [{ openedAt: 'desc' }, { id: 'desc' }],
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
  }) satisfies Prisma.RestaurantTableSelect;

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
  select: ReturnType<typeof restaurantTableSelect>;
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

export type TableActiveContext = {
  statusCode: string;
  hasActiveOrder: boolean;
  hasActiveReservation: boolean;
  section: { isActive: boolean } | null;
  sectionChanged: boolean;
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

  async findActiveBoard(restaurantId: string): Promise<TableRecord[]> {
    const completedOrderIds = await this.latestCompletedOrderIds(restaurantId);
    return this.prisma.restaurantTable.findMany({
      where: { restaurantId, isActive: true },
      select: restaurantTableSelect(restaurantId, completedOrderIds),
      orderBy: [{ tableNumber: 'asc' }, { id: 'asc' }],
    });
  }

  async findPage(
    restaurantId: string,
    filters: TablePageFilters,
  ): Promise<{ items: TableRecord[]; total: number }> {
    const completedOrderIds = await this.latestCompletedOrderIds(restaurantId);
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
        select: restaurantTableSelect(restaurantId, completedOrderIds),
        orderBy: [{ tableNumber: 'asc' }, { id: 'asc' }],
        skip: filters.skip,
        take: filters.take,
      }),
      this.prisma.restaurantTable.count({ where }),
    ]);

    return { items, total };
  }

  async findById(restaurantId: string, tableId: string): Promise<TableRecord | null> {
    const completedOrderIds = await this.latestCompletedOrderIds(restaurantId);
    return this.prisma.restaurantTable.findFirst({
      where: { id: tableId, restaurantId },
      select: restaurantTableSelect(restaurantId, completedOrderIds),
    });
  }

  private async latestCompletedOrderIds(restaurantId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT ON (o.table_id) o.id
      FROM orders o
      JOIN restaurant_tables t ON t.id = o.table_id AND t.restaurant_id = o.restaurant_id
      JOIN table_statuses s ON s.id = t.current_status_id AND s.restaurant_id = t.restaurant_id
      WHERE o.restaurant_id = ${restaurantId}::uuid AND o.status = 'COMPLETED'
        AND s.code = 'NEEDS_CLEANING'
      ORDER BY o.table_id, o.completed_at DESC NULLS LAST, o.id DESC
    `;
    return rows.map((row) => row.id);
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

  async create(
    restaurantId: string,
    data: TableDetails,
    validateSection: (section: { isActive: boolean } | null) => void,
  ): Promise<TableRecord> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const section = await this.lockSection(tx, restaurantId, data.sectionId);
        validateSection(section);
        return tx.restaurantTable.create({
          data: { restaurantId, ...data },
          select: restaurantTableSelect(restaurantId),
        });
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
    validateSection: (section: { isActive: boolean } | null) => void,
  ): Promise<TableRecord | null> {
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        if (data.sectionId !== undefined) {
          validateSection(await this.lockSection(tx, restaurantId, data.sectionId));
        }
        await tx.$queryRaw`SELECT id FROM restaurant_tables WHERE id = ${tableId}::uuid AND restaurant_id = ${restaurantId}::uuid FOR UPDATE`;
        return tx.restaurantTable.updateMany({ where: { id: tableId, restaurantId }, data });
      });
      return updated.count === 0 ? null : this.findById(restaurantId, tableId);
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
    validate: (context: TableActiveContext) => void,
  ): Promise<TableRecord | null> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const candidate = await tx.restaurantTable.findFirst({
        where: { id: tableId, restaurantId },
        select: { sectionId: true },
      });
      if (!candidate) return false;
      const section = isActive
        ? await this.lockSection(tx, restaurantId, candidate.sectionId)
        : null;
      await tx.$queryRaw`SELECT id FROM restaurant_tables WHERE id = ${tableId}::uuid AND restaurant_id = ${restaurantId}::uuid FOR UPDATE`;
      const table = await tx.restaurantTable.findFirst({
        where: { id: tableId, restaurantId },
        select: { sectionId: true, currentStatus: { select: { code: true } } },
      });
      if (!table) return false;
      const [order, reservation] = await Promise.all([
        tx.order.findFirst({
          where: { restaurantId, tableId, status: { in: ['OPEN', 'SUBMITTED'] } },
          select: { id: true },
        }),
        tx.reservation.findFirst({
          where: { restaurantId, tableId, status: { in: ['BOOKED', 'SEATED'] } },
          select: { id: true },
        }),
      ]);
      validate({
        statusCode: table.currentStatus.code,
        hasActiveOrder: Boolean(order),
        hasActiveReservation: Boolean(reservation),
        section,
        sectionChanged: table.sectionId !== candidate.sectionId,
      });
      await tx.restaurantTable.updateMany({
        where: { id: tableId, restaurantId },
        data: { isActive },
      });
      return true;
    });
    return updated ? this.findById(restaurantId, tableId) : null;
  }

  private async lockSection(
    tx: Prisma.TransactionClient,
    restaurantId: string,
    sectionId: string,
  ): Promise<{ isActive: boolean } | null> {
    await tx.$queryRaw`SELECT id FROM dining_sections WHERE id = ${sectionId}::uuid AND restaurant_id = ${restaurantId}::uuid FOR UPDATE`;
    return tx.diningSection.findFirst({
      where: { id: sectionId, restaurantId },
      select: { isActive: true },
    });
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
