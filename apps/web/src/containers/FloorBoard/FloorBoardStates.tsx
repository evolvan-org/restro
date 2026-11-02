'use client';

import { cn } from 'cn';
import { RefreshCw, Search, Table2, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import type { ReactElement } from 'react';

import { Button, buttonVariants } from '@/components/ui/button';

function StateShell({
  icon,
  tone = 'neutral',
  title,
  description,
  children,
  alert,
}: {
  icon: ReactElement;
  tone?: 'neutral' | 'danger';
  title: string;
  description?: string;
  children?: ReactElement | null;
  alert?: boolean;
}): ReactElement {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-6 py-14 text-center">
      <div
        className={cn(
          'grid size-12 place-items-center rounded-xl',
          tone === 'danger' ? 'bg-red-100 text-red-600 dark:bg-red-950/40' : 'bg-muted text-muted-foreground',
        )}
      >
        {icon}
      </div>
      <p {...(alert ? { role: 'alert' } : {})} className="text-base font-semibold">
        {title}
      </p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {children}
    </div>
  );
}

export function FloorLoading(): ReactElement {
  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-9 w-28 animate-pulse rounded-full bg-neutral-100 dark:bg-neutral-800" />
        ))}
      </div>
      {[0, 1].map((section) => (
        <div key={section} className="space-y-3">
          <div className="h-3 w-40 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
          <div className="flex flex-wrap gap-2.5 xl:gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-[100px] w-[88px] animate-pulse rounded-[10px] bg-neutral-100 xl:h-[120px] xl:w-[112px] dark:bg-neutral-800"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function FloorEmpty(): ReactElement {
  return (
    <StateShell
      icon={<Table2 className="size-6" aria-hidden />}
      title="No active tables yet"
      description="Add tables and give each one a section to see them on the floor board."
    >
      <Link href="/tables" className={buttonVariants({ size: 'default' })}>
        Set up tables
      </Link>
    </StateShell>
  );
}

export function FloorNoMatch({
  message,
  onClear,
}: {
  message: string;
  onClear: () => void;
}): ReactElement {
  return (
    <StateShell icon={<Search className="size-6" aria-hidden />} title="No tables match" description={message}>
      <Button variant="outline" onClick={onClear}>
        Clear filters
      </Button>
    </StateShell>
  );
}

export function FloorError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}): ReactElement {
  return (
    <StateShell
      icon={<TriangleAlert className="size-6" aria-hidden />}
      tone="danger"
      title="Unable to load the floor board"
      description={message}
      alert
    >
      <Button variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </StateShell>
  );
}

export function ReconnectingBanner({
  lastUpdatedLabel,
  onRefresh,
  isRefreshing,
}: {
  lastUpdatedLabel: string;
  onRefresh: () => void;
  isRefreshing: boolean;
}): ReactElement {
  return (
    <div className="mb-4 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <RefreshCw className={cn('size-4 shrink-0', isRefreshing && 'animate-spin')} aria-hidden />
      <div className="min-w-0">
        <p className="font-semibold">Reconnecting…</p>
        <p className="truncate text-xs">
          {lastUpdatedLabel} Timers keep counting; statuses may be out of date.
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="ml-auto border-amber-300 bg-amber-100 hover:bg-amber-200 dark:border-amber-800 dark:bg-amber-900/40"
        onClick={onRefresh}
        disabled={isRefreshing}
      >
        Refresh now
      </Button>
    </div>
  );
}
