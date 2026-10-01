import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type CreateTableStatusRequest,
  type TableStatus,
  type TableStatusListQuery,
  type TableStatusListResponse,
  type UpdateTableStatusActiveRequest,
  type UpdateTableStatusRequest,
} from '@rms/api-contract';
import { buildPageMeta } from '@rms/shared';

import type { Actor } from '../common/auth/authenticated-request';
import {
  TableStatusCodeConflictError,
  type TableStatusDetails,
  TableStatusesRepository,
  type TableStatusRecord,
} from './table-statuses.repository';

const CODE_IN_USE_MESSAGE = 'A table status with this code already exists';

@Injectable()
export class TableStatusesService {
  constructor(private readonly repository: TableStatusesRepository) {}

  async list(actor: Actor, query: TableStatusListQuery): Promise<TableStatusListResponse> {
    const { page, pageSize } = query;
    const { items, total } = await this.repository.findPage(
      actor.restaurantId,
      (page - 1) * pageSize,
      pageSize,
    );
    return {
      data: items.map(toTableStatus),
      meta: buildPageMeta(page, pageSize, total),
    };
  }

  async create(actor: Actor, input: CreateTableStatusRequest): Promise<TableStatus> {
    const created = await this.mapCodeConflict(() =>
      this.repository.create(actor.restaurantId, toDetails(input)),
    );
    return toTableStatus(created);
  }

  async update(
    actor: Actor,
    statusId: string,
    input: UpdateTableStatusRequest,
  ): Promise<TableStatus> {
    const existing = await this.assertExists(actor.restaurantId, statusId);
    if (existing.isSystem && input.code !== existing.code) {
      throw new BadRequestException('A system status code cannot be changed');
    }

    const updated = await this.mapCodeConflict(() =>
      this.repository.update(actor.restaurantId, statusId, toDetails(input)),
    );
    if (!updated) throw new NotFoundException('Table status not found');
    return toTableStatus(updated);
  }

  async updateActive(
    actor: Actor,
    statusId: string,
    input: UpdateTableStatusActiveRequest,
  ): Promise<TableStatus> {
    const existing = await this.assertExists(actor.restaurantId, statusId);
    if (existing.isActive === input.isActive) return toTableStatus(existing);

    const updated = await this.repository.updateActive(
      actor.restaurantId,
      statusId,
      input.isActive,
    );
    if (!updated) throw new NotFoundException('Table status not found');
    return toTableStatus(updated);
  }

  async archive(actor: Actor, statusId: string): Promise<TableStatus> {
    const existing = await this.assertExists(actor.restaurantId, statusId);
    if (existing.isSystem) {
      throw new ConflictException('System table statuses cannot be archived');
    }
    if (!existing.isActive) return toTableStatus(existing);

    const updated = await this.repository.updateActive(actor.restaurantId, statusId, false);
    if (!updated) throw new NotFoundException('Table status not found');
    return toTableStatus(updated);
  }

  private async assertExists(restaurantId: string, statusId: string): Promise<TableStatusRecord> {
    const status = await this.repository.findById(restaurantId, statusId);
    if (!status) throw new NotFoundException('Table status not found');
    return status;
  }

  private async mapCodeConflict<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (error instanceof TableStatusCodeConflictError) {
        throw new ConflictException(CODE_IN_USE_MESSAGE);
      }
      throw error;
    }
  }
}

function toDetails(input: CreateTableStatusRequest | UpdateTableStatusRequest): TableStatusDetails {
  return { code: input.code, name: input.name };
}

function toTableStatus(record: TableStatusRecord): TableStatus {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
