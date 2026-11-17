'use client';

import type { TodaySummary as TodaySummaryData } from '@rms/api-contract';
import { Armchair, CircleCheckBig, ClipboardList, WalletCards } from 'lucide-react';
import type { ComponentType, ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getApiErrorMessage } from '@/lib/api-error';
import { useTodaySummary } from '@/services/api/requests/dashboard';

type MetricCardProps = {
  label: string;
  value?: string;
  loading: boolean;
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
};

function MetricCard({ label, value, loading, icon: Icon }: MetricCardProps): ReactElement {
  return (
    <Card size="sm" aria-label={label}>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
        <CardAction>
          <Icon className="size-4 text-muted-foreground" aria-hidden />
        </CardAction>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div
            className="h-8 w-24 animate-pulse rounded bg-muted"
            aria-label={`Loading ${label}`}
          />
        ) : (
          <p className="text-2xl font-semibold tracking-tight tabular-nums">{value ?? '—'}</p>
        )}
      </CardContent>
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
  const metrics = [
    { label: 'Revenue', value: data ? formatRevenue(data) : undefined, icon: WalletCards },
    {
      label: 'Orders',
      value: data?.orders.toLocaleString(),
      icon: ClipboardList,
    },
    {
      label: 'Completed orders',
      value: data?.completedOrders.toLocaleString(),
      icon: CircleCheckBig,
    },
    {
      label: 'Active tables',
      value: data?.activeTables.toLocaleString(),
      icon: Armchair,
    },
  ];

  return (
    <section aria-labelledby="today-summary-heading">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 id="today-summary-heading" className="text-lg font-semibold tracking-tight">
            Today&apos;s summary
          </h1>
          <p className="text-xs text-muted-foreground">Updates automatically throughout the day</p>
        </div>
        {summary.isError && (
          <div className="flex items-center gap-2" role="alert">
            <span className="text-xs text-destructive">
              {getApiErrorMessage(summary.error, 'Unable to load the summary.')}
            </span>
            <Button size="sm" variant="outline" onClick={() => void summary.refetch()}>
              Retry
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} loading={summary.isPending} />
        ))}
      </div>
    </section>
  );
}
