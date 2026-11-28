import {
  type CaptainOrderSummary,
  type Kot,
  KOT_PRINT_ATTEMPT_TIMEOUT_MS,
  KOT_PRINT_QUEUE_TIMEOUT_MS,
  type KotQueueItem,
  type Order,
  type OrderListItem,
  orderSelectionSnapshotSchema,
  type PreparationState,
} from '@rms/api-contract';
import { Prisma } from '@rms/db';

import { canVoidTicketLines } from './order-corrections';
import type {
  CaptainOrderRecord,
  KotQueueRecord,
  KotRecord,
  OrderListRecord,
  OrderRecord,
} from './orders.repository';

export function toOrder(record: OrderRecord): Order {
  const {
    kots,
    bill,
    table: { qrSessions, ...table },
    ...order
  } = record;
  const servingTickets = kots.filter((kot) => kot.items.length > 0);
  return {
    ...order,
    table,
    canDiscard: order.status === 'OPEN' && !bill && kots.length === 0 && qrSessions.length === 0,
    readyToServe:
      servingTickets.length > 0 && servingTickets.every((ticket) => ticket.status === 'COMPLETED'),
    total: orderTotal(record.items),
    openedAt: record.openedAt.toISOString(),
    completedAt: record.completedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    items: record.items.map(
      ({ menuItem, kotItems, nameSnapshot, itemTypeSnapshot, selectionSnapshot, ...item }) => ({
        ...item,
        sentQuantity: sentQuantity(kotItems, item.sentQuantity),
        stockUsageIssues: [
          ...new Set(
            kotItems.flatMap(({ stockUsageIssue }) => (stockUsageIssue ? [stockUsageIssue] : [])),
          ),
        ],
        canVoid:
          order.status === 'SUBMITTED' &&
          !bill &&
          item.status === 'ACTIVE' &&
          canVoidTicketLines(kotItems),
        name: nameSnapshot ?? menuItem.name,
        itemType: itemTypeSnapshot ?? menuItem.itemType,
        selections:
          selectionSnapshot == null ? null : orderSelectionSnapshotSchema.parse(selectionSnapshot),
        unitPrice: item.unitPrice.toFixed(2),
        lineTotal: orderItemTotal(item).toFixed(2),
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      }),
    ),
  };
}

export function toKot(record: KotRecord): Kot {
  return {
    id: record.id,
    orderId: record.orderId,
    kotNumber: record.kotNumber,
    destination: record.destination,
    ...(record.correctionOf && { correctionOf: record.correctionOf }),
    status: record.status,
    preparation: toPreparation(record),
    printStatus: ticketPrintStatus(record),
    createdAt: record.createdAt.toISOString(),
    items: record.items.map(
      ({
        orderItem,
        componentMenuItemId,
        nameSnapshot,
        instructionsSnapshot,
        voidedAt,
        voidReason,
        ...item
      }) => ({
        ...item,
        menuItemId: componentMenuItemId ?? orderItem.menuItemId,
        name: nameSnapshot ?? orderItem.menuItem.name,
        specialInstructions: instructionsSnapshot ?? orderItem.specialInstructions,
        ...(voidedAt && { void: { reason: voidReason ?? '', at: voidedAt.toISOString() } }),
      }),
    ),
  };
}

function ticketPrintStatus(record: KotRecord): Kot['printStatus'] {
  const status = record.printStatus ?? null;
  const now = Date.now();
  if (status === 'QUEUED' && record.createdAt.getTime() <= now - KOT_PRINT_QUEUE_TIMEOUT_MS)
    return 'UNCONFIRMED';
  if (
    status === 'PRINTING' &&
    (record.printAttemptAt?.getTime() ?? 0) <= now - KOT_PRINT_ATTEMPT_TIMEOUT_MS
  )
    return 'UNCONFIRMED';
  return status;
}

export function toPreparation(record: {
  controlVersion: number;
  acceptedAt: Date | null;
  heldAt: Date | null;
  holdReason: string | null;
  isPriority: boolean;
  targetSeconds: number | null;
}): PreparationState {
  return {
    version: record.controlVersion,
    acceptedAt: record.acceptedAt?.toISOString() ?? null,
    heldAt: record.heldAt?.toISOString() ?? null,
    holdReason: record.holdReason,
    isPriority: record.isPriority,
    targetSeconds: record.targetSeconds,
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

export function sentQuantity(kotItems: { quantity: number }[], recorded?: number | null): number {
  return recorded ?? kotItems.reduce((total, kotItem) => total + kotItem.quantity, 0);
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
    itemNames: [...new Set(active.map((item) => item.nameSnapshot ?? item.menuItem.name))],
    kotCounts,
    openedAt: record.openedAt.toISOString(),
    completedAt: record.completedAt?.toISOString() ?? null,
    total: paidTotal ?? lineTotal,
  };
}

/** Orders page row: the captain summary plus the table's current captain. */
export function toOrderListItem(record: OrderListRecord): OrderListItem {
  const { captain, ...table } = record.table;
  return { ...toCaptainOrderSummary({ ...record, table }), captain };
}
