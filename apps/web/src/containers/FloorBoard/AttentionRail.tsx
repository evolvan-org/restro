'use client';

import type { Reservation, RestaurantTable } from '@rms/api-contract';
import { cn } from 'cn';
import { Calendar, Clock, Sparkles } from 'lucide-react';
import Link from 'next/link';
import type { ReactElement } from 'react';

import { formatElapsed } from '@/components/FloorTile';
import { type AttentionLevel, elapsedMinutes, minutesUntil } from '@/components/FloorTile/attention';
import { Button, buttonVariants } from '@/components/ui/button';
import { useTransitionTableStatus } from '@/services/api/requests/tables';
import { useShowSidePane } from '@/store/hooks/sidepane';
import { SidePaneType } from '@/store/types/sidepane';

export type AttentionEntry = { table: RestaurantTable; level: AttentionLevel };

type AttentionRailProps = {
  attention: AttentionEntry[];
  upNext: Reservation[];
  nowMs: number;
  canViewOrder: boolean;
  canTransitionStatus: boolean;
  canEditReservation: boolean;
};

function compactTime(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    .replace(/\s?[AP]M/i, '');
}

const LEVEL_STYLE: Record<AttentionLevel, { icon: typeof Clock; tile: string }> = {
  'long-seated': { icon: Clock, tile: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' },
  'cleaning-overdue': { icon: Sparkles, tile: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300' },
  'arriving-soon': { icon: Calendar, tile: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300' },
};

function AttentionCard({
  entry,
  nowMs,
  canViewOrder,
  canTransitionStatus,
}: {
  entry: AttentionEntry;
  nowMs: number;
  canViewOrder: boolean;
  canTransitionStatus: boolean;
}): ReactElement {
  const transitionStatus = useTransitionTableStatus();
  const { table, level } = entry;
  const reservation = table.activeReservation;
  const style = LEVEL_STYLE[level];
  const Icon = style.icon;

  let title: string;
  let reason: string;
  let action: ReactElement | null = null;

  if (level === 'cleaning-overdue') {
    title = `${table.tableNumber} cleaning ${Math.round(elapsedMinutes(table.statusChangedAt, nowMs))}m`;
    reason = 'Cleaning overdue';
    if (canTransitionStatus) {
      action = (
        <Button
          variant="outline"
          size="sm"
          disabled={transitionStatus.isPending}
          onClick={() =>
            void transitionStatus.mutateAsync({ id: table.id, input: { statusCode: 'AVAILABLE' } })
          }
        >
          Mark available
        </Button>
      );
    }
  } else if (level === 'long-seated') {
    title = `${table.tableNumber} seated ${formatElapsed(elapsedMinutes(table.statusChangedAt, nowMs))}`;
    reason = 'Past the turn target';
    if (reservation && canViewOrder) {
      action = (
        <Link
          href={`/orders/tables/${table.id}?reservationId=${reservation.id}`}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          View order
        </Link>
      );
    }
  } else {
    const mins = Math.max(0, Math.round(minutesUntil(reservation!.reservationAt, nowMs)));
    title = `${reservation!.guest.guestName} ×${reservation!.partySize}`;
    reason = `${table.tableNumber} · arriving in ${mins} min`;
    if (reservation && canViewOrder) {
      action = (
        <Link
          href={`/orders/tables/${table.id}?reservationId=${reservation.id}`}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          Start order
        </Link>
      );
    }
  }

  return (
    <div className="rounded-[10px] border bg-card p-3 xl:flex xl:items-center xl:gap-3">
      <div className="flex min-w-0 items-start gap-2.5 xl:flex-1">
        <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', style.tile)}>
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{title}</p>
          <p className="truncate text-xs text-muted-foreground">{reason}</p>
        </div>
      </div>
      {action && <div className="mt-2 xl:mt-0 xl:shrink-0">{action}</div>}
    </div>
  );
}

function UpNextRow({
  reservation,
  canEditReservation,
}: {
  reservation: Reservation;
  canEditReservation: boolean;
}): ReactElement {
  const showSidePane = useShowSidePane();
  return (
    <div className="flex h-11 items-center gap-2 border-b px-3 text-sm last:border-b-0">
      <span className="w-10 shrink-0 font-semibold tabular-nums">
        {compactTime(reservation.reservationAt)}
      </span>
      <span className="min-w-0 flex-1 truncate">
        {reservation.guest.guestName} ×{reservation.partySize}
      </span>
      {reservation.table ? (
        <span className="h-[22px] shrink-0 rounded-md bg-blue-50 px-2 text-xs font-semibold leading-[22px] text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
          {reservation.table.tableNumber}
        </span>
      ) : canEditReservation ? (
        <button
          type="button"
          onClick={() => showSidePane(SidePaneType.ReservationEdit, { reservation })}
          className="h-[22px] shrink-0 rounded-md border border-amber-200 bg-amber-50 px-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
        >
          Assign
        </button>
      ) : (
        <span className="shrink-0 text-xs text-muted-foreground">No table</span>
      )}
    </div>
  );
}

export default function AttentionRail(props: AttentionRailProps): ReactElement {
  return (
    <div className="space-y-5">
      <section>
        <h2 className="mb-2.5 text-sm font-semibold">Needs attention ({props.attention.length})</h2>
        {props.attention.length === 0 ? (
          <p className="rounded-[10px] border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            All tables on track
          </p>
        ) : (
          <div className="space-y-2.5">
            {props.attention.map((entry) => (
              <AttentionCard
                key={entry.table.id}
                entry={entry}
                nowMs={props.nowMs}
                canViewOrder={props.canViewOrder}
                canTransitionStatus={props.canTransitionStatus}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2.5 text-sm font-semibold">Up next · 2 hrs</h2>
        {props.upNext.length === 0 ? (
          <p className="rounded-[10px] border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            No reservations in the next 2 hours
          </p>
        ) : (
          <div className="rounded-[10px] border">
            {props.upNext.map((reservation) => (
              <UpNextRow
                key={reservation.id}
                reservation={reservation}
                canEditReservation={props.canEditReservation}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
