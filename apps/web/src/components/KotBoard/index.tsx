'use client';

import type { KotDestination } from '@rms/api-contract';
import { Permission } from '@rms/permissions';
import { ChefHat, CircleCheck, GlassWater, RefreshCw, WifiOff } from 'lucide-react';
import Link from 'next/link';
import { type ReactElement, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import usePermissionGuard from '@/hooks/auth/usePermissionGuard';
import usePermissions from '@/hooks/auth/usePermissions';
import { getApiErrorMessage } from '@/lib/api-error';
import { useKotQueue } from '@/services/api/requests/kots';

import { boardSettings, KOT_LANES, ticketsInLane } from './mapper';
import TicketCard from './TicketCard';

export default function KotBoard({
  destination,
}: {
  destination: KotDestination;
}): ReactElement | null {
  const allowed = usePermissionGuard([Permission.KOT_READ]);
  const { can } = usePermissions();
  const queue = useKotQueue(destination, allowed);
  // Display clock only; server data and mutation state stay in TanStack Query.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
  }, [queue.dataUpdatedAt]);

  if (!allowed) return null;

  const settings = boardSettings(destination);
  const tickets = (queue.data ?? []).filter((ticket) => ticket.destination === destination);
  const activeCount = tickets.filter((ticket) => ticket.status !== 'COMPLETED').length;
  const Icon = destination === 'KITCHEN' ? ChefHat : GlassWater;

  return (
    <div className="min-h-[calc(100svh-4rem)] bg-muted/20 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2.5 text-3xl font-semibold tracking-tight">
              <Icon className="size-7 text-rose-700 dark:text-rose-400" aria-hidden />
              {settings.title}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{settings.description}</p>
          </div>
          <nav aria-label="KOT station" className="flex gap-2">
            {(
              [
                { destination: 'KITCHEN', href: '/kitchen', label: 'Kitchen' },
                { destination: 'BAR', href: '/bar', label: 'Bar' },
              ] as const
            ).map((station) => (
              <Link
                key={station.destination}
                href={station.href}
                aria-current={destination === station.destination ? 'page' : undefined}
                className={`inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${destination === station.destination ? 'border-rose-700 bg-rose-700 text-white dark:border-rose-500 dark:bg-rose-500' : 'bg-card text-muted-foreground hover:bg-muted'}`}
              >
                {station.label}
              </Link>
            ))}
          </nav>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3 text-sm">
          <div className="flex items-center gap-2" role="status">
            <span
              className={`size-2 rounded-full ${queue.isError ? 'bg-amber-500' : queue.dataUpdatedAt ? 'bg-emerald-500' : 'bg-muted-foreground'}`}
              aria-hidden
            />
            <span className="font-medium">
              {queue.isError
                ? 'Reconnecting'
                : queue.dataUpdatedAt
                  ? 'Live updates'
                  : 'Connecting…'}
            </span>
            {queue.dataUpdatedAt > 0 && (
              <span className="text-muted-foreground">
                Updated{' '}
                {new Date(queue.dataUpdatedAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
            )}
          </div>
          <span className="text-muted-foreground">
            {activeCount} active {activeCount === 1 ? 'ticket' : 'tickets'} · Refreshes every 10
            seconds
          </span>
        </div>

        {queue.isError && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300/60 bg-amber-50 p-4 text-amber-900 dark:bg-amber-400/10 dark:text-amber-200"
          >
            <p className="flex items-center gap-2 text-sm">
              <WifiOff className="size-4 shrink-0" aria-hidden />
              {getApiErrorMessage(
                queue.error,
                'Unable to refresh tickets. Retrying on the next update.',
              )}
              {queue.data && ' Showing the last successful update.'}
            </p>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={queue.isFetching}
              onClick={() => {
                void queue.refetch();
              }}
            >
              <RefreshCw className="size-4" aria-hidden />
              Try again
            </Button>
          </div>
        )}

        {!queue.isPending && !queue.isError && activeCount === 0 && (
          <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <CircleCheck className="size-4 text-emerald-600" aria-hidden />
            All caught up. New {settings.station.toLowerCase()} tickets will appear here.
          </div>
        )}

        <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3 xl:grid xl:grid-cols-3 xl:overflow-visible">
          {KOT_LANES.map((lane) => {
            const rows = ticketsInLane(tickets, lane.status);
            return (
              <section
                key={lane.status}
                aria-label={`${lane.label} tickets`}
                className="flex min-h-[55svh] w-[85%] shrink-0 snap-center flex-col gap-3 rounded-3xl bg-muted/60 p-3 xl:w-auto lg:p-4"
              >
                <header className="flex items-center justify-between gap-2 px-1 py-1">
                  <h2 className="flex items-center gap-2 text-sm font-semibold">
                    <span className={`size-2 rounded-full ${lane.dot}`} aria-hidden />
                    {lane.label}
                  </h2>
                  <span className="rounded-full bg-background px-2.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                    {rows.length}
                  </span>
                </header>
                {queue.isPending && (
                  <p role="status" className="py-8 text-center text-sm text-muted-foreground">
                    Loading tickets…
                  </p>
                )}
                {!queue.isPending && !queue.isError && rows.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">No tickets</p>
                )}
                {rows.map((ticket) => (
                  <TicketCard
                    key={ticket.id}
                    ticket={ticket}
                    destination={destination}
                    now={now}
                    canAdvance={can(Permission.KOT_UPDATE_STATUS)}
                  />
                ))}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
