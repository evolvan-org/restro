import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type AddOrderItemRequest,
  type OrderItem,
  type OrderItemMutationResponse,
  orderSelectionSnapshotSchema,
  type UpdateOrderItemInstructionsRequest,
  type UpdateOrderItemQuantityRequest,
} from '@rms/api-contract';

import type { Actor } from '../common/auth/authenticated-request';
import { buildOrderLine } from './order-selections';
import { sentQuantity, toOrder } from './orders.mapper';
import { type LockedOrderContext, OrdersRepository } from './orders.repository';

const MAX_QUANTITY = 2147483647;

@Injectable()
export class OrderItemsService {
  constructor(private readonly repository: OrdersRepository) {}

  add(
    actor: Actor,
    orderId: string,
    input: AddOrderItemRequest,
  ): Promise<OrderItemMutationResponse> {
    return this.repository.withLockedOrder(
      actor.restaurantId,
      orderId,
      async (context) => {
        this.requireMutable(context);
        const menuItem = await context.findMenuItem(input.menuItemId);
        if (!menuItem) throw new NotFoundException('Menu item not found');
        if (!menuItem.isAvailable) throw new BadRequestException('Menu item is unavailable');
        const line = await buildOrderLine(menuItem, input, context.findMenuItem);
        // Fold into an identical active line (same item, note and price snapshot) so repeated
        // additions raise its quantity. Units already sent stay on their KOT; the next send
        // carries only the difference.
        const existing = await context.findMergeableItem({
          menuItemId: menuItem.id,
          specialInstructions: line.specialInstructions,
          unitPrice: line.unitPrice,
          configurationKey: line.configurationKey,
        });
        if (existing) {
          const quantity = existing.quantity + input.quantity;
          if (quantity > MAX_QUANTITY) {
            throw new BadRequestException('Quantity exceeds the maximum for a single line');
          }
          if (
            line.selectionSnapshot.components.some(
              (component) => component.quantity > Math.floor(MAX_QUANTITY / quantity),
            )
          ) {
            throw new BadRequestException('Combo quantity exceeds the supported maximum');
          }
          await context.update(existing.id, { quantity });
          return this.response(context, existing.id);
        }
        const itemId = await context.add(line);
        return this.response(context, itemId);
      },
      true,
    );
  }

  remove(actor: Actor, orderId: string, itemId: string): Promise<OrderItemMutationResponse> {
    return this.repository.withLockedOrder(actor.restaurantId, orderId, async (context) => {
      this.requireMutable(context);
      const item = await context.findItem(itemId);
      if (!item) throw new NotFoundException('Order item not found');
      if (item.kotItems.length)
        throw new ConflictException('Item has already been sent to the kitchen');
      await context.cancel(item.id);
      return this.response(context, item.id);
    });
  }

  updateQuantity(
    actor: Actor,
    orderId: string,
    itemId: string,
    input: UpdateOrderItemQuantityRequest,
  ): Promise<OrderItem> {
    return this.edit(actor, orderId, itemId, input, (item) => {
      // Sent units are fixed on their KOT, so the line can grow but never drop below them.
      if (input.quantity < sentQuantity(item.kotItems, item.sentQuantity)) {
        throw new ConflictException('Quantity cannot be lower than the amount already sent');
      }
      const selections =
        item.selectionSnapshot == null
          ? null
          : orderSelectionSnapshotSchema.parse(item.selectionSnapshot);
      if (
        selections?.components.some(
          (component) => component.quantity > Math.floor(MAX_QUANTITY / input.quantity),
        )
      ) {
        throw new BadRequestException('Combo quantity exceeds the supported maximum');
      }
    });
  }

  updateInstructions(
    actor: Actor,
    orderId: string,
    itemId: string,
    input: UpdateOrderItemInstructionsRequest,
  ): Promise<OrderItem> {
    return this.edit(actor, orderId, itemId, input, (item) => {
      if (item.kotItems.length) {
        throw new ConflictException('Item has already been sent to the kitchen');
      }
    });
  }

  private edit(
    actor: Actor,
    orderId: string,
    itemId: string,
    input: UpdateOrderItemQuantityRequest | UpdateOrderItemInstructionsRequest,
    guard: (item: NonNullable<Awaited<ReturnType<LockedOrderContext['findItem']>>>) => void,
  ): Promise<OrderItem> {
    return this.repository.withLockedOrder(actor.restaurantId, orderId, async (context) => {
      this.requireMutable(context);
      const item = await context.findItem(itemId);
      if (!item) throw new NotFoundException('Order item not found');
      if (item.status !== 'ACTIVE') throw new ConflictException('Order item is cancelled');
      guard(item);
      await context.update(item.id, input);
      return (await this.response(context, item.id)).item;
    });
  }

  private requireMutable({ order }: LockedOrderContext): void {
    if (!order) throw new NotFoundException('Order not found');
    if (!['OPEN', 'SUBMITTED'].includes(order.status)) {
      throw new ConflictException('Order cannot be changed');
    }
  }

  private async response(
    context: LockedOrderContext,
    itemId: string,
  ): Promise<OrderItemMutationResponse> {
    const order = toOrder(await context.refresh());
    const item = order.items.find((line) => line.id === itemId);
    if (!item) throw new NotFoundException('Order item not found');
    return { item, order };
  }
}
