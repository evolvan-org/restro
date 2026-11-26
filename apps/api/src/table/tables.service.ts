import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import {
  type AssignTableCaptainRequest,
  type AssignTableCaptainResponse,
  type CaptainOptionsResponse,
  type CreateTableRequest,
  type CreateTableResponse,
  type RestaurantTable,
  type TableBoardResponse,
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
import { Permission } from '@rms/permissions';
import { buildPageMeta } from '@rms/shared';

import { actorCan } from '../common/auth/actor-permissions';
import type { Actor } from '../common/auth/authenticated-request';
import { roleCan } from '../common/auth/role-access';
import { QrRealtimePublisher } from '../notifications/qr-realtime.publisher';
import {
  type TableDetails,
  TableNumberConflictError,
  type TableRecord,
  TablesRepository,
} from './tables.repository';

const TABLE_NUMBER_IN_USE_MESSAGE = 'Table number is already in use in this section';

@Injectable()
export class TablesService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(TablesService.name);
  private reconciliationTimer?: NodeJS.Timeout;
  private isReconciling = false;

  constructor(
    private readonly tablesRepository: TablesRepository,
    private readonly qrRealtime: QrRealtimePublisher,
  ) {}

  /**
   * A table's captain or availability changed: QR floor markers, alerts and the guest phones at
   * that table depend on it (REST-88). Best effort after the write has committed.
   */
  private async announceQrTableChange(restaurantId: string, tableId: string): Promise<void> {
    try {
      const sessions = await this.tablesRepository.findOpenQrSessionIds(restaurantId, tableId);
      await this.qrRealtime.publish(restaurantId, sessions, { kind: 'captain.changed', tableId });
    } catch (error) {
      this.logger.warn('Unable to announce a table change to QR screens', error);
    }
  }

  onApplicationBootstrap(): void {
    this.reconciliationTimer = setInterval(() => void this.reconcileAllStatuses(), 60_000);
    this.reconciliationTimer.unref();
    void this.reconcileAllStatuses();
  }

  onApplicationShutdown(): void {
    if (this.reconciliationTimer) clearInterval(this.reconciliationTimer);
  }

  private async reconcileAllStatuses(): Promise<void> {
    if (this.isReconciling) return;
    this.isReconciling = true;
    try {
      await this.tablesRepository.reconcileAllStatuses();
    } catch (error) {
      this.logger.error('Unable to reconcile table statuses', error);
    } finally {
      this.isReconciling = false;
    }
  }

  async listCaptains(actor: Actor): Promise<CaptainOptionsResponse> {
    const users = await this.tablesRepository.listActiveUsers(actor.restaurantId);
    return users
      .filter((user) => roleCan(user.role, Permission.TABLE_BE_CAPTAIN))
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
    return toRestaurantTable(updated, actor);
  }

  /**
   * Captain-eligible callers (`table:be-captain`, resolved from real grants) only ever receive the
   * tables they are assigned to, so the captain dashboard is scoped on the server. Everyone else
   * gets the full floor.
   */
  async board(actor: Actor): Promise<TableBoardResponse> {
    await this.tablesRepository.reconcileStatuses(actor.restaurantId);
    const captainUserId = actorCan(actor, Permission.TABLE_BE_CAPTAIN) ? actor.userId : undefined;
    const items = await this.tablesRepository.findActiveBoard(actor.restaurantId, captainUserId);
    return { data: items.map((record) => toRestaurantTable(record, actor)) };
  }

  async list(actor: Actor, query: TableListQuery): Promise<TableListResponse> {
    await this.tablesRepository.reconcileStatuses(actor.restaurantId);
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
      data: items.map((record) => toRestaurantTable(record, actor)),
      meta: buildPageMeta(page, pageSize, total),
    };
  }

  async create(actor: Actor, input: CreateTableRequest): Promise<CreateTableResponse> {
    if (input.captainUserId) this.assertMayAssignCaptain(actor);
    const details = await this.toTableDetails(actor.restaurantId, input);
    await this.assertTableNumberAvailable(
      actor.restaurantId,
      details.sectionId,
      details.tableNumber,
    );

    const created = await this.mapTableNumberConflict(() =>
      this.tablesRepository.create(actor.restaurantId, details, (section) =>
        this.requireActiveSection(section),
      ),
    );

    await this.announceQrTableChange(actor.restaurantId, created.id);
    return toRestaurantTable(created, actor);
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
    return toRestaurantTable(await this.findInRestaurant(actor.restaurantId, tableId), actor);
  }

  async update(
    actor: Actor,
    tableId: string,
    input: UpdateTableRequest,
  ): Promise<UpdateTableResponse> {
    if (input.captainUserId !== undefined) this.assertMayAssignCaptain(actor);
    const existing = await this.findInRestaurant(actor.restaurantId, tableId);
    const details = await this.toPartialTableDetails(actor.restaurantId, input);

    const targetNumber = details.tableNumber ?? existing.tableNumber;
    const targetSectionId = details.sectionId ?? existing.section.id;
    const numberChanged = targetNumber.toLowerCase() !== existing.tableNumber.toLowerCase();
    const sectionChanged = targetSectionId !== existing.section.id;
    if (numberChanged || sectionChanged) {
      await this.assertTableNumberAvailable(
        actor.restaurantId,
        targetSectionId,
        targetNumber,
        tableId,
      );
    }

    const updated = await this.mapTableNumberConflict(() =>
      this.tablesRepository.update(actor.restaurantId, tableId, details, (section) =>
        this.requireActiveSection(section),
      ),
    );
    if (!updated) {
      throw new NotFoundException('Table not found');
    }

    await this.announceQrTableChange(actor.restaurantId, tableId);
    return toRestaurantTable(updated, actor);
  }

  async updateActiveState(
    actor: Actor,
    tableId: string,
    input: UpdateTableActiveRequest,
  ): Promise<UpdateTableActiveResponse> {
    await this.findInRestaurant(actor.restaurantId, tableId);

    const updated = await this.tablesRepository.updateActiveState(
      actor.restaurantId,
      tableId,
      input.isActive,
      (context) => {
        if (context.sectionChanged)
          throw new ConflictException('Table section changed; refresh and retry');
        if (input.isActive) this.requireActiveSection(context.section);
        else if (
          context.hasActiveOrder ||
          context.hasActiveReservation ||
          context.statusCode === 'OCCUPIED'
        ) {
          throw new ConflictException(
            'Complete service or reassign/cancel booked and seated reservations before deactivating this table',
          );
        }
      },
    );
    if (!updated) {
      throw new NotFoundException('Table not found');
    }

    await this.announceQrTableChange(actor.restaurantId, tableId);
    return toRestaurantTable(updated, actor);
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
      return toRestaurantTable(table, actor);
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

    return toRestaurantTable(updated, actor);
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
    if (!actorCan(actor, Permission.TABLE_ASSIGN_CAPTAIN)) {
      throw new ForbiddenException('Missing permission to assign a captain');
    }
  }

  private async assertCaptainEligible(
    restaurantId: string,
    captainUserId: string | null,
  ): Promise<void> {
    if (captainUserId === null) return;
    const user = await this.tablesRepository.findCaptainCandidate(restaurantId, captainUserId);
    if (!user) {
      throw new NotFoundException('Captain not found');
    }
    if (user.status !== 'ACTIVE') {
      throw new BadRequestException({ message: ['captainUserId: User is not active'] });
    }
    if (!roleCan(user.role, Permission.TABLE_BE_CAPTAIN)) {
      throw new BadRequestException({
        message: ['captainUserId: User is not eligible to be a captain'],
      });
    }
  }

  private requireActiveSection(section: { isActive: boolean } | null): void {
    if (!section) throw new BadRequestException('The selected section does not exist');
    if (!section.isActive) throw new ConflictException('Choose an active dining section');
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
    sectionId: string,
    tableNumber: string,
    excludeTableId?: string,
  ): Promise<void> {
    if (
      await this.tablesRepository.isTableNumberTaken(
        restaurantId,
        sectionId,
        tableNumber,
        excludeTableId,
      )
    ) {
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

function toRestaurantTable(record: TableRecord, actor: Actor): RestaurantTable {
  const activeReservation =
    record.reservations.find((reservation) => reservation.status === 'SEATED') ??
    record.reservations[0] ??
    null;
  const activeOrders = record.orders.filter(
    (order) => order.status === 'OPEN' || order.status === 'SUBMITTED',
  );
  const currentOrder = activeOrders[activeOrders.length - 1];
  const completedOrder = record.orders
    .filter((order) => order.status === 'COMPLETED')
    .sort(
      (a, b) =>
        (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0) ||
        b.id.localeCompare(a.id),
    )[0];
  const bill = currentOrder
    ? currentOrder.bill
    : record.currentStatus.code === 'NEEDS_CLEANING'
      ? completedOrder?.bill
      : null;
  return {
    id: record.id,
    billSummary: actorCan(actor, Permission.BILL_READ) ? (bill ?? null) : null,
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
    statusChangedAt: record.statusChangedAt.toISOString(),
    activeReservation: activeReservation && {
      ...activeReservation,
      status: activeReservation.status as 'BOOKED' | 'SEATED',
      reservationAt: activeReservation.reservationAt.toISOString(),
    },
    openOrderId: currentOrder?.id ?? null,
    readyKotCount: activeOrders.reduce((count, order) => count + order._count.kots, 0),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
