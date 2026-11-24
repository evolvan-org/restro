import type { CaptainOrderSummary, RestaurantTable } from '@rms/api-contract';

import { formatClockTime, formatElapsed } from '@/components/FloorTile';
import {
  type AttentionLevel,
  CLEANING_TARGET_MIN,
  elapsedMinutes,
  getTableAttention,
  minutesUntil,
  TURN_TARGET_MIN,
} from '@/components/FloorTile/attention';

export type CaptainTab = 'floor' | 'orders' | 'attention';

export const CAPTAIN_TABS: readonly { value: CaptainTab; label: string }[] = [
  { value: 'floor', label: 'Floor' },
  { value: 'orders', label: 'Orders' },
  { value: 'attention', label: 'Needs attention' },
];

export type OrderTone = 'neutral' | 'progress' | 'sent' | 'ready' | 'done';

/** The order's headline state for its card chip, most actionable first. */
export function getOrderStatus(order: CaptainOrderSummary): { label: string; tone: OrderTone } {
  if (order.status === 'COMPLETED') return { label: 'Paid', tone: 'done' };
  if (order.status === 'CANCELLED') return { label: 'Cancelled', tone: 'neutral' };
  if (order.kotCounts.ready > 0) {
    return { label: `${order.kotCounts.ready} ready to serve`, tone: 'ready' };
  }
  if (order.bill?.status === 'OPEN') return { label: 'Bill generated', tone: 'neutral' };
  if (order.kotCounts.preparing > 0) return { label: 'Preparing', tone: 'progress' };
  if (order.kotCounts.pending > 0) return { label: 'Sent to kitchen', tone: 'sent' };
  if (order.kotCounts.completed > 0) return { label: 'Served', tone: 'progress' };
  return { label: 'Not sent yet', tone: 'neutral' };
}

/** "6 items · Paneer tikka, Dal makhani +4" */
export function summariseItems(order: CaptainOrderSummary): string {
  if (order.itemCount === 0) return 'No items yet';
  const count = `${order.itemCount} ${order.itemCount === 1 ? 'item' : 'items'}`;
  const [first, second, ...rest] = order.itemNames;
  const names = [first, second].filter(Boolean).join(', ');
  return `${count} · ${names}${rest.length > 0 ? ` +${rest.length}` : ''}`;
}

export function describeOrderTime(order: CaptainOrderSummary, nowMs: number): string {
  if (order.completedAt) return `Closed ${formatClockTime(order.completedAt)}`;
  return `Seated ${formatElapsed(elapsedMinutes(order.openedAt, nowMs))}`;
}

export function formatAmount(amount: string, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(Number(amount));
  } catch {
    // An unrecognised currency code must not blank the card.
    return `${currency} ${amount}`;
  }
}

export type CaptainEventKind = AttentionLevel | 'ready-to-serve';

export type CaptainEvent = {
  key: string;
  kind: CaptainEventKind;
  table: RestaurantTable;
  title: string;
  detail: string;
};

/**
 * Needs-attention events for the captain's tables: the floor board's attention rules plus tables
 * with tickets ready to serve. The tables come from the API already scoped to this captain.
 */
export function buildCaptainEvents(
  tables: readonly RestaurantTable[],
  nowMs: number,
): CaptainEvent[] {
  const events: CaptainEvent[] = [];
  for (const table of tables) {
    const level = getTableAttention(table, nowMs);
    if (level === 'long-seated') {
      events.push({
        key: `${table.id}:${level}`,
        kind: level,
        table,
        title: `${table.tableNumber} · seated ${formatElapsed(elapsedMinutes(table.statusChangedAt, nowMs))}`,
        detail: `Past the ${formatElapsed(TURN_TARGET_MIN)} turn target`,
      });
    } else if (level === 'cleaning-overdue') {
      events.push({
        key: `${table.id}:${level}`,
        kind: level,
        table,
        title: `${table.tableNumber} · needs cleaning ${Math.round(elapsedMinutes(table.statusChangedAt, nowMs))} min`,
        detail: `Past the ${CLEANING_TARGET_MIN} min cleaning target`,
      });
    } else if (level === 'arriving-soon' && table.activeReservation) {
      const reservation = table.activeReservation;
      const mins = Math.max(0, Math.round(minutesUntil(reservation.reservationAt, nowMs)));
      events.push({
        key: `${table.id}:${level}`,
        kind: level,
        table,
        title: `${table.tableNumber} · guests arriving ${formatClockTime(reservation.reservationAt)}`,
        detail: `${reservation.guest.guestName} · ${reservation.partySize} ${reservation.partySize === 1 ? 'guest' : 'guests'} · in ${mins} min`,
      });
    }

    if (table.readyKotCount > 0) {
      events.push({
        key: `${table.id}:ready`,
        kind: 'ready-to-serve',
        table,
        title: `${table.tableNumber} · ${table.readyKotCount} ready to serve`,
        detail: 'The kitchen or bar marked tickets ready',
      });
    }
  }
  return events;
}
