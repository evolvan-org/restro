'use client';

import { Popover } from '@base-ui/react/popover';
import { Tooltip } from '@base-ui/react/tooltip';
import type { RestaurantTable } from '@rms/api-contract';
import { cn } from 'cn';
import { Calendar, Clock, TriangleAlert, Users, X } from 'lucide-react';
import Link from 'next/link';
import { type ReactElement, type ReactNode, useState } from 'react';
import { toast } from 'sonner';

import TableCaptainAction from '@/components/TableCaptainAction';
import { Button, buttonVariants } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import useMediaQuery from '@/hooks/useMediaQuery';
import { useCompleteOrder } from '@/services/api/requests/orders';
import { getReservation } from '@/services/api/requests/reservations';
import { useTransitionTableStatus } from '@/services/api/requests/tables';
import { useShowSidePane } from '@/store/hooks/sidepane';
import { SidePaneType } from '@/store/types/sidepane';

import { elapsedMinutes, getTableAttention, minutesUntil } from './attention';
import styles from './ready.module.css';

export type StatusColorClasses = {
  /** Tile background + border. */
  bg: string;
  border: string;
  /** Status label text colour. */
  label: string;
  /** Strip + status dot. */
  dot: string;
  strip: string;
  /** Popover status pill. */
  pill: string;
};

const SYSTEM_STATUS_COLORS: Record<string, StatusColorClasses> = {
  AVAILABLE: {
    bg: 'bg-green-50 dark:bg-green-950/30',
    border: 'border-green-200 dark:border-green-900',
    label: 'text-green-700 dark:text-green-300',
    dot: 'bg-green-500',
    strip: 'bg-green-500',
    pill: 'bg-green-100 text-green-700 dark:bg-green-400/20 dark:text-green-300',
  },
  OCCUPIED: {
    bg: 'bg-slate-100 dark:bg-slate-900/40',
    border: 'border-slate-300 dark:border-slate-700',
    label: 'text-slate-700 dark:text-slate-300',
    dot: 'bg-slate-500',
    strip: 'bg-slate-500',
    pill: 'bg-slate-200 text-slate-700 dark:bg-slate-400/20 dark:text-slate-300',
  },
  RESERVED: {
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    border: 'border-blue-200 dark:border-blue-900',
    label: 'text-blue-700 dark:text-blue-300',
    dot: 'bg-blue-500',
    strip: 'bg-blue-500',
    pill: 'bg-blue-100 text-blue-700 dark:bg-blue-400/20 dark:text-blue-300',
  },
  NEEDS_CLEANING: {
    bg: 'bg-red-50 dark:bg-red-950/30',
    border: 'border-red-200 dark:border-red-900',
    label: 'text-red-700 dark:text-red-300',
    dot: 'bg-red-500',
    strip: 'bg-red-500',
    pill: 'bg-red-100 text-red-700 dark:bg-red-400/20 dark:text-red-300',
  },
};

