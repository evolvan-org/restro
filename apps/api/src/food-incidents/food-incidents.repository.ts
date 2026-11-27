import { Injectable } from '@nestjs/common';
import type { FoodIncidentQuery } from '@rms/api-contract';
import { type FoodIncidentEntryKind, Prisma } from '@rms/db';

import { PrismaService } from '../common/database/prisma.service';

const include = {
  createdBy: { select: { id: true, name: true } },
  resolvedBy: { select: { id: true, name: true } },
  batches: { select: { snapshot: true }, orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.FoodIncidentInclude;
export type IncidentRecord = Prisma.FoodIncidentGetPayload<{ include: typeof include }>;
type Change = {
  version: number;
  status?: 'RESOLVED';
  resolvedAt?: Date;
  resolvedByUserId?: string;
  resolution?: string;
};
type LockedIncident = {
  record: IncidentRecord | null;
  save: (
    actorId: string,
    kind: FoodIncidentEntryKind,
    note: string,
    change: Change,
  ) => Promise<IncidentRecord>;
};

@Injectable()
export class FoodIncidentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  batchOptions(
    restaurantId: string,
    page: number,
    pageSize: number,
  ): Promise<{
    data: Awaited<ReturnType<FoodIncidentsRepository['batches']>>;
    total: number;
  }> {
    return this.prisma.$transaction(
      async (tx) => {
        const where = { restaurantId, stockItem: { restaurantId } };
        const total = await tx.stockBatch.count({ where });
        const skip = (page - 1) * pageSize;
        const data =
          skip >= total
            ? []
            : await tx.stockBatch.findMany({
                where,
                skip,
                take: pageSize,
                include: {
                  stockItem: { select: { id: true, name: true } },
                  receiptLine: { select: { receiptId: true } },
                },
                orderBy: [{ receivedAt: 'desc' }, { id: 'asc' }],
              });
        return { data, total };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  batches(restaurantId: string, ids: string[]) {
    return this.prisma.stockBatch.findMany({
      where: { restaurantId, id: { in: ids }, stockItem: { restaurantId } },
      include: {
        stockItem: { select: { id: true, name: true } },
        receiptLine: { select: { receiptId: true } },
      },
    });
  }
  create(
    restaurantId: string,
    actorId: string,
    title: string,
    description: string,
    batches: { batchId: string; snapshot: Prisma.InputJsonObject }[],
  ): Promise<IncidentRecord> {
    return this.prisma.foodIncident.create({
      data: {
        restaurantId,
        createdByUserId: actorId,
        title,
        description,
        batches: { create: batches.map((batch) => ({ ...batch, restaurantId })) },
        entries: {
          create: { restaurantId, actorId, kind: 'CREATED', note: description, version: 0 },
        },
      },
      include,
    });
  }
  find(restaurantId: string, id: string): Promise<IncidentRecord | null> {
    return this.prisma.foodIncident.findFirst({ where: { id, restaurantId }, include });
  }
  list(
    restaurantId: string,
    query: FoodIncidentQuery,
  ): Promise<{ data: IncidentRecord[]; total: number }> {
    return this.prisma.$transaction(
      async (tx) => {
        const where = { restaurantId, status: query.status };
        const total = await tx.foodIncident.count({ where });
        const skip = (query.page - 1) * query.pageSize;
        const data =
          skip >= total
            ? []
            : await tx.foodIncident.findMany({
                where,
                include,
                skip,
                take: query.pageSize,
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              });
        return { data, total };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  history(restaurantId: string, incidentId: string, page: number, pageSize: number) {
    return this.prisma.$transaction(
      async (tx) => {
        const where = { restaurantId, incidentId };
        const total = await tx.foodIncidentEntry.count({ where });
        const skip = (page - 1) * pageSize;
        const data =
          skip >= total
            ? []
            : await tx.foodIncidentEntry.findMany({
                where,
                skip,
                take: pageSize,
                include: { actor: { select: { id: true, name: true } } },
                orderBy: [{ version: 'asc' }, { id: 'asc' }],
              });
        return { data, total };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  withLocked<T>(
    restaurantId: string,
    id: string,
    work: (context: LockedIncident) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM food_incidents WHERE id=${id}::uuid AND restaurant_id=${restaurantId}::uuid FOR UPDATE`;
      const record = await tx.foodIncident.findFirst({ where: { id, restaurantId }, include });
      return work({
        record,
        save: async (actorId, kind, note, change) => {
          await tx.foodIncidentEntry.create({
            data: { restaurantId, incidentId: id, actorId, kind, note, version: change.version },
          });
          return tx.foodIncident.update({ where: { id, restaurantId }, data: change, include });
        },
      });
    });
  }
}
