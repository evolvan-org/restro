import type { KotDestination, KotQueueItem, KotStatus } from '@rms/api-contract';

export const KOT_LANES = [
  {
    status: 'PENDING',
    label: 'Pending',
    dot: 'bg-amber-500',
    action: 'Start preparing',
    next: 'PREPARING',
  },
  {
    status: 'PREPARING',
    label: 'Preparing',
    dot: 'bg-sky-500',
    action: 'Mark ready',
    next: 'READY',
  },
  {
    status: 'READY',
    label: 'Ready',
    dot: 'bg-emerald-500',
    action: 'Complete ticket',
    next: 'COMPLETED',
  },
] as const satisfies readonly {
  status: KotStatus;
  label: string;
  dot: string;
  action: string;
  next: KotStatus;
}[];

export function boardSettings(destination: KotDestination): {
  title: string;
  station: string;
  description: string;
} {
  return destination === 'KITCHEN'
    ? {
        title: 'Kitchen Display',
        station: 'Kitchen',
        description: 'Live kitchen tickets, from preparation to ready.',
      }
    : {
        title: 'Bar Display',
        station: 'Bar',
        description: 'Live bar tickets, from preparation to ready.',
      };
}

export function ticketsInLane(tickets: KotQueueItem[], status: KotStatus): KotQueueItem[] {
  return tickets
    .filter((ticket) => ticket.status === status)
    .sort(
      (left, right) =>
        Date.parse(left.createdAt) - Date.parse(right.createdAt) || left.id.localeCompare(right.id),
    );
}

export function elapsedLabel(createdAt: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(createdAt)) / 60_000));
  return minutes < 1 ? 'Just now' : `${minutes}m`;
}
