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
import { toOrder } from './orders.mapper';
import { type LockedOrderContext, OrdersRepository } from './orders.repository';

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
      const itemId = await context.add({
        menuItemId: menuItem.id,
        quantity: input.quantity,
        specialInstructions: input.specialInstructions ?? null,
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
    return this.edit(actor, orderId, itemId, input);
  }

  updateInstructions(
    actor: Actor,
    orderId: string,
    itemId: string,
    input: UpdateOrderItemInstructionsRequest,
  ): Promise<OrderItem> {
    return this.edit(actor, orderId, itemId, input);
  }

  private edit(
    actor: Actor,
    orderId: string,
    itemId: string,
    input: UpdateOrderItemQuantityRequest | UpdateOrderItemInstructionsRequest,
  ): Promise<OrderItem> {
    return this.repository.withLockedOrder(actor.restaurantId, orderId, async (context) => {
      this.requireMutable(context);
      const item = await context.findItem(itemId);
      if (!item) throw new NotFoundException('Order item not found');
      if (item.status !== 'ACTIVE') throw new ConflictException('Order item is cancelled');
      if (item.kotItems.length)
        throw new ConflictException('Item has already been sent to the kitchen');
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
