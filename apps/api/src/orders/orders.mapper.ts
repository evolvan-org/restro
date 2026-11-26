import type { CaptainOrderSummary, Kot, KotQueueItem, Order } from '@rms/api-contract';
import { Prisma } from '@rms/db';

import type {
  CaptainOrderRecord,
  KotQueueRecord,
  KotRecord,
  OrderRecord,
} from './orders.repository';

export function toOrder(record: OrderRecord): Order {
  const { kots, ...order } = record;
  return {
    ...order,
    readyToServe: kots.length > 0 && kots.every((ticket) => ticket.status === 'COMPLETED'),
    total: orderTotal(record.items),
    openedAt: record.openedAt.toISOString(),
    completedAt: record.completedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    items: record.items.map(({ menuItem, kotItems, ...item }) => ({
      ...item,
      sentQuantity: sentQuantity(kotItems),
      name: menuItem.name,
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

export function toKotQueueItem(record: KotQueueRecord): KotQueueItem {
  const { order, source, guestNotifiedAt, approvedByUser } = record;
  return {
    ...toKot(record),
    table: order.table,
    qr:
      source === 'QR'
        ? {
            approvedBy: firstName(approvedByUser?.name ?? ''),
            guestNotifiedAt: guestNotifiedAt?.toISOString() ?? null,
          }
        : null,
  };
}

/** Staff are shown to guests and on tickets by first name only ("Arjun"). */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function sentQuantity(kotItems: { quantity: number }[]): number {
  return kotItems.reduce((total, kotItem) => total + kotItem.quantity, 0);
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

/** A compact order card for the captain dashboard; a paid bill's total wins over the line sum. */
export function toCaptainOrderSummary(record: CaptainOrderRecord): CaptainOrderSummary {
  const active = record.items.filter((item) => item.status === 'ACTIVE');
  const kotCounts = { pending: 0, preparing: 0, ready: 0, completed: 0 };
  for (const kot of record.kots) {
    if (kot.status === 'PENDING') kotCounts.pending += 1;
    else if (kot.status === 'PREPARING') kotCounts.preparing += 1;
    else if (kot.status === 'READY') kotCounts.ready += 1;
    else kotCounts.completed += 1;
  }
  const lineTotal = active
    .reduce((total, item) => total.plus(orderItemTotal(item)), new Prisma.Decimal(0))
    .toFixed(2);
  const paidTotal = record.bill?.status === 'PAID' ? record.bill.totalAmount.toFixed(2) : null;

  return {
    id: record.id,
    table: record.table,
    status: record.status,
    bill: record.bill ? { billNumber: record.bill.billNumber, status: record.bill.status } : null,
    itemCount: active.reduce((count, item) => count + item.quantity, 0),
    itemNames: [...new Set(active.map((item) => item.menuItem.name))],
    kotCounts,
    openedAt: record.openedAt.toISOString(),
    completedAt: record.completedAt?.toISOString() ?? null,
    total: paidTotal ?? lineTotal,
  };
}
