import type { Order } from '@rms/api-contract';

import type { OrderRecord } from './orders.repository';

export function toOrder(record: OrderRecord): Order {
  return {
    ...record,
    openedAt: record.openedAt.toISOString(),
    completedAt: record.completedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    items: record.items.map(({ menuItem, ...item }) => ({
      ...item,
      name: menuItem.name,
      itemType: menuItem.itemType,
      unitPrice: item.unitPrice.toFixed(2),
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
  };
}
