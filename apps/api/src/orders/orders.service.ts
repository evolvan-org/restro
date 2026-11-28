import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ACTIVE_KOT_STATUSES,
  ACTIVE_RESERVATION_STATUSES,
  type CaptainOrderListQuery,
  type CaptainOrderListResponse,
  type CompleteOrderResponse,
  type CreateOrderRequest,
  type DiscardOrderRequest,
  type FireOrderResponse,
  KOT_STATUS_TRANSITIONS,
  type KotBoardQuery,
  type KotBoardResponse,
  type KotQueueQuery,
  type KotQueueResponse,
  type Order,
  type OrderListQuery,
  type OrderListResponse,
  orderSelectionSnapshotSchema,
  type PreparationControlRequest,
  preparationEventSchema,
  type PreparationHistoryQuery,
  type PreparationHistoryResponse,
  type UpdateKotStatusRequest,
  type UpdateKotStatusResponse,
  type VoidOrderItemRequest,
} from '@rms/api-contract';
import { Prisma } from '@rms/db';
import { Permission } from '@rms/permissions';
import { buildPageMeta } from '@rms/shared';

import { actorCan } from '../common/auth/actor-permissions';
import type { Actor } from '../common/auth/authenticated-request';
import { NotificationsService } from '../notifications/notifications.service';
import { QrRealtimePublisher } from '../notifications/qr-realtime.publisher';
import { ThermalPrintingService } from '../thermal-printing/thermal-printing.service';
import {
  sentQuantity,
  toCaptainOrderSummary,
  toKot,
  toKotQueueItem,
  toOrder,
  toOrderListItem,
  toPreparation,
} from './orders.mapper';
import { type KotRecord, type NewKotLine, OrdersRepository } from './orders.repository';

@Injectable()
export class OrdersService {
  constructor(
    private readonly repository: OrdersRepository,
    private readonly notifications: NotificationsService,
    private readonly qrRealtime: QrRealtimePublisher,
    private readonly printing: ThermalPrintingService,
  ) {}

  async create(actor: Actor, input: CreateOrderRequest): Promise<Order> {
    const record = await this.repository.withLockedTable(
      actor.restaurantId,
      input.tableId,
      input.reservationId,
      async ({ table, reservation, existingOrder, create, seatAndOccupy }) => {
        if (!table) throw new NotFoundException('Table not found');
        if (!reservation) throw new NotFoundException('Reservation not found');
        if (!table.isActive) throw new BadRequestException('Table is inactive');
        if (
          reservation.tableId !== table.id ||
          !ACTIVE_RESERVATION_STATUSES.some((status) => status === reservation.status)
        ) {
          throw new BadRequestException('Reservation must be active and assigned to this table');
        }
        if (existingOrder) {
          throw new ConflictException({
            message: 'This table or reservation already has an active order',
            error: 'Conflict',
            existingOrder: toOrder(existingOrder),
          });
        }
        if (table.currentStatus.code === 'NEEDS_CLEANING') {
          throw new ConflictException('Mark the table available before starting an order');
        }
        const created = await create({
          createdByUserId: actor.userId,
          reservationId: input.reservationId,
          status: 'OPEN',
          openedAt: new Date(),
        });
        await seatAndOccupy();
        return created;
      },
    );
    return toOrder(record);
  }

  async discard(actor: Actor, orderId: string, input: DiscardOrderRequest): Promise<Order> {
    return toOrder(await this.repository.discard(actor, orderId, input));
  }

  async voidItem(
    actor: Actor,
    orderId: string,
    itemId: string,
    input: VoidOrderItemRequest,
  ): Promise<Order> {
    const { order, corrections } = await this.repository.voidPendingItem(
      actor,
      orderId,
      itemId,
      input,
    );
    this.printing.scheduleAutomatic(
      actor.restaurantId,
      corrections.filter((ticket) => ticket.printStatus === 'QUEUED').map((ticket) => ticket.id),
    );
    return toOrder(order);
  }

  async complete(actor: Actor, orderId: string): Promise<CompleteOrderResponse> {
    const order = await this.repository.findCompletedPaidOrder(actor.restaurantId, orderId);
    if (order) return toOrder(order);

    const existing = await this.repository.findById(actor.restaurantId, orderId);
    if (!existing) throw new NotFoundException('Order not found');
    throw new ConflictException('Record a successful bill payment to complete this order');
  }

  async kotBoard(actor: Actor, query: KotBoardQuery): Promise<KotBoardResponse> {
    const items = await this.repository.findActiveKotBoard(
      actor.restaurantId,
      query.destination,
      ACTIVE_KOT_STATUSES,
    );
    return { data: items.map(toKotQueueItem) };
  }

  async kotQueue(actor: Actor, query: KotQueueQuery): Promise<KotQueueResponse> {
    const { items, total } = await this.repository.findKotQueue(actor.restaurantId, query);
    return {
      data: items.map(toKotQueueItem),
      meta: buildPageMeta(query.page, query.pageSize, total),
    };
  }

