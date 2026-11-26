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
  type FireOrderResponse,
  KOT_STATUS_TRANSITIONS,
  type KotBoardQuery,
  type KotBoardResponse,
  type KotQueueQuery,
  type KotQueueResponse,
  type Order,
  type OrderListQuery,
  type OrderListResponse,
  type UpdateKotStatusRequest,
  type UpdateKotStatusResponse,
} from '@rms/api-contract';
import { Prisma } from '@rms/db';
import { Permission } from '@rms/permissions';
import { buildPageMeta } from '@rms/shared';

import { actorCan } from '../common/auth/actor-permissions';
import type { Actor } from '../common/auth/authenticated-request';
import { NotificationsService } from '../notifications/notifications.service';
import { QrRealtimePublisher } from '../notifications/qr-realtime.publisher';
import {
  sentQuantity,
  toCaptainOrderSummary,
  toKot,
  toKotQueueItem,
  toOrder,
  toOrderListItem,
} from './orders.mapper';
import { type KotRecord, OrdersRepository } from './orders.repository';

@Injectable()
export class OrdersService {
  constructor(
    private readonly repository: OrdersRepository,
    private readonly notifications: NotificationsService,
    private readonly qrRealtime: QrRealtimePublisher,
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
        if (!KOT_STATUS_TRANSITIONS[context.kot.status].includes(input.status)) {
          throw new ConflictException(
            `A KOT cannot move from ${context.kot.status} to ${input.status}`,
          );
        }
        return context.setStatus(input.status);
      },
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
          .map((item) => ({ ...item, quantity: item.quantity - sentQuantity(item.kotItems) }))
          .filter((item) => item.quantity > 0);
        if (!unsentItems.length) throw new ConflictException('No unsent items to send');

        const kitchenItems = unsentItems
          .filter((item) => item.menuItem.itemType === 'FOOD')
          .map((item) => ({ orderItemId: item.id, quantity: item.quantity }));
        const barItems = unsentItems
          .filter((item) => item.menuItem.itemType === 'BAR')
          .map((item) => ({ orderItemId: item.id, quantity: item.quantity }));
        const groups = [
          ...(kitchenItems.length
            ? [{ destination: 'KITCHEN' as const, items: kitchenItems }]
            : []),
          ...(barItems.length ? [{ destination: 'BAR' as const, items: barItems }] : []),
        ];

        const kots = await context.createKots(actor.userId, groups);
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
    const order = await this.repository.findById(actor.restaurantId, orderId);
    if (!order) throw new NotFoundException('Order not found');
    await this.notifications.ticketSent(
      actor.restaurantId,
      kots.map((kot) => kot.id),
    );
    return { kots: kots.map(toKot), order: toOrder(order) };
  }
}