export const DEFAULT_STATUS_COLOR: StatusColorClasses = {
  bg: 'bg-muted/20',
  border: 'border-border',
  label: 'text-muted-foreground',
  dot: 'bg-muted-foreground/40',
  strip: 'bg-muted-foreground/40',
  pill: 'bg-muted text-muted-foreground',
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

/** Elapsed minutes formatted as `H:MM` for the tile and popover timers. */
export function formatElapsed(minutes: number): string {
  const clamped = Math.max(0, Math.floor(minutes));
  return `${Math.floor(clamped / 60)}:${String(clamped % 60).padStart(2, '0')}`;
}

/** A reservation / status timestamp as a wall-clock time, e.g. `7:30 PM`. */
export function formatClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

type FloorTileProps = {
  table: RestaurantTable;
  colorClasses: StatusColorClasses;
  nowMs: number;
  canReserve: boolean;
  canEditReservation: boolean;
  canViewOrder: boolean;
  canStartOrder: boolean;
  canUpdateOrder: boolean;
  canAssignCaptain: boolean;
  canTransitionStatus: boolean;
  statuses: readonly { id: string; code: string; name: string }[];
  onWalkInClick: (table: RestaurantTable) => void;
};

export default function FloorTile(props: FloorTileProps): ReactElement {
  const { table, colorClasses, nowMs, statuses } = props;
  const [open, setOpen] = useState(false);
  const isPhone = useMediaQuery('(max-width: 767px)');

  const statusCode = table.currentStatus.code;
  const reservation = table.activeReservation;
  const attention = getTableAttention(table, nowMs);
  const hasReadyTickets = table.readyKotCount > 0;
  const elapsed = elapsedMinutes(table.statusChangedAt, nowMs);

  const showsTimer = statusCode === 'OCCUPIED' || statusCode === 'NEEDS_CLEANING';
  const tileTime = showsTimer
    ? formatElapsed(elapsed)
    : statusCode === 'RESERVED' && reservation
      ? formatClockTime(reservation.reservationAt)
      : null;
  const subLine = hasReadyTickets
    ? `${table.readyKotCount} ready to serve`
    : statusCode === 'AVAILABLE'
      ? 'Free'
      : table.captain
        ? firstName(table.captain.name)
        : reservation
          ? `${reservation.guest.guestName} ×${reservation.partySize}`
          : '—';

  const ariaLabel = `Table ${table.tableNumber}, ${table.capacity} seats, ${table.currentStatus.name}${
    attention ? ', needs attention' : ''
  }${hasReadyTickets ? `, ${table.readyKotCount} tickets ready to serve` : ''}. Open actions`;

  const tileInner = (
    <>
      {(hasReadyTickets || Boolean(attention)) && (
        <span
          aria-hidden
          className="absolute -right-[7px] -top-[7px] grid size-5 place-items-center rounded-full border-2 border-white bg-amber-500 text-[11px] font-bold leading-none text-stone-900"
        >
          {hasReadyTickets ? '✓' : '!'}
        </span>
      )}
      <div className="flex w-full items-start justify-between">
        <span className="max-w-[70%] truncate text-base font-bold leading-none xl:text-lg">
          {table.tableNumber}
        </span>
        <span className="flex items-center gap-0.5 text-xs text-neutral-600 dark:text-neutral-400">
          <Users className="size-3" aria-hidden />
          {table.capacity}
        </span>
      </div>
      <span
        className={cn(
          'mt-1 truncate text-[10px] font-semibold uppercase tracking-wide xl:text-[11px]',
          colorClasses.label,
        )}
      >
        {table.currentStatus.name}
      </span>
      <div className="mt-auto w-full">
        {tileTime && (
          <span className="block text-[13px] font-semibold tabular-nums xl:text-[15px]">
            {tileTime}
          </span>
        )}
        <span className="block truncate text-[11px] text-neutral-600 xl:text-xs dark:text-neutral-400">
          {subLine}
        </span>
        <span
          className={cn('mt-1 block h-[3px] rounded-full xl:mt-[5px]', colorClasses.strip)}
          aria-hidden
        />
      </div>
    </>
  );

  const tileClassName = cn(
    'relative flex h-[100px] w-[88px] cursor-pointer flex-col rounded-[10px] border px-[9px] py-2 text-left transition-transform',
    'hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-offset-2',
    'data-[popup-open]:z-50 data-[popup-open]:shadow-lg data-[popup-open]:ring-2 data-[popup-open]:ring-neutral-900 data-[popup-open]:ring-offset-2',
    'xl:h-[120px] xl:w-[112px] xl:rounded-xl xl:px-[11px] xl:py-2.5',
    colorClasses.bg,
    colorClasses.border,
    hasReadyTickets && styles.ready,
    attention && !hasReadyTickets && 'ring-2 ring-amber-500',
  );

  const popoverBody = (
    <TablePopoverBody
      {...props}
      attention={attention}
      elapsed={elapsed}
      onClose={() => setOpen(false)}
    />
  );

  // Phone: the actions render in a bottom Sheet instead of an anchored popover.
  if (isPhone) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger aria-label={ariaLabel} className={tileClassName}>
          {tileInner}
        </SheetTrigger>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-t-2xl p-4"
        >
          {popoverBody}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Tooltip.Root>
        <Popover.Trigger
          render={<Tooltip.Trigger delay={300} closeOnClick />}
          aria-label={ariaLabel}
          className={tileClassName}
        >
          {tileInner}
        </Popover.Trigger>
        <Tooltip.Portal>
          <Tooltip.Positioner
            className="z-50 hidden xl:block"
            sideOffset={8}
            collisionPadding={12}
            collisionAvoidance={{ side: 'flip', align: 'shift' }}
          >
            <Tooltip.Popup className="w-56 rounded-lg border bg-popover p-3 text-left text-sm text-popover-foreground shadow-lg">
              <TileTooltip table={table} colorClasses={colorClasses} nowMs={nowMs} />
            </Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
      {/* Touch-only scrim; desktop (xl) relies on outside-press without dimming. */}
      <Popover.Backdrop className="z-40 bg-black/20 xl:hidden" />
      <Popover.Portal>
        <Popover.Positioner
          className="z-50"
          sideOffset={12}
          collisionPadding={12}
          collisionAvoidance={{ side: 'flip', align: 'shift' }}
          sticky
        >
          <Popover.Popup className="max-h-[calc(100dvh-1.5rem)] w-[360px] overflow-y-auto rounded-xl border bg-popover p-4 text-sm text-popover-foreground shadow-xl focus:outline-none">
            <Popover.Arrow className="data-[side=bottom]:top-[-7px] data-[side=top]:bottom-[-7px]">
              <svg width="14" height="7" viewBox="0 0 14 7" className="fill-popover">
                <path d="M0 7 L7 0 L14 7 Z" className="stroke-border" strokeWidth="1" />
              </svg>
            </Popover.Arrow>
            {popoverBody}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function TileTooltip({
  table,
  colorClasses,
  nowMs,
}: {
  table: RestaurantTable;
  colorClasses: StatusColorClasses;
  nowMs: number;
}): ReactElement {
  const reservation = table.activeReservation;
  const code = table.currentStatus.code;
  const timeInStatus =
    code === 'OCCUPIED' || code === 'NEEDS_CLEANING'
      ? formatElapsed(elapsedMinutes(table.statusChangedAt, nowMs))
      : code === 'RESERVED' && reservation
        ? formatClockTime(reservation.reservationAt)
        : null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className={cn('size-2 rounded-full', colorClasses.dot)} aria-hidden />
        <span className="font-semibold">{table.currentStatus.name}</span>
        {timeInStatus && <span className="tabular-nums text-muted-foreground">{timeInStatus}</span>}
      </div>
      {table.captain && (
        <p className="text-muted-foreground">
          Captain {table.captain.name} · {table.captain.role}
        </p>
      )}
      {reservation && (
        <p className="text-muted-foreground">
          {reservation.guest.guestName} · {reservation.partySize} guests ·{' '}
          {formatClockTime(reservation.reservationAt)}
        </p>
      )}
    </div>
  );
}

type TablePopoverBodyProps = FloorTileProps & {
  attention: ReturnType<typeof getTableAttention>;
  elapsed: number;
  onClose: () => void;
};

function TablePopoverBody(props: TablePopoverBodyProps): ReactElement {
  const { table, colorClasses, nowMs, attention, elapsed, statuses } = props;
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

  function changeStatus(code: string): void {
    if (code === statusCode) return;
    void transitionStatus.mutateAsync({ id: table.id, input: { statusCode: code } });
  }

  // Status row (§1.4): a pill plus a state-specific timer / time and a muted since/until line.
  const since = formatClockTime(table.statusChangedAt);
  let timer: ReactNode = null;
  let subtle: ReactNode = null;
  if (statusCode === 'AVAILABLE') {
    subtle = `Free for ${Math.round(elapsed)} min`;
  } else if (statusCode === 'RESERVED' && reservation) {
    const until = Math.round(minutesUntil(reservation.reservationAt, nowMs));
    timer = formatClockTime(reservation.reservationAt);
    subtle = until >= 0 ? `in ${until} min` : `${Math.abs(until)} min ago`;
  } else {
    timer = formatElapsed(elapsed);
    subtle = `since ${since}`;
  }

  const orderAction =
    reservation && props.canViewOrder && statusCode !== 'AVAILABLE' ? (
      <Link
        href={`/orders/tables/${table.id}?reservationId=${reservation.id}`}
        className={cn(buttonVariants({ size: 'default' }), 'h-11 w-full xl:h-9')}
      >
        {table.openOrderId ? 'View order' : props.canStartOrder ? 'Start order' : 'View order'}
      </Link>
    ) : null;

  const primary =
    statusCode === 'AVAILABLE' && props.canReserve ? (
      <Button className="h-11 w-full xl:h-9" onClick={() => props.onWalkInClick(table)}>
        Create walk-in
      </Button>
    ) : statusCode === 'NEEDS_CLEANING' && props.canTransitionStatus ? (
      <Button
        className="h-11 w-full xl:h-9"
        disabled={isBusy}
        onClick={() => changeStatus('AVAILABLE')}
      >
        Mark available
      </Button>
    ) : (
      orderAction
    );

  const canCompleteOrder = Boolean(table.openOrderId) && props.canUpdateOrder;
  const canEditReservation = Boolean(reservation) && props.canEditReservation;
  const secondary: ReactNode[] = [];
  if (canCompleteOrder) {
    secondary.push(
      <Button
        key="complete"
        variant="outline"
        className="h-11 w-full xl:h-9"
        disabled={isBusy}
        onClick={() => void completeOrder.mutateAsync(table.openOrderId!)}
      >
        Complete order
      </Button>,
    );
  }
  if (canEditReservation) {
    secondary.push(
      <Button
        key="edit"
        variant="outline"
        className="h-11 w-full xl:h-9"
        onClick={() => void editReservation()}
      >
        Edit reservation
      </Button>,
    );
  }

  return (
    <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
      {/* Header */}
      <div className="flex items-center gap-3 pb-3">
        <span className="text-[22px] font-bold leading-none">{table.tableNumber}</span>
        <span className="text-sm text-muted-foreground">{table.section.name}</span>
        <span className="flex items-center gap-1 text-sm text-muted-foreground">
          <Users className="size-4" aria-hidden />
          {table.capacity} seats
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close"
          className="ml-auto size-11"
          onClick={props.onClose}
        >
          <X className="size-5" />
        </Button>
      </div>

      {/* Status row */}
      <div className="flex items-center gap-3 py-3">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
            colorClasses.pill,
          )}
        >
          <span className={cn('size-2 rounded-full', colorClasses.dot)} aria-hidden />
          {table.currentStatus.name}
        </span>
        {timer && (
          <span className="flex items-center gap-1 text-lg font-bold tabular-nums">
            <Clock className="size-4 text-muted-foreground" aria-hidden />
            {timer}
          </span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{subtle}</span>
      </div>

      {/* Attention callout */}
      {attention && (
        <div className="py-3">
          <AttentionCallout attention={attention} reservation={reservation} nowMs={nowMs} />
        </div>
      )}

      {/* Details */}
      <div className="py-1.5">
        <DetailRow label="Guest" value={guestValue(table)} />
        {statusCode !== 'AVAILABLE' && statusCode !== 'NEEDS_CLEANING' && (
          <DetailRow label="Booking" value={bookingValue(table)} />
        )}
        {(statusCode === 'OCCUPIED' || statusCode === 'RESERVED') && (
          <DetailRow
            label="Order"
            value={
              table.openOrderId ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-green-500" aria-hidden />
                  Open
                </span>
              ) : (
                <span className="text-muted-foreground">Not started</span>
              )
            }
          />
        )}
      </div>

      {/* Actions */}
      {(primary || secondary.length > 0) && (
        <div className="space-y-2 py-3">
          {primary}
          {secondary.length > 0 && <div className="grid grid-cols-2 gap-2">{secondary}</div>}
        </div>
      )}

      {/* Status radiogroup */}
      {props.canTransitionStatus && statuses.length > 0 && (
        <div className="py-3">
          <p className="mb-1.5 text-[13px] text-muted-foreground">Status</p>
          <div
            role="radiogroup"
            aria-label="Change table status"
            className="flex gap-1 rounded-[9px] bg-neutral-100 p-1 dark:bg-neutral-800"
          >
            {statuses.map((status) => {
              const active = status.code === statusCode;
              return (
                <button
                  key={status.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={isBusy}
                  onClick={() => changeStatus(status.code)}
                  className={cn(
                    'flex-1 rounded-md px-2 py-1.5 text-xs transition-colors disabled:opacity-50',
                    active
                      ? 'bg-white font-semibold text-foreground shadow-sm dark:bg-neutral-950'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {status.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Captain */}
      {props.canAssignCaptain && (
        <div className="py-3 [&>div]:w-full">
          <TableCaptainAction table={table} />
        </div>
      )}
    </div>
  );
}

function guestValue(table: RestaurantTable): ReactNode {
  const code = table.currentStatus.code;
  const reservation = table.activeReservation;
  if (code === 'AVAILABLE') return <span className="text-muted-foreground">No one seated</span>;
  if (code === 'NEEDS_CLEANING') {
    return (
      <span className="text-muted-foreground">
        Last guest · Left {formatClockTime(table.statusChangedAt)}
      </span>
    );
  }
  if (reservation) return `${reservation.guest.guestName} · ${reservation.partySize} guests`;
  return <span className="text-muted-foreground">—</span>;
}

function bookingValue(table: RestaurantTable): ReactNode {
  const reservation = table.activeReservation;
  if (!reservation) return <span className="text-muted-foreground">—</span>;
  const prefix = reservation.status === 'SEATED' ? 'Walk-in · ' : 'Today, ';
  return `${prefix}${formatClockTime(reservation.reservationAt)}`;
}

function DetailRow({ label, value }: { label: string; value: ReactNode }): ReactElement {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="text-right text-sm">{value}</span>
    </div>
  );
}

function AttentionCallout({
  attention,
  reservation,
  nowMs,
}: {
  attention: NonNullable<ReturnType<typeof getTableAttention>>;
  reservation: RestaurantTable['activeReservation'];
  nowMs: number;
}): ReactElement {
  const blue = attention === 'arriving-soon';
  let message: string;
  if (attention === 'long-seated') {
    message = `Seated past the 90 min turn target`;
  } else if (attention === 'cleaning-overdue') {
    message = `Cleaning overdue past the 10 min target`;
  } else {
    const until = reservation
      ? Math.max(0, Math.round(minutesUntil(reservation.reservationAt, nowMs)))
      : 0;
    message = `Reserved guest arriving in ${until} min`;
  }

  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-lg border px-3 py-2 text-[13px]',
        blue
          ? 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200'
          : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
      )}
    >
      {blue ? (
        <Calendar className="mt-0.5 size-4 shrink-0" aria-hidden />
      ) : (
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      )}
      <span>{message}</span>
    </div>
  );
}