  async updateKotStatus(
    actor: Actor,
    kotId: string,
    input: UpdateKotStatusRequest,
  ): Promise<UpdateKotStatusResponse> {
    const record = await this.repository.withLockedKot(
      actor.restaurantId,
      kotId,
      async (context) => {
        if (!context.kot) throw new NotFoundException('KOT not found');
        if (context.kot.status !== input.expectedStatus) {
          throw new ConflictException(
            'This ticket has changed on another screen. Refresh and try again.',
          );
        }
        if (context.kot.items.length && context.kot.items.every((item) => item.voidedAt)) {
          if (context.kot.status === 'PENDING' && input.status === 'COMPLETED') {
            return context.setStatus('COMPLETED');
          }
          throw new ConflictException(
            'This ticket was voided. Acknowledge it on the station screen',
          );
        }
        if (context.kot.heldAt) {
          throw new ConflictException('Release this ticket from hold before advancing it');
        }
        if (!KOT_STATUS_TRANSITIONS[context.kot.status].includes(input.status)) {
          throw new ConflictException(
            `A KOT cannot move from ${context.kot.status} to ${input.status}`,
          );
        }
        return context.setStatus(input.status);
      },
      actor.userId,
      input.status === 'COMPLETED',
    );
    if (input.status === 'READY') {
      await this.notifications.ticketReady(actor.restaurantId, record.id);
    }
    if (record.qrRound) {
      // Push kitchen progress to the guest tracker within seconds instead of its next refresh.
      // "round.ready" fires once the whole round is Ready (tickets were stamped together).
      const roundReady = input.status === 'READY' && record.guestNotifiedAt !== null;
      await this.qrRealtime.publish(actor.restaurantId, [record.qrRound.sessionId], {
        kind: roundReady ? 'round.ready' : 'round.kitchen',
        tableId: record.qrRound.tableId,
        ...(record.qrRoundId && { roundId: record.qrRoundId }),
      });
    }
    return toKotQueueItem(record);
  }

  async controlPreparation(
    actor: Actor,
    kotId: string,
    input: PreparationControlRequest,
  ): Promise<UpdateKotStatusResponse> {
    const record = await this.repository.withLockedKot(
      actor.restaurantId,
      kotId,
      async (context) => {
        const kot = context.kot;
        if (!kot) throw new NotFoundException('KOT not found');
        if (kot.controlVersion !== input.expectedVersion) {
          throw new ConflictException('This ticket changed. Refresh and try again.');
        }
        if (
          kot.status === 'COMPLETED' ||
          (kot.items.length && kot.items.every((item) => item.voidedAt))
        )
          throw new ConflictException('Completed or fully voided tickets cannot be changed');
        switch (input.action) {
          case 'ACCEPT':
            if (kot.status !== 'PENDING')
              throw new ConflictException('Only a new ticket can be explicitly accepted');
            if (kot.acceptedAt) throw new ConflictException('This ticket is already accepted');
            if (kot.heldAt) throw new ConflictException('Release this ticket before accepting it');
            return context.setPreparation('ACCEPT', { acceptedAt: new Date() });
          case 'HOLD':
            if (kot.heldAt) throw new ConflictException('This ticket is already on hold');
            if (kot.status === 'READY') throw new ConflictException('Ready tickets cannot be held');
            return context.setPreparation(
              'HOLD',
              { heldAt: new Date(), holdReason: input.reason },
              input.reason,
            );
          case 'RELEASE':
            if (!kot.heldAt) throw new ConflictException('This ticket is not on hold');
            return context.setPreparation('RELEASE', { heldAt: null, holdReason: null });
          case 'PRIORITY':
            if (kot.isPriority === input.isPriority)
              throw new ConflictException('Priority is unchanged');
            return context.setPreparation('PRIORITY', { isPriority: input.isPriority });
          case 'TARGET':
            if (kot.targetSeconds === input.targetSeconds)
              throw new ConflictException('Target is unchanged');
            return context.setPreparation('TARGET', { targetSeconds: input.targetSeconds });
        }
      },
      actor.userId,
    );
    return toKotQueueItem(record);
  }

  async preparationHistory(
    actor: Actor,
    kotId: string,
    query: PreparationHistoryQuery,
  ): Promise<PreparationHistoryResponse> {
    const result = await this.repository.preparationHistory(actor.restaurantId, kotId, query);
    if (!result) throw new NotFoundException('KOT not found');
    return {
      data: result.items.map((event) => ({
        id: event.id,
        action: preparationEventSchema.shape.action.parse(event.action),
        status: event.status,
        state: toPreparation({ ...event, controlVersion: event.version }),
        reason: event.reason,
        recordedBy: event.recordedBy,
        createdAt: event.createdAt.toISOString(),
      })),
      meta: buildPageMeta(query.page, query.pageSize, result.total),
    };
  }

