import { randomUUID } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateBillCancellationReasonRequest,
  ManagedBillCancellationReason,
  ManagedBillCancellationReasonListQuery,
  ManagedBillCancellationReasonListResponse,
  RenameBillCancellationReasonRequest,
} from '@rms/api-contract';
import { buildPageMeta } from '@rms/shared';

import type { Actor } from '../common/auth/authenticated-request';
import { BillCancellationReasonsRepository } from './bill-cancellation-reasons.repository';

@Injectable()
export class BillCancellationReasonsService {
  constructor(private readonly repository: BillCancellationReasonsRepository) {}

  async list(
    actor: Actor,
    query: ManagedBillCancellationReasonListQuery,
  ): Promise<ManagedBillCancellationReasonListResponse> {
    const { items, total } = await this.repository.list(actor.restaurantId, query);
    return { data: items, meta: buildPageMeta(query.page, query.pageSize, total) };
  }

  async create(
    actor: Actor,
    input: CreateBillCancellationReasonRequest,
  ): Promise<ManagedBillCancellationReason> {
    const highest = await this.repository.highestSortOrder(actor.restaurantId);
    return this.repository.create(actor.restaurantId, {
      name: input.name,
      code: `CUSTOM_${randomUUID()}`,
      sortOrder: (highest ?? -1) + 1,
    });
  }

  async rename(
    actor: Actor,
    id: string,
    input: RenameBillCancellationReasonRequest,
  ): Promise<ManagedBillCancellationReason> {
    return this.requireReason(
      await this.repository.update(actor.restaurantId, id, { name: input.name }),
    );
  }

  async deactivate(actor: Actor, id: string): Promise<ManagedBillCancellationReason> {
    return this.requireReason(
      await this.repository.update(actor.restaurantId, id, { isActive: false }),
    );
  }

  private requireReason(
    reason: ManagedBillCancellationReason | null,
  ): ManagedBillCancellationReason {
    if (!reason) throw new NotFoundException('Bill cancellation reason not found');
    return reason;
  }
}
