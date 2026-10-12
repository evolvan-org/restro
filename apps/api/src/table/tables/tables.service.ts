import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type CreateTableRequest,
  type CreateTableResponse,
  type RestaurantTable,
  type TableListQuery,
  type TableListResponse,
  type TableOptionsResponse,
  type UpdateTableActiveRequest,
  type UpdateTableActiveResponse,
  type UpdateTableRequest,
  type UpdateTableResponse,
} from '@rms/api-contract';
import { buildPageMeta } from '@rms/shared';

import type { Actor } from '../../common/auth/authenticated-request';
import {
  type TableDetails,
  TableNumberConflictError,
  type TableRecord,
  TablesRepository,
} from './tables.repository';

const TABLE_NUMBER_IN_USE_MESSAGE = 'Table number is already in use';

@Injectable()
export class TablesService {
  constructor(private readonly tablesRepository: TablesRepository) {}

  async list(actor: Actor, query: TableListQuery): Promise<TableListResponse> {
    const { page, pageSize, search, sectionId, statusId, isActive } = query;
    const { items, total } = await this.tablesRepository.findPage(actor.restaurantId, {
      search: search || undefined,
      sectionId,
      statusId,
      isActive,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return {
      data: items.map(toRestaurantTable),
      meta: buildPageMeta(page, pageSize, total),
    };
  }

  async create(actor: Actor, input: CreateTableRequest): Promise<CreateTableResponse> {
    const details = await this.toTableDetails(actor.restaurantId, input);
    await this.assertTableNumberAvailable(actor.restaurantId, details.tableNumber);

    const created = await this.mapTableNumberConflict(() =>
      this.tablesRepository.create(actor.restaurantId, details),
    );

    return toRestaurantTable(created);
  }

  async options(actor: Actor): Promise<TableOptionsResponse> {
    const [sections, statuses] = await Promise.all([
      this.tablesRepository.findSections(actor.restaurantId),
      this.tablesRepository.findStatuses(actor.restaurantId),
    ]);

    return { sections, statuses };
  }

  async update(
    actor: Actor,
    tableId: string,
    input: UpdateTableRequest,
  ): Promise<UpdateTableResponse> {
    const existing = await this.findInRestaurant(actor.restaurantId, tableId);
    const details = await this.toPartialTableDetails(actor.restaurantId, input);

    if (
      details.tableNumber !== undefined &&
      details.tableNumber.toLowerCase() !== existing.tableNumber.toLowerCase()
    ) {
      await this.assertTableNumberAvailable(actor.restaurantId, details.tableNumber, tableId);
    }

    const updated = await this.mapTableNumberConflict(() =>
      this.tablesRepository.update(actor.restaurantId, tableId, details),
    );
    if (!updated) {
      throw new NotFoundException('Table not found');
    }

    return toRestaurantTable(updated);
  }

  async updateActiveState(
    actor: Actor,
    tableId: string,
    input: UpdateTableActiveRequest,
  ): Promise<UpdateTableActiveResponse> {
    const existing = await this.findInRestaurant(actor.restaurantId, tableId);
    if (existing.isActive === input.isActive) {
      return toRestaurantTable(existing);
    }

    const updated = await this.tablesRepository.updateActiveState(
      actor.restaurantId,
      tableId,
      input.isActive,
    );
    if (!updated) {
      throw new NotFoundException('Table not found');
    }

    return toRestaurantTable(updated);
  }

  private async findInRestaurant(restaurantId: string, tableId: string): Promise<TableRecord> {
    const table = await this.tablesRepository.findById(restaurantId, tableId);
    if (!table) {
      throw new NotFoundException('Table not found');
    }
    return table;
  }

  private async toTableDetails(
    restaurantId: string,
    input: CreateTableRequest,
  ): Promise<TableDetails> {
    await this.assertSectionExists(restaurantId, input.sectionId);
    const currentStatusId = input.currentStatusId ?? (await this.defaultStatusId(restaurantId));
    await this.assertStatusExists(restaurantId, currentStatusId);

    return {
      tableNumber: input.tableNumber,
      capacity: input.capacity,
      sectionId: input.sectionId,
      currentStatusId,
    };
  }

  private async toPartialTableDetails(
    restaurantId: string,
    input: UpdateTableRequest,
  ): Promise<Partial<TableDetails>> {
    if (input.sectionId !== undefined) {
      await this.assertSectionExists(restaurantId, input.sectionId);
    }
    if (input.currentStatusId !== undefined) {
      await this.assertStatusExists(restaurantId, input.currentStatusId);
    }

    return {
      ...(input.tableNumber !== undefined && { tableNumber: input.tableNumber }),
      ...(input.capacity !== undefined && { capacity: input.capacity }),
      ...(input.sectionId !== undefined && { sectionId: input.sectionId }),
      ...(input.currentStatusId !== undefined && { currentStatusId: input.currentStatusId }),
    };
  }

  private async assertSectionExists(restaurantId: string, sectionId: string): Promise<void> {
    if (!(await this.tablesRepository.findSection(restaurantId, sectionId))) {
      throw new BadRequestException('The selected section does not exist');
    }
  }

  private async assertStatusExists(restaurantId: string, statusId: string): Promise<void> {
    if (!(await this.tablesRepository.findStatus(restaurantId, statusId))) {
      throw new BadRequestException('The selected status does not exist');
    }
  }

  private async defaultStatusId(restaurantId: string): Promise<string> {
    const status = await this.tablesRepository.findDefaultStatus(restaurantId);
    if (!status) {
      throw new BadRequestException('No active table status is configured');
    }
    return status.id;
  }

  private async assertTableNumberAvailable(
    restaurantId: string,
    tableNumber: string,
    excludeTableId?: string,
  ): Promise<void> {
    if (await this.tablesRepository.isTableNumberTaken(restaurantId, tableNumber, excludeTableId)) {
      throw new ConflictException(TABLE_NUMBER_IN_USE_MESSAGE);
    }
  }

  private async mapTableNumberConflict<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (error instanceof TableNumberConflictError) {
        throw new ConflictException(TABLE_NUMBER_IN_USE_MESSAGE);
      }
      throw error;
    }
  }
}

function toRestaurantTable(record: TableRecord): RestaurantTable {
  return {
    id: record.id,
    tableNumber: record.tableNumber,
    capacity: record.capacity,
    isActive: record.isActive,
    section: record.section,
    currentStatus: record.currentStatus,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
