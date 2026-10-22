'use client';

import { Popover } from '@base-ui/react/popover';
import { Tooltip } from '@base-ui/react/tooltip';
import type { RestaurantTable } from '@rms/api-contract';
import { cn } from 'cn';
import { Armchair, Users } from 'lucide-react';
import Link from 'next/link';
import type { ReactElement } from 'react';
import { toast } from 'sonner';

import TableCaptainAction from '@/components/TableCaptainAction';
import { Button, buttonVariants } from '@/components/ui/button';
import { useCompleteOrder } from '@/services/api/requests/orders';
import { getReservation } from '@/services/api/requests/reservations';
import { useTransitionTableStatus } from '@/services/api/requests/tables';
import { useShowSidePane } from '@/store/hooks/sidepane';
import { SidePaneType } from '@/store/types/sidepane';

export type StatusColorClasses = {
  ring: string;
  bg: string;
  dot: string;
  badge: string;
  strip: string;
};

const SYSTEM_STATUS_COLORS: Record<string, StatusColorClasses> = {
  AVAILABLE: {
    ring: 'ring-green-500/70',
    bg: 'bg-green-50 dark:bg-green-950/30',
    dot: 'bg-green-500',
    badge: 'bg-green-100 text-green-800 dark:bg-green-400/20 dark:text-green-300',
    strip: 'bg-green-500',
  },
  OCCUPIED: {
    ring: 'ring-slate-400/70',
    bg: 'bg-slate-100 dark:bg-slate-900/40',
    dot: 'bg-slate-500',
    badge: 'bg-slate-200 text-slate-800 dark:bg-slate-400/20 dark:text-slate-300',
    strip: 'bg-slate-500',
  },
  RESERVED: {
    ring: 'ring-blue-500/70',
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    dot: 'bg-blue-500',
    badge: 'bg-blue-100 text-blue-800 dark:bg-blue-400/20 dark:text-blue-300',
    strip: 'bg-blue-500',
  },
  NEEDS_CLEANING: {
    ring: 'ring-red-500/70',
    bg: 'bg-red-50 dark:bg-red-950/30',
    dot: 'bg-red-500',
    badge: 'bg-red-100 text-red-800 dark:bg-red-400/20 dark:text-red-300',
    strip: 'bg-red-500',
  },
};

export const DEFAULT_STATUS_COLOR: StatusColorClasses = {
  ring: 'ring-muted-foreground/30',
  bg: 'bg-muted/20',
  dot: 'bg-muted-foreground/40',
  badge: 'bg-muted text-muted-foreground',
  strip: 'bg-muted-foreground/40',
};

export function buildStatusColorMap(
  statuses: readonly { code: string }[],
): Record<string, StatusColorClasses> {
  return Object.fromEntries(
    statuses
      .filter(({ code }) => SYSTEM_STATUS_COLORS[code])
      .map(({ code }) => [code, SYSTEM_STATUS_COLORS[code]]),
  );
}

export function formatElapsed(minutes: number): string {
  const clamped = Math.max(0, Math.floor(minutes));
  return `${Math.floor(clamped / 60)}:${String(clamped % 60).padStart(2, '0')} hr`;
}

export function needsTimer(statusCode: string): boolean {
  return statusCode === 'OCCUPIED' || statusCode === 'NEEDS_CLEANING';
}

type FloorTileProps = {
  table: RestaurantTable;
  colorClasses: StatusColorClasses;
  elapsedMinutes: number;
  canReserve: boolean;
  canEditReservation: boolean;
  canViewOrder: boolean;
  canStartOrder: boolean;
  canUpdateOrder: boolean;
  canAssignCaptain: boolean;
  canTransitionStatus: boolean;
  onWalkInClick: (table: RestaurantTable) => void;
};

