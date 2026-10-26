import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AddOrderItemRequest,
  OrderItem,
  OrderItemMutationResponse,
  UpdateOrderItemInstructionsRequest,
  UpdateOrderItemQuantityRequest,
} from '@rms/api-contract';

import type { Actor } from '../common/auth/authenticated-request';
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
    return this.repository.withLockedOrder(actor.restaurantId, orderId, async (context) => {
      this.requireMutable(context);
      const menuItem = await context.findMenuItem(input.menuItemId);
      if (!menuItem) throw new NotFoundException('Menu item not found');
      if (!menuItem.isAvailable) throw new BadRequestException('Menu item is unavailable');
      const specialInstructions = input.specialInstructions?.trim() || null;
      // Fold into an identical active line (same item, note and price snapshot) so repeated
      // additions raise its quantity. Units already sent stay on their KOT; the next send
      // carries only the difference.
      const existing = await context.findMergeableItem({
        menuItemId: menuItem.id,
        specialInstructions,
        unitPrice: menuItem.price,
      });
      if (existing) {
        const quantity = existing.quantity + input.quantity;
        if (quantity > MAX_QUANTITY) {
          throw new BadRequestException('Quantity exceeds the maximum for a single line');
        }
        await context.update(existing.id, { quantity });
        return this.response(context, existing.id);
      }
      const itemId = await context.add({
        menuItemId: menuItem.id,
        quantity: input.quantity,
        specialInstructions,
        unitPrice: menuItem.price,
      });
      return this.response(context, itemId);
    });
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
      if (input.quantity < sentQuantity(item.kotItems)) {
        throw new ConflictException('Quantity cannot be lower than the amount already sent');
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
    guard: (item: { quantity: number; kotItems: { quantity: number }[] }) => void,
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
