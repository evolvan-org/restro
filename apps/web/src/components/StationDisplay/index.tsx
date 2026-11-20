'use client';

import './station-display.css';

import { Permission } from '@rms/permissions';
import { CircleCheck, WifiOff } from 'lucide-react';
import { type ReactElement, useEffect, useMemo, useRef, useState } from 'react';

import usePermissionGuard from '@/hooks/auth/usePermissionGuard';
import usePermissions from '@/hooks/auth/usePermissions';
import { useKotQueue } from '@/services/api/requests/kots';

import type { StationConfig } from './config';
import { useFullscreen, useNow, useStationTheme } from './hooks';
import { sortOldestFirst, urgencyOf } from './mapper';
import TicketCard, { type ActiveTicket } from './TicketCard';
import TopBar, { type StatusFilter } from './TopBar';

export default function StationDisplay({
  station,
}: {
  station: StationConfig;
}): ReactElement | null {
  const allowed = usePermissionGuard([Permission.KOT_READ]);
  const { can } = usePermissions();
  const queue = useKotQueue(station.destination, allowed);
  const [theme, toggleTheme] = useStationTheme(station.destination);
  const [fullscreen, toggleFullscreen] = useFullscreen();
  const [filter, setFilter] = useState<StatusFilter>('ALL');
  const now = useNow();
  const seen = useRef(new Set<string>());

  const data = queue.data;
  const tickets = useMemo(
    () =>
      sortOldestFirst(
        (data ?? []).filter(
          (ticket) => ticket.destination === station.destination && ticket.status !== 'COMPLETED',
        ),
      ) as ActiveTicket[],
    [data, station.destination],
  );

  useEffect(() => {
    tickets.forEach((ticket) => seen.current.add(ticket.id));
  }, [tickets]);

  if (!allowed) return null;

  const offline = queue.isError;
  const counts: Record<StatusFilter, number> = {
    ALL: tickets.length,
    PENDING: 0,
    PREPARING: 0,
    READY: 0,
  };
  let lateCount = 0;
  for (const ticket of tickets) {
    counts[ticket.status] += 1;
    if (urgencyOf(ticket, station, now) === 'late') lateCount += 1;
  }
  const visible = tickets.filter((ticket) => filter === 'ALL' || ticket.status === filter);
  const canAdvance = can(Permission.KOT_UPDATE_STATUS);

  return (
    <div className="kds min-h-svh" data-theme={theme} style={{ colorScheme: theme }}>
      <TopBar
        station={station}
        offline={offline}
        lastSync={queue.dataUpdatedAt}
        counts={counts}
        filter={filter}
        onFilterChange={setFilter}
        lateCount={lateCount}
        dark={theme === 'dark'}
        onToggleTheme={toggleTheme}
        fullscreen={fullscreen}
        onToggleFullscreen={toggleFullscreen}
      />
      {offline && (
        <div
          role="alert"
          className="mx-6 mt-5 flex flex-wrap items-center justify-between gap-4 rounded-[14px] border border-[var(--warn-border)] bg-[var(--warn-bg)] px-5 py-4 text-[var(--warn-fg)]"
        >
          <p className="m-0 flex items-center gap-2.5 text-[17px] font-semibold">
            <WifiOff className="size-[22px]" aria-hidden />
            Can&apos;t reach the server. Showing the last update.
          </p>
          <button
            type="button"
            disabled={queue.isFetching}
            onClick={() => {
              void queue.refetch();
            }}
            className="min-h-12 rounded-xl border border-current bg-transparent px-5 text-base font-bold text-inherit"
          >
            Try again
          </button>
        </div>
      )}
      <main className="px-6 pt-5 pb-7">
        {queue.isPending ? (
          <p role="status" className="py-16 text-center text-[17px] text-[var(--muted)]">
            Loading tickets…
          </p>
        ) : visible.length === 0 ? (
          <div
            role="status"
            className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-[var(--muted)]"
          >
            <CircleCheck className="size-14 text-[var(--ready)]" strokeWidth={1.8} aria-hidden />
            <p className="m-0 text-[28px] font-bold text-[var(--text)]">All caught up</p>
            <p className="m-0 text-[17px]">{station.emptyText}</p>
          </div>
        ) : (
          <div
            className={`grid items-start gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(320px,100%),1fr))] ${offline ? 'opacity-60' : ''}`}
          >
            {visible.map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                station={station}
                urgency={urgencyOf(ticket, station, now)}
                canAdvance={canAdvance}
                disabled={offline}
                animateIn={!seen.current.has(ticket.id)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
