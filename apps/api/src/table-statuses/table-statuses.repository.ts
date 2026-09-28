import { Injectable } from '@nestjs/common';
import { Prisma } from '@rms/db';

import { PrismaService } from '../common/database/prisma.service';

const tableStatusSelect = {
  id: true,
  code: true,
  name: true,
  sortOrder: true,
  isSystem: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TableStatusSelect;

export type TableStatusRecord = Prisma.TableStatusGetPayload<{
  select: typeof tableStatusSelect;
}>;

export type TableStatusDetails = {
  code: string;
  name: string;
  sortOrder: number;
};

export class TableStatusCodeConflictError extends Error {
  constructor() {
    super('Table status code is already in use');
    this.name = TableStatusCodeConflictError.name;
  }
}

export class TableStatusInUseError extends Error {
  constructor() {
    super('Table status is assigned to one or more tables');
    this.name = TableStatusInUseError.name;
  }
}

function isPrismaError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

@Injectable()
export class TableStatusesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findPage(
    restaurantId: string,
    skip: number,
    take: number,
  ): Promise<{ items: TableStatusRecord[]; total: number }> {
    const where: Prisma.TableStatusWhereInput = { restaurantId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tableStatus.findMany({
        where,
        select: tableStatusSelect,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        skip,
        take,
      }),
      this.prisma.tableStatus.count({ where }),
    ]);
    return { items, total };
  }

  findById(restaurantId: string, statusId: string): Promise<TableStatusRecord | null> {
    return this.prisma.tableStatus.findFirst({
      where: { id: statusId, restaurantId },
      select: tableStatusSelect,
    });
  }

  async findIds(restaurantId: string): Promise<string[]> {
    const statuses = await this.prisma.tableStatus.findMany({
      where: { restaurantId },
      select: { id: true },
    });
    return statuses.map(({ id }) => id);
  }

  async nextSortOrder(restaurantId: string): Promise<number> {
    const result = await this.prisma.tableStatus.aggregate({
      where: { restaurantId },
      _max: { sortOrder: true },
    });
    return (result._max.sortOrder ?? -1) + 1;
  }

  async create(restaurantId: string, details: TableStatusDetails): Promise<TableStatusRecord> {
    try {
      return await this.prisma.tableStatus.create({
        data: { restaurantId, ...details },
        select: tableStatusSelect,
      });
    } catch (error) {
      if (isPrismaError(error, 'P2002')) throw new TableStatusCodeConflictError();
      throw error;
    }
  }

  async update(
    restaurantId: string,
    statusId: string,
    details: TableStatusDetails,
  ): Promise<TableStatusRecord | null> {
    try {
      const { count } = await this.prisma.tableStatus.updateMany({
        where: { id: statusId, restaurantId },
        data: details,
      });
      return count === 0 ? null : this.findById(restaurantId, statusId);
    } catch (error) {
      if (isPrismaError(error, 'P2002')) throw new TableStatusCodeConflictError();
      throw error;
    }
  }

  async updateActive(
    restaurantId: string,
    statusId: string,
    isActive: boolean,
  ): Promise<TableStatusRecord | null> {
    const { count } = await this.prisma.tableStatus.updateMany({
      where: { id: statusId, restaurantId },
      data: { isActive },
    });
    return count === 0 ? null : this.findById(restaurantId, statusId);
  }

  async reorder(restaurantId: string, orderedIds: string[]): Promise<void> {
    await this.prisma.$transaction(
      orderedIds.map((id, sortOrder) =>
        this.prisma.tableStatus.updateMany({
          where: { id, restaurantId },
          data: { sortOrder },
        }),
      ),
    );
  }

  async delete(restaurantId: string, statusId: string): Promise<boolean> {
    try {
      const { count } = await this.prisma.tableStatus.deleteMany({
        where: { id: statusId, restaurantId },
      });
      return count > 0;
    } catch (error) {
      if (isPrismaError(error, 'P2003')) throw new TableStatusInUseError();
      throw error;
    }
  }
}
