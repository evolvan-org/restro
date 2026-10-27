import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ACTIVE_KOT_STATUSES,
  ACTIVE_RESERVATION_STATUSES,
  type CompleteOrderResponse,
  type CreateOrderRequest,
  type FireOrderResponse,
  KOT_STATUS_TRANSITIONS,
  type KotQueueQuery,
  type KotQueueResponse,
  type Order,
  type UpdateKotStatusRequest,
  type UpdateKotStatusResponse,
} from '@rms/api-contract';
import { Prisma } from '@rms/db';

import type { Actor } from '../common/auth/authenticated-request';
import { sentQuantity, toKot, toKotQueueItem, toOrder } from './orders.mapper';
import { type KotRecord, OrdersRepository } from './orders.repository';

@Injectable()
export class OrdersService {
  constructor(private readonly repository: OrdersRepository) {}

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
    const order = await this.repository.complete(actor.restaurantId, orderId);
    if (order) return toOrder(order);

    const existing = await this.repository.findById(actor.restaurantId, orderId);
    if (!existing) throw new NotFoundException('Order not found');
    throw new ConflictException('Only an open or submitted order can be completed');
  }

  async kotQueue(actor: Actor, query: KotQueueQuery): Promise<KotQueueResponse> {
    const records = await this.repository.findKotQueue(actor.restaurantId, query.destination, [
      ...new Set(query.status ?? ACTIVE_KOT_STATUSES),
    ]);
    return records.map(toKotQueueItem);
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
        if (!KOT_STATUS_TRANSITIONS[context.kot.status].includes(input.status)) {
          throw new ConflictException(
            `A KOT cannot move from ${context.kot.status} to ${input.status}`,
          );
        }
        return context.setStatus(input.status);
      },
    );
    return toKot(record);
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
    return { kots: kots.map(toKot), order: toOrder(order) };
  }
}
