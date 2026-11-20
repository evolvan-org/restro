import type { DailySalesReport, GstReport, ReportDateRange } from '@rms/api-contract';
import { CalendarDays, ReceiptText, TrendingUp } from 'lucide-react';
import { type ReactElement, useState } from 'react';

import { getApiErrorMessage } from '@/lib/api-error';
import { useDailySalesReport, useGstReport } from '@/services/api/requests/reports';

import ReportDateRangeForm from './ReportDateRangeForm';
import ReportTable, { type ReportTableData } from './ReportTable';

const dateRangeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeZone: 'UTC',
});

function formatDateRange({ from, to }: ReportDateRange): string {
  return dateRangeFormatter.formatRange(new Date(`${from}T00:00:00Z`), new Date(`${to}T00:00:00Z`));
}

function salesTable({ currency, range, rows, total }: DailySalesReport): ReportTableData {
  return {
    headers: ['Date', `Revenue (${currency})`, 'Orders'],
    rows: rows.map(({ date, revenue, orders }) => [date, revenue, String(orders)]),
    total: ['Total', total.revenue, String(total.orders)],
    filename: `daily-sales_${range.from}_to_${range.to}.csv`,
  };
}

function gstTable({ currency, range, rows, total }: GstReport): ReportTableData {
  return {
    headers: ['Date', `Taxable Value (${currency})`, `GST Collected (${currency})`],
    rows: rows.map(({ date, taxableValue, gstCollected }) => [date, taxableValue, gstCollected]),
    total: ['Total', total.taxableValue, total.gstCollected],
    filename: `gst-report_${range.from}_to_${range.to}.csv`,
  };
}

export default function Reports(): ReactElement {
  // Keep the applied range apart from form edits so both queries change only on submit.
  const [selectedRange, setSelectedRange] = useState<ReportDateRange>();
  const sales = useDailySalesReport(selectedRange);
  const range = selectedRange ?? sales.data?.range;
  const gst = useGstReport(range);

  function applyRange(nextRange: ReportDateRange): void {
    if (nextRange.from === range?.from && nextRange.to === range.to) return;
    setSelectedRange(nextRange);
  }

  return (
    <section aria-labelledby="reports-heading" className="@container space-y-4">
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 @4xl:flex-row @4xl:items-center @4xl:justify-between sm:rounded-3xl sm:px-5">
        <div className="min-w-0 space-y-1">
          <h2 id="reports-heading" className="text-lg font-semibold tracking-tight sm:text-xl">
            Sales &amp; GST reports
          </h2>
          <p className="flex items-start gap-2 text-sm text-muted-foreground" role="status">
            {range && (
              <>
                <CalendarDays className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  <span className="font-medium text-card-foreground">{formatDateRange(range)}</span>{' '}
                  · Restaurant local dates
                </span>
              </>
            )}
          </p>
        </div>
        <ReportDateRangeForm range={range} onApply={applyRange} />
      </div>
      <div className="grid items-start gap-4 @4xl:grid-cols-2">
        <ReportTable
          id="daily-sales-heading"
          title="Daily Sales"
          icon={TrendingUp}
          iconClassName="bg-emerald-100/80 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
          data={sales.data && salesTable(sales.data)}
          error={
            sales.isError
              ? getApiErrorMessage(sales.error, 'Unable to load Daily Sales.')
              : undefined
          }
          pendingMessage="Loading Daily Sales…"
          onRetry={() => void sales.refetch()}
        />
        <ReportTable
          id="gst-report-heading"
          title="GST report"
          icon={ReceiptText}
          iconClassName="bg-indigo-100/80 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
          data={gst.data && gstTable(gst.data)}
          error={
            gst.isError
              ? getApiErrorMessage(gst.error, 'Unable to load the GST report.')
              : undefined
          }
          pendingMessage={
            !range && sales.isError
              ? 'Choose a date range to load the GST report.'
              : 'Loading GST report…'
          }
          onRetry={() => void gst.refetch()}
        />
      </div>
    </section>
  );
}
