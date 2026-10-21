import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type AssignTableCaptainRequest,
  type AssignTableCaptainResponse,
  type CaptainOptionsResponse,
  type CreateTableRequest,
  type CreateTableResponse,
  type RestaurantTable,
  type TableLifecycleStatusListResponse,
  type TableListQuery,
  type TableListResponse,
  type TableOptionsResponse,
  type TransitionTableStatusRequest,
  type TransitionTableStatusResponse,
  type UpdateTableActiveRequest,
  type UpdateTableActiveResponse,
  type UpdateTableRequest,
  type UpdateTableResponse,
} from '@rms/api-contract';
import { isRole, Permission, roleHasPermission } from '@rms/permissions';
import { buildPageMeta } from '@rms/shared';

import type { Actor } from '../common/auth/authenticated-request';
import { RealtimeService } from '../realtime/realtime.service';
import {
  type TableDetails,
  TableNumberConflictError,
  type TableRecord,
  TablesRepository,
} from './tables.repository';

const TABLE_NUMBER_IN_USE_MESSAGE = 'Table number is already in use';

@Injectable()
export class TablesService {
  constructor(
    private readonly tablesRepository: TablesRepository,
    private readonly realtime: RealtimeService,
  ) {}

  async listCaptains(actor: Actor): Promise<CaptainOptionsResponse> {
    const users = await this.tablesRepository.listActiveUsers(actor.restaurantId);
    return users
      .filter((user) => isEligibleCaptainRole(user.role.name))
      .map((user) => ({ id: user.id, name: user.name, role: user.role.name }));
  }

  async assignCaptain(
    actor: Actor,
    tableId: string,
    input: AssignTableCaptainRequest,
  ): Promise<AssignTableCaptainResponse> {
    await this.findInRestaurant(actor.restaurantId, tableId);
    await this.assertCaptainEligible(actor.restaurantId, input.captainUserId);

    const updated = await this.tablesRepository.updateCaptain(
      actor.restaurantId,
      tableId,
      input.captainUserId,
    );
    if (!updated) {
      throw new NotFoundException('Table not found');
    }
    await this.realtime.publishChange(actor.restaurantId, 'tables');
    return toRestaurantTable(updated);
  }

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
    if (input.captainUserId) this.assertMayAssignCaptain(actor);
    const details = await this.toTableDetails(actor.restaurantId, input);
    await this.assertTableNumberAvailable(actor.restaurantId, details.tableNumber);

    const created = await this.mapTableNumberConflict(() =>
      this.tablesRepository.create(actor.restaurantId, details),
    );

    await this.realtime.publishChange(actor.restaurantId, 'tables');
    return toRestaurantTable(created);
  }

  async options(actor: Actor): Promise<TableOptionsResponse> {
    const [sections, statuses] = await Promise.all([
      this.tablesRepository.findSections(actor.restaurantId),
      this.tablesRepository.findStatuses(actor.restaurantId),
    ]);

    return { sections, statuses };
  }

  listLifecycleStatuses(actor: Actor): Promise<TableLifecycleStatusListResponse> {
    return this.tablesRepository
      .findLifecycleStatuses(actor.restaurantId)
      .then((statuses) => statuses.map(({ code, name, sortOrder }) => ({ code, name, sortOrder })));
  }

  async get(actor: Actor, tableId: string): Promise<RestaurantTable> {
    return toRestaurantTable(await this.findInRestaurant(actor.restaurantId, tableId));
  }

  async update(
    actor: Actor,
    tableId: string,
    input: UpdateTableRequest,
  ): Promise<UpdateTableResponse> {
    if (input.captainUserId !== undefined) this.assertMayAssignCaptain(actor);
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

    await this.realtime.publishChange(actor.restaurantId, 'tables');
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

    await this.realtime.publishChange(actor.restaurantId, 'tables');
    return toRestaurantTable(updated);
  }

  async transitionStatus(
    actor: Actor,
    tableId: string,
    input: TransitionTableStatusRequest,
  ): Promise<TransitionTableStatusResponse> {
    const table = await this.findInRestaurant(actor.restaurantId, tableId);
    const target = await this.tablesRepository.findLifecycleStatus(
      actor.restaurantId,
      input.statusCode,
    );
    if (!target) {
      throw new NotFoundException(`Table status ${input.statusCode} not found`);
    }

    if (table.currentStatus.id === target.id) {
      return toRestaurantTable(table);
    }

    const updated = await this.tablesRepository.updateStatus(
      actor.restaurantId,
      tableId,
      table.currentStatus.id,
      target.id,
    );
    if (!updated) {
      const current = await this.tablesRepository.findById(actor.restaurantId, tableId);
      if (!current) {
        throw new NotFoundException('Table not found');
      }
      throw new ConflictException('Table status changed; refresh and retry');
    }

    await this.realtime.publishChange(actor.restaurantId, 'tables');
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
    const captainUserId = input.captainUserId ?? null;
    await this.assertCaptainEligible(restaurantId, captainUserId);

    return {
      tableNumber: input.tableNumber,
      capacity: input.capacity,
      sectionId: input.sectionId,
      currentStatusId,
      captainUserId,
    };
  }

  private async toPartialTableDetails(
    restaurantId: string,
    input: UpdateTableRequest,
  ): Promise<Partial<TableDetails>> {
    if (input.sectionId !== undefined) {
      await this.assertSectionExists(restaurantId, input.sectionId);
    }
    if (input.captainUserId !== undefined) {
      await this.assertCaptainEligible(restaurantId, input.captainUserId);
    }
    return {
      ...(input.tableNumber !== undefined && { tableNumber: input.tableNumber }),
      ...(input.capacity !== undefined && { capacity: input.capacity }),
      ...(input.sectionId !== undefined && { sectionId: input.sectionId }),
      ...(input.captainUserId !== undefined && { captainUserId: input.captainUserId }),
    };
  }

  /** Setting, changing or clearing a captain needs `table:assign-captain`, beyond `restaurant:write`. */
  private assertMayAssignCaptain(actor: Actor): void {
    if (!roleHasPermission(actor.role, Permission.TABLE_ASSIGN_CAPTAIN)) {
      throw new ForbiddenException('Missing permission to assign a captain');
    }
  }

  private async assertCaptainEligible(
    restaurantId: string,
    captainUserId: string | null,
  ): Promise<void> {
    if (captainUserId === null) return;
    const user = await this.tablesRepository.findCaptainCandidate(captainUserId);
    if (!user) {
      throw new NotFoundException('Captain not found');
    }
    if (user.restaurantId !== restaurantId) {
      throw new BadRequestException({
        message: ['captainUserId: User does not belong to this restaurant'],
      });
    }
    if (user.status !== 'ACTIVE') {
      throw new BadRequestException({ message: ['captainUserId: User is not active'] });
    }
    if (!isEligibleCaptainRole(user.role.name)) {
      throw new BadRequestException({
        message: ['captainUserId: User is not eligible to be a captain'],
      });
    }
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
    captainUserId: record.captainUserId,
    captain: record.captain && {
      id: record.captain.id,
      name: record.captain.name,
      role: record.captain.role.name,
    },
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function isEligibleCaptainRole(roleName: string): boolean {
  return isRole(roleName) && roleHasPermission(roleName, Permission.TABLE_BE_CAPTAIN);
}
