'use client';

import { cn } from 'cn';
import { BellRing, Calendar, CircleCheck, Clock, Sparkles } from 'lucide-react';
import Link from 'next/link';
import type { ReactElement } from 'react';

import { Button, buttonVariants } from '@/components/ui/button';
import { useTransitionTableStatus } from '@/services/api/requests/tables';

import { StateShell } from '../FloorBoard/FloorBoardStates';
import type { CaptainEvent, CaptainEventKind } from './mappers';

const KIND_STYLE: Record<CaptainEventKind, { icon: typeof Clock; tile: string }> = {
  'long-seated': {
    icon: Clock,
    tile: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  },
  'cleaning-overdue': {
    icon: Sparkles,
    tile: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300',
  },
  'arriving-soon': {
    icon: Calendar,
    tile: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
  },
  'ready-to-serve': {
    icon: BellRing,
    tile: 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300',
  },
};

export type AttentionPermissions = {
  canViewOrder: boolean;
  canTransitionStatus: boolean;
  canReadReservations: boolean;
};

const ACTION_CLASS = cn(buttonVariants({ size: 'default' }), 'h-11 w-full');

function EventAction({
  event,
  permissions,
}: {
  event: CaptainEvent;
  permissions: AttentionPermissions;
}): ReactElement | null {
  const { mutateAsync: transition, isPending } = useTransitionTableStatus();
  const { table } = event;
  const reservationId = table.activeReservation?.id;
  const orderHref = `/orders/tables/${table.id}${reservationId ? `?reservationId=${reservationId}` : ''}`;

  switch (event.kind) {
    case 'cleaning-overdue':
      if (!permissions.canTransitionStatus) return null;
      return (
        <Button
          className="h-11 w-full"
          disabled={isPending}
          onClick={() =>
            void transition({ id: table.id, input: { statusCode: 'AVAILABLE' } }).catch(() => {
              // The mutation hook reports the failure and refreshes the board.
            })
          }
        >
          Mark available
        </Button>
      );
    case 'arriving-soon':
      if (!permissions.canReadReservations) return null;
      return (
        <Link href="/reservations" className={ACTION_CLASS}>
          View reservation
        </Link>
      );
    case 'long-seated':
    case 'ready-to-serve':
      if (!permissions.canViewOrder || (!table.openOrderId && !reservationId)) return null;
      return (
        <Link href={orderHref} className={ACTION_CLASS}>
          View order
        </Link>
      );
  }
}

/** Attention events for the captain's own tables, each with the action it calls for. */
export default function CaptainAttention({
  events,
  permissions,
}: {
  events: readonly CaptainEvent[];
  permissions: AttentionPermissions;
}): ReactElement {
  if (events.length === 0) {
    return (
      <StateShell
        icon={<CircleCheck className="size-6" aria-hidden />}
        title="All your tables are on track"
        description="Long-seated tables, overdue cleaning, arriving guests and food ready to serve show up here."
      />
    );
  }

  return (
    <ul className="grid gap-3 md:grid-cols-2 md:gap-3.5 xl:grid-cols-3">
      {events.map((event) => {
        const style = KIND_STYLE[event.kind];
        const Icon = style.icon;
        return (
          <li
            key={event.key}
            className="flex flex-col gap-3 rounded-xl border bg-card p-3.5 md:gap-3.5 md:p-4"
          >
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  'grid size-10 shrink-0 place-items-center rounded-[10px]',
                  style.tile,
                )}
              >
                <Icon className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-bold">{event.title}</p>
                <p className="mt-0.5 text-[13px] text-muted-foreground">{event.detail}</p>
              </div>
            </div>
            <EventAction event={event} permissions={permissions} />
          </li>
        );
      })}
    </ul>
  );
}
