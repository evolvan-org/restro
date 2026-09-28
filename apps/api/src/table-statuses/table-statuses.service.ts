import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type CreateTableStatusRequest,
  type ReorderTableStatusesRequest,
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
  TableStatusInUseError,
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
    const sortOrder = input.sortOrder ?? (await this.repository.nextSortOrder(actor.restaurantId));
    const created = await this.mapCodeConflict(() =>
      this.repository.create(actor.restaurantId, toDetails(input, sortOrder)),
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
      this.repository.update(actor.restaurantId, statusId, toDetails(input, input.sortOrder)),
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

  async reorder(actor: Actor, input: ReorderTableStatusesRequest): Promise<TableStatus[]> {
    const existingIds = await this.repository.findIds(actor.restaurantId);
    if (
      existingIds.length !== input.orderedIds.length ||
      existingIds.some((id) => !input.orderedIds.includes(id))
    ) {
      throw new BadRequestException(
        'The table status list has changed. Refresh the page before reordering.',
      );
    }

    await this.repository.reorder(actor.restaurantId, input.orderedIds);
    const { items } = await this.repository.findPage(
      actor.restaurantId,
      0,
      input.orderedIds.length,
    );
    return items.map(toTableStatus);
  }

  async delete(actor: Actor, statusId: string): Promise<void> {
    const existing = await this.assertExists(actor.restaurantId, statusId);
    if (existing.isSystem) {
      throw new ConflictException('System table statuses cannot be deleted');
    }

    try {
      if (!(await this.repository.delete(actor.restaurantId, statusId))) {
        throw new NotFoundException('Table status not found');
      }
    } catch (error) {
      if (error instanceof TableStatusInUseError) {
        throw new ConflictException(
          'This table status is assigned to one or more tables. Deactivate it instead.',
        );
      }
      throw error;
    }
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

function toDetails(
  input: CreateTableStatusRequest | UpdateTableStatusRequest,
  sortOrder: number,
): TableStatusDetails {
  return { code: input.code, name: input.name, sortOrder };
}

function toTableStatus(record: TableStatusRecord): TableStatus {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