export default function FloorTile(props: FloorTileProps): ReactElement {
  const { table, colorClasses, elapsedMinutes } = props;
  const showSidePane = useShowSidePane();
  const completeOrder = useCompleteOrder();
  const transitionStatus = useTransitionTableStatus();
  const statusCode = table.currentStatus.code;
  const reservation = table.activeReservation;
  const isBusy = completeOrder.isPending || transitionStatus.isPending;

  async function editReservation(): Promise<void> {
    if (!reservation) return;
    try {
      showSidePane(SidePaneType.ReservationEdit, {
        reservation: await getReservation(reservation.id),
      });
    } catch {
      toast.error('Unable to load the reservation.');
    }
  }

  const details = (
    <>
      <div className="flex items-center gap-2">
        <span className={cn('size-2 rounded-full', colorClasses.dot)} aria-hidden />
        <span className="font-semibold">{table.currentStatus.name}</span>
      </div>
      {needsTimer(statusCode) && (
        <p className="mt-2 text-xs text-muted-foreground tabular-nums">
          In this status for {formatElapsed(elapsedMinutes)}
        </p>
      )}
      <p className="mt-2 text-xs">
        <span className="font-medium text-muted-foreground">Captain: </span>
        {table.captain ? (
          <>
            {table.captain.name}{' '}
            <span className="text-muted-foreground">({table.captain.role})</span>
          </>
        ) : (
          <span className="text-muted-foreground">No captain assigned.</span>
        )}
      </p>
      {reservation && (
        <div className="mt-3 border-t pt-3 text-xs">
          <p className="font-medium">
            {reservation.guest.guestName} · {reservation.partySize} guests
          </p>
          <p className="text-muted-foreground">
            {new Date(reservation.reservationAt).toLocaleString()}
          </p>
        </div>
      )}
    </>
  );

  return (
    <Popover.Root>
      <Tooltip.Root>
        <Popover.Trigger
          render={<Tooltip.Trigger delay={300} closeOnClick />}
          aria-label={`Table ${table.tableNumber}, ${table.capacity} seats, ${table.currentStatus.name}. Open actions`}
          className={cn(
            'flex min-h-28 w-full cursor-pointer flex-col items-center rounded-xl px-2 pb-2 pt-3 text-center ring-2 transition-transform hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-offset-2',
            colorClasses.bg,
            colorClasses.ring,
          )}
        >
          <Armchair className="size-7" strokeWidth={1.7} aria-hidden />
          <span className="mt-1 max-w-full truncate text-sm font-bold leading-none">
            {table.tableNumber}
          </span>
          <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="size-3" aria-hidden />
            {table.capacity}
          </span>
          <span className="mt-1 max-w-full truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {table.currentStatus.name}
          </span>
          <span className={cn('mt-auto h-1 w-full rounded-full', colorClasses.strip)} aria-hidden />
        </Popover.Trigger>
        <Tooltip.Portal>
          <Tooltip.Positioner
            className="z-50 hidden md:block"
            sideOffset={8}
            collisionPadding={12}
            collisionAvoidance={{ side: 'flip', align: 'shift' }}
          >
            <Tooltip.Popup className="w-56 rounded-lg border bg-popover p-3 text-left text-sm text-popover-foreground shadow-lg">
              {details}
            </Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
      <Popover.Portal>
        <Popover.Positioner
          className="z-50"
          sideOffset={8}
          collisionPadding={12}
          collisionAvoidance={{ side: 'flip', align: 'shift' }}
          sticky
        >
          <Popover.Popup className="max-h-[calc(100dvh-1.5rem)] w-72 overflow-y-auto rounded-lg border bg-popover p-3 text-sm text-popover-foreground shadow-lg focus:outline-none">
            {details}
            <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
              {statusCode === 'AVAILABLE' && props.canReserve && (
                <Button size="sm" onClick={() => props.onWalkInClick(table)}>
                  Create walk-in
                </Button>
              )}
              {reservation && props.canEditReservation && (
                <Button size="sm" variant="outline" onClick={() => void editReservation()}>
                  Edit reservation
                </Button>
              )}
              {reservation && props.canViewOrder && statusCode !== 'AVAILABLE' && (
                <Link
                  href={`/orders/tables/${table.id}?reservationId=${reservation.id}`}
                  className={buttonVariants({ variant: 'outline', size: 'sm' })}
                >
                  {table.openOrderId
                    ? 'View order'
                    : props.canStartOrder
                      ? 'Start order'
                      : 'View order'}
                </Link>
              )}
              {table.openOrderId && props.canUpdateOrder && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isBusy}
                  onClick={() => void completeOrder.mutateAsync(table.openOrderId!)}
                >
                  Complete order
                </Button>
              )}
              {statusCode === 'NEEDS_CLEANING' && props.canTransitionStatus && (
                <Button
                  size="sm"
                  disabled={isBusy}
                  onClick={() =>
                    void transitionStatus.mutateAsync({
                      id: table.id,
                      input: { statusCode: 'AVAILABLE' },
                    })
                  }
                >
                  Mark available
                </Button>
              )}
              {props.canAssignCaptain && <TableCaptainAction table={table} />}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
