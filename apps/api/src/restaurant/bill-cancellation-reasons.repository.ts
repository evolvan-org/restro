import { Injectable } from '@nestjs/common';
import type {
  ManagedBillCancellationReason,
  ManagedBillCancellationReasonListQuery,
} from '@rms/api-contract';
import { Prisma } from '@rms/db';

import { PrismaService } from '../common/database/prisma.service';

const reasonSelect = { id: true, code: true, name: true, isActive: true } as const;

@Injectable()
export class BillCancellationReasonsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(
    restaurantId: string,
    query: ManagedBillCancellationReasonListQuery,
  ): Promise<{ items: ManagedBillCancellationReason[]; total: number }> {
    return this.prisma.$transaction(
      async (tx) => {
        const where = { restaurantId };
        const total = await tx.billCancellationReason.count({ where });
        const items = await tx.billCancellationReason.findMany({
          where,
          select: reasonSelect,
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        });
        return { items, total };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  highestSortOrder(restaurantId: string): Promise<number | null> {
    return this.prisma.billCancellationReason
      .aggregate({
        where: { restaurantId },
        _max: { sortOrder: true },
      })
      .then((result) => result._max.sortOrder);
  }

  create(
    restaurantId: string,
    data: { name: string; code: string; sortOrder: number },
  ): Promise<ManagedBillCancellationReason> {
    return this.prisma.billCancellationReason.create({
      data: { ...data, restaurantId },
      select: reasonSelect,
    });
  }

  async update(
    restaurantId: string,
    id: string,
    data: { name?: string; isActive?: false },
  ): Promise<ManagedBillCancellationReason | null> {
    try {
      return await this.prisma.billCancellationReason.update({
        where: { id, restaurantId },
        data,
        select: reasonSelect,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025')
        return null;
      throw error;
    }
  }
}