  /** Scoped on the server to tables the caller captains; never trusts a client-side filter. */
  async captainOrders(
    actor: Actor,
    query: CaptainOrderListQuery,
  ): Promise<CaptainOrderListResponse> {
    const result = await this.repository.findCaptainOrders(
      actor.restaurantId,
      actor.userId,
      query.view,
    );
    if (!result) throw new NotFoundException('Restaurant not found');
    return {
      data: result.items.map(toCaptainOrderSummary),
      openCount: result.openCount,
      closedCount: result.closedCount,
      currency: result.currency,
    };
  }

  /**
   * Orders page. Captain assigners (and the owner) see every order and may filter by captain; a
   * captain is always limited to their own tables, whatever `captainId` the client sends.
   */
  async list(actor: Actor, query: OrderListQuery): Promise<OrderListResponse> {
    const { captainId, ...filters } = query;
    let captainUserId: string | undefined;
    if (actorCan(actor, Permission.TABLE_ASSIGN_CAPTAIN)) captainUserId = captainId;
    else if (actorCan(actor, Permission.TABLE_BE_CAPTAIN)) captainUserId = actor.userId;
    else throw new ForbiddenException('You do not have permission to view the order list');

    const result = await this.repository.findOrderList(actor.restaurantId, {
      ...filters,
      ...(captainUserId && { captainUserId }),
    });
    if (!result) throw new NotFoundException('Restaurant not found');
    return {
      data: result.items.map(toOrderListItem),
      meta: buildPageMeta(query.page, query.pageSize, result.total),
      currency: result.currency,
      timezone: result.timezone,
    };
  }

  async current(actor: Actor, tableId: string): Promise<Order> {
    const record = await this.repository.findCurrent(actor.restaurantId, tableId);
    if (!record) throw new NotFoundException('No active order for this table');
    return toOrder(record);
  }

  async fire(actor: Actor, orderId: string): Promise<FireOrderResponse> {
    let kots: KotRecord[];
    try {
      kots = await this.repository.withLockedOrder(actor.restaurantId, orderId, async (context) => {
        if (!context.order) throw new NotFoundException('Order not found');
        if (!['OPEN', 'SUBMITTED'].includes(context.order.status)) {
          throw new ConflictException('Only an open or submitted order can be sent');
        }

        // A line may be partly sent: only the quantity not yet on a KOT goes out now.
        const unsentItems = (await context.findActiveItems())
          .map((item) => ({
            ...item,
            orderedQuantity: item.quantity,
            quantity: item.quantity - sentQuantity(item.kotItems, item.sentQuantity),
          }))
          .filter((item) => item.quantity > 0);
        if (!unsentItems.length) throw new ConflictException('No unsent items to send');

        const kitchenItems: NewKotLine[] = [];
        const barItems: NewKotLine[] = [];
        for (const item of unsentItems) {
          const selection =
            item.selectionSnapshot == null
              ? null
              : orderSelectionSnapshotSchema.parse(item.selectionSnapshot);
          const notes =
            [
              item.specialInstructions,
              ...(selection?.modifiers.map((option) => option.kitchenNote || option.name) ?? []),
            ]
              .filter((note): note is string => Boolean(note))
              .join('; ') || null;
          const components = selection?.components.length
            ? selection.components
            : [
                {
                  menuItemId: item.menuItemId,
                  name: item.nameSnapshot,
                  itemType: item.itemTypeSnapshot ?? item.menuItem.itemType,
                  quantity: 1,
                },
              ];
          for (const component of components) {
            if (component.quantity > Math.floor(2147483647 / item.quantity)) {
              throw new BadRequestException('Combo quantity exceeds the supported maximum');
            }
            const line: NewKotLine = {
              orderItemId: item.id,
              componentMenuItemId: component.menuItemId,
              quantity: component.quantity * item.quantity,
              nameSnapshot: selection?.components.length
                ? `${component.name} — ${item.nameSnapshot ?? 'Combo'}`
                : (item.nameSnapshot ?? undefined),
              instructionsSnapshot: notes,
            };
            (component.itemType === 'FOOD' ? kitchenItems : barItems).push(line);
          }
        }
        const groups = [
          ...(kitchenItems.length
            ? [{ destination: 'KITCHEN' as const, items: kitchenItems }]
            : []),
          ...(barItems.length ? [{ destination: 'BAR' as const, items: barItems }] : []),
        ];

        const kots = await context.createKots(actor.userId, groups);
        await context.markSent(
          unsentItems.map(({ id, orderedQuantity }) => ({ id, quantity: orderedQuantity })),
        );
        await context.submit();
        return kots;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(
          'A kitchen ticket number was already used. Retry sending the order.',
        );
      }
      throw error;
    }
    this.printing.scheduleAutomatic(
      actor.restaurantId,
      kots.filter((kot) => kot.printStatus === 'QUEUED').map((kot) => kot.id),
    );
    const order = await this.repository.findById(actor.restaurantId, orderId);
    if (!order) throw new NotFoundException('Order not found');
    await this.notifications.ticketSent(
      actor.restaurantId,
      kots.map((kot) => kot.id),
    );
    return { kots: kots.map(toKot), order: toOrder(order) };
  }
}
