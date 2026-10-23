import type { Kot, Order } from '@rms/api-contract';
import { Prisma } from '@rms/db';

import type { KotRecord, OrderRecord } from './orders.repository';

export function toOrder(record: OrderRecord): Order {
  return {
    ...record,
    total: orderTotal(record.items),
    openedAt: record.openedAt.toISOString(),
    completedAt: record.completedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    items: record.items.map(({ menuItem, kotItems, ...item }) => ({
      ...item,
      name: menuItem.name,
      isSentToKitchen: kotItems.length > 0,
      itemType: menuItem.itemType,
      unitPrice: item.unitPrice.toFixed(2),
      lineTotal: orderItemTotal(item).toFixed(2),
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
  };
}

export function toKot(record: KotRecord): Kot {
  return {
    id: record.id,
    orderId: record.orderId,
    kotNumber: record.kotNumber,
    destination: record.destination,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    items: record.items.map(({ orderItem, ...item }) => ({
      ...item,
      menuItemId: orderItem.menuItemId,
      name: orderItem.menuItem.name,
      specialInstructions: orderItem.specialInstructions,
    })),
  };
}

/** Use persisted snapshots and decimal arithmetic; cancelled lines remain visible as history. */
export function orderTotal(items: OrderRecord['items']): string {
  return items
    .reduce(
      (total, item) => (item.status === 'ACTIVE' ? total.plus(orderItemTotal(item)) : total),
      new Prisma.Decimal(0),
    )
    .toFixed(2);
}

export function orderItemTotal(
  item: Pick<OrderRecord['items'][number], 'quantity' | 'unitPrice'>,
): Prisma.Decimal {
  return item.unitPrice.mul(item.quantity);
}
