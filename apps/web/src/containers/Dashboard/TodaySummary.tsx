'use client';

import type { TodaySummary as TodaySummaryData } from '@rms/api-contract';
import { cn } from 'cn';
import { Armchair, CircleCheckBig, type LucideIcon, ReceiptText, WalletCards } from 'lucide-react';
import type { ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getApiErrorMessage } from '@/lib/api-error';
import { useTodaySummary } from '@/services/api/requests/dashboard';

type MetricCardProps = {
  label: string;
  value?: string;
  loading: boolean;
  icon: LucideIcon;
  iconClassName: string;
};

function MetricCard({
  label,
  value,
  loading,
  icon: Icon,
  iconClassName,
}: MetricCardProps): ReactElement {
  return (
    <Card className="min-w-0 gap-2 rounded-2xl border border-border p-3 shadow-none ring-0 sm:gap-3 sm:rounded-3xl sm:p-5">
      <dt className="flex items-center justify-between gap-2 text-xs leading-tight font-medium text-muted-foreground sm:text-[13px]">
        {label}
        <span
          className={cn(
            'grid size-8 shrink-0 place-items-center rounded-full sm:size-9',
            iconClassName,
          )}
          aria-hidden
        >
          <Icon className="size-4 sm:size-[18px]" />
        </span>
      </dt>
      <dd className="min-h-7">
        {loading ? (
          <>
            <span
              className="block h-7 w-16 rounded bg-muted motion-safe:animate-pulse sm:h-9 sm:w-24"
              aria-hidden
            />
            <span className="sr-only">Loading</span>
          </>
        ) : (
          <span
            className={
              value === undefined
                ? 'text-sm text-muted-foreground'
                : 'text-xl leading-7 font-semibold tracking-tight tabular-nums [overflow-wrap:anywhere] sm:text-3xl sm:leading-9'
            }
          >
            {value ?? 'Unavailable'}
          </span>
        )}
      </dd>
    </Card>
  );
}

function formatRevenue(summary: TodaySummaryData): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: summary.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(summary.revenue));
}

export default function TodaySummary(): ReactElement {
  const summary = useTodaySummary();
  const data = summary.data;
  const metrics: Omit<MetricCardProps, 'loading'>[] = [
    {
      label: 'Revenue',
      value: data ? formatRevenue(data) : undefined,
      icon: WalletCards,
      iconClassName:
        'bg-emerald-100/80 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    },
    {
      label: 'Orders',
      value: data?.orders.toLocaleString(),
      icon: ReceiptText,
      iconClassName: 'bg-rose-100/80 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
    },
    {
      label: 'Completed orders',
      value: data?.completedOrders.toLocaleString(),
      icon: CircleCheckBig,
      iconClassName: 'bg-indigo-100/80 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
    },
    {
      label: 'Active tables',
      value: data?.activeTables.toLocaleString(),
      icon: Armchair,
      iconClassName: 'bg-amber-100/80 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    },
  ];

  return (
    <section
      aria-labelledby="today-summary-heading"
      aria-busy={summary.isPending}
      className="@container"
    >
      <h2 id="today-summary-heading" className="sr-only">
        Today&apos;s summary
      </h2>
      {summary.isError && (
        <div
          className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/25 bg-card px-3 py-2"
          role="alert"
        >
          <p className="text-sm text-destructive">
            {getApiErrorMessage(summary.error, 'Unable to load today’s summary.')}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={summary.isFetching}
            onClick={() => void summary.refetch()}
          >
            Retry
          </Button>
        </div>
      )}
      <dl className="grid grid-cols-1 gap-3 @xs:grid-cols-2 @3xl:grid-cols-4 sm:gap-4">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} loading={summary.isPending} />
        ))}
      </dl>
    </section>
  );
}
