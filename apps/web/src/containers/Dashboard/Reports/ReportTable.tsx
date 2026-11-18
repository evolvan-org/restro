import { cn } from 'cn';
import { Download, type LucideIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type ReportRow = readonly [string, string, string];

export type ReportTableData = {
  headers: ReportRow;
  rows: ReportRow[];
  total: ReportRow;
  filename: string;
};

type ReportTableProps = {
  id: string;
  title: string;
  icon: LucideIcon;
  iconClassName: string;
  data?: ReportTableData;
  error?: string;
  pendingMessage: string;
  onRetry: () => void;
};

function downloadCsv({ headers, rows, total, filename }: ReportTableData): void {
  const csv = [headers, ...rows, total]
    .map((row) =>
      row
        .map((cell) => (/[",\r\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell))
        .join(','),
    )
    .join('\r\n');
  const url = URL.createObjectURL(new Blob([`${csv}\r\n`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ReportTable({
  id,
  title,
  icon: Icon,
  iconClassName,
  data,
  error,
  pendingMessage,
  onRetry,
}: ReportTableProps): ReactElement {
  const hasRows = Boolean(data?.rows.length);

  return (
    <Card
      role="region"
      aria-labelledby={id}
      className="min-w-0 gap-0 rounded-2xl border border-border py-0 shadow-none ring-0 sm:rounded-3xl"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn('grid size-9 shrink-0 place-items-center rounded-full', iconClassName)}
            aria-hidden
          >
            <Icon className="size-4" />
          </span>
          <h3 id={id} className="text-base font-semibold tracking-tight">
            {title}
          </h3>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 rounded-lg shadow-none"
          aria-label={`Download ${title} CSV`}
          disabled={!hasRows || Boolean(error)}
          onClick={() => {
            if (data) downloadCsv(data);
          }}
        >
          <Download aria-hidden />{' '}
          <span>
            <span className="hidden min-[380px]:inline">Download </span>CSV
          </span>
        </Button>
      </div>
      {error && (
        <div
          className="mx-4 mb-4 flex items-center justify-between gap-3 rounded-xl border border-destructive/20 px-3 py-2 sm:mx-5"
          role="alert"
        >
          <p className="text-sm text-destructive">{error}</p>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </div>
      )}
      {!error && !hasRows && (
        <p
          className="mx-4 mb-4 grid min-h-24 place-items-center rounded-xl border border-dashed px-4 text-center text-sm text-muted-foreground sm:mx-5"
          role="status"
        >
          {data ? 'No paid bills in this date range.' : pendingMessage}
        </p>
      )}
      {!error && data && hasRows && (
        <>
          <div className="mx-4 mb-4 rounded-xl bg-muted/65 px-3.5 py-3 sm:mx-5 sm:px-4">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">Range totals</p>
            <dl className="grid grid-cols-2 divide-x divide-border">
              <div className="min-w-0 pr-3">
                <dt className="text-xs text-muted-foreground">{data.headers[1]}</dt>
                <dd className="mt-0.5 text-lg leading-tight font-semibold tracking-tight tabular-nums [overflow-wrap:anywhere] sm:text-2xl">
                  {data.total[1]}
                </dd>
              </div>
              <div className="min-w-0 pl-3 sm:pl-4">
                <dt className="text-xs text-muted-foreground">{data.headers[2]}</dt>
                <dd className="mt-0.5 text-lg leading-tight font-semibold tracking-tight tabular-nums [overflow-wrap:anywhere] sm:text-2xl">
                  {data.total[2]}
                </dd>
              </div>
            </dl>
          </div>
          <Table aria-labelledby={id}>
            <TableHeader className="bg-muted/45 [&_th]:h-auto [&_th]:py-2.5 [&_th]:text-xs [&_th]:whitespace-normal [&_th]:text-muted-foreground">
              <TableRow className="hover:bg-transparent">
                <TableHead scope="col" className="pl-4 sm:pl-5">
                  {data.headers[0]}
                </TableHead>
                <TableHead scope="col" className="text-right">
                  {data.headers[1]}
                </TableHead>
                <TableHead scope="col" className="pr-4 text-right sm:pr-5">
                  {data.headers[2]}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map(([date, first, second]) => (
                <TableRow key={date}>
                  <TableHead
                    scope="row"
                    className="h-auto py-3 pl-4 font-normal tabular-nums sm:pl-5"
                  >
                    <time dateTime={date}>{date}</time>
                  </TableHead>
                  <TableCell className="text-right tabular-nums">{first}</TableCell>
                  <TableCell className="pr-4 text-right tabular-nums sm:pr-5">{second}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </Card>
  );
}
