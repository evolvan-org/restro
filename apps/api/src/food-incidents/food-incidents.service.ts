import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type AddFoodIncidentEntry,
  type CreateFoodIncident,
  type FoodIncident,
  type FoodIncidentBatchOptions,
  type FoodIncidentBatchQuery,
  type FoodIncidentHistory,
  type FoodIncidentList,
  type FoodIncidentQuery,
  foodIncidentSchema,
  type ResolveFoodIncident,
} from '@rms/api-contract';
import { buildPageMeta } from '@rms/shared';

import type { Actor } from '../common/auth/authenticated-request';
import { FoodIncidentsRepository, type IncidentRecord } from './food-incidents.repository';

function batchSnapshot(
  batch: Awaited<ReturnType<FoodIncidentsRepository['batches']>>[number],
): FoodIncidentBatchOptions['data'][number] {
  return {
    id: batch.id,
    batchNumber: batch.batchNumber,
    stockItemId: batch.stockItem.id,
    stockItemName: batch.stockItem.name,
    receiptId: batch.receiptLine?.receiptId ?? null,
    receivedAt: batch.receivedAt.toISOString(),
    expiryDate: batch.expiryDate?.toISOString().slice(0, 10) ?? null,
  };
}

function toIncident(record: IncidentRecord): FoodIncident {
  return foodIncidentSchema.parse({
    ...record,
    createdAt: record.createdAt.toISOString(),
    resolvedAt: record.resolvedAt?.toISOString() ?? null,
    batches: record.batches.map((link) => link.snapshot),
  });
}
function requireOpen(record: IncidentRecord | null, expectedVersion: number): IncidentRecord {
  if (!record) throw new NotFoundException('Food incident not found');
  if (record.status !== 'OPEN') throw new ConflictException('The incident is resolved');
  if (record.version !== expectedVersion)
    throw new ConflictException('The incident changed. Refresh and try again.');
  return record;
}
@Injectable()
export class FoodIncidentsService {
  constructor(private readonly repository: FoodIncidentsRepository) {}
  async batchOptions(
    actor: Actor,
    query: FoodIncidentBatchQuery,
  ): Promise<FoodIncidentBatchOptions> {
    const result = await this.repository.batchOptions(
      actor.restaurantId,
      query.page,
      query.pageSize,
    );
    return {
      data: result.data.map(batchSnapshot),
      meta: buildPageMeta(query.page, query.pageSize, result.total),
    };
  }
  async create(actor: Actor, input: CreateFoodIncident): Promise<FoodIncident> {
    const batches = await this.repository.batches(actor.restaurantId, input.batchIds);
    if (batches.length !== input.batchIds.length)
      throw new NotFoundException('One or more batches were not found');
    const links = batches.map((batch) => ({
      batchId: batch.id,
      snapshot: batchSnapshot(batch),
    }));
    return toIncident(
      await this.repository.create(
        actor.restaurantId,
        actor.userId,
        input.title,
        input.description,
        links,
      ),
    );
  }
  async get(actor: Actor, id: string): Promise<FoodIncident> {
    const record = await this.repository.find(actor.restaurantId, id);
    if (!record) throw new NotFoundException('Food incident not found');
    return toIncident(record);
  }
  async list(actor: Actor, query: FoodIncidentQuery): Promise<FoodIncidentList> {
    const result = await this.repository.list(actor.restaurantId, query);
    return {
      data: result.data.map(toIncident),
      meta: buildPageMeta(query.page, query.pageSize, result.total),
    };
  }
  append(actor: Actor, id: string, input: AddFoodIncidentEntry): Promise<FoodIncident> {
    return this.repository.withLocked(actor.restaurantId, id, async (context) => {
      const record = requireOpen(context.record, input.expectedVersion);
      return toIncident(
        await context.save(actor.userId, input.kind, input.note, { version: record.version + 1 }),
      );
    });
  }
  resolve(actor: Actor, id: string, input: ResolveFoodIncident): Promise<FoodIncident> {
    return this.repository.withLocked(actor.restaurantId, id, async (context) => {
      const record = requireOpen(context.record, input.expectedVersion);
      return toIncident(
        await context.save(actor.userId, 'RESOLVED', input.note, {
          version: record.version + 1,
          status: 'RESOLVED',
          resolvedAt: new Date(),
          resolvedByUserId: actor.userId,
          resolution: input.note,
        }),
      );
    });
  }
  async history(
    actor: Actor,
    id: string,
    page: number,
    pageSize: number,
  ): Promise<FoodIncidentHistory> {
    await this.get(actor, id);
    const result = await this.repository.history(actor.restaurantId, id, page, pageSize);
    return {
      data: result.data.map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        note: entry.note,
        actor: entry.actor,
        createdAt: entry.createdAt.toISOString(),
      })),
      meta: buildPageMeta(page, pageSize, result.total),
    };
  }
}
