import type { KotQueueItem } from '@rms/api-contract';

import type { StationConfig } from './config';

export type Urgency = 'ok' | 'warn' | 'late';

/** Ready tickets never escalate: the cooking is done and they wait on service. */
export function urgencyOf(
  ticket: Pick<KotQueueItem, 'status' | 'createdAt'>,
  station: Pick<StationConfig, 'warnMin' | 'lateMin'>,
  now: number,
): Urgency {
  if (ticket.status === 'READY') return 'ok';
  const minutes = (now - Date.parse(ticket.createdAt)) / 60_000;
  if (minutes >= station.lateMin) return 'late';
  if (minutes >= station.warnMin) return 'warn';
  return 'ok';
}

export function sortOldestFirst(tickets: KotQueueItem[]): KotQueueItem[] {
  return [...tickets].sort(
    (left, right) =>
      Date.parse(left.createdAt) - Date.parse(right.createdAt) || left.id.localeCompare(right.id),
  );
}

export function formatElapsed(createdAt: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - Date.parse(createdAt)) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function formatClock(value: number | string, withSeconds = false): string {
  return new Date(value).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
  });
}
