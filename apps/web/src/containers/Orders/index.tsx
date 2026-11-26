'use client';

import type { OrderListQuery } from '@rms/api-contract';
import { Permission } from '@rms/permissions';
import { DEFAULT_PAGE_SIZE } from '@rms/shared';
import { X } from 'lucide-react';
import Link from 'next/link';
import { type ReactElement, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import usePermissionGuard from '@/hooks/auth/usePermissionGuard';
import usePermissions from '@/hooks/auth/usePermissions';
import useDebouncedValue from '@/hooks/useDebouncedValue';
import { useOrderList } from '@/services/api/requests/orders';
import { useCaptainOptions } from '@/services/api/requests/tables';

import { formatAmount, getOrderStatus, summariseItems } from '../CaptainDashboard/mappers';

type OrderStatus = NonNullable<OrderListQuery['status']>;

type Filters = {
  status: OrderStatus | '';
  from: string;
  to: string;
  captainId: string;
  table: string;
  page: number;
};

const EMPTY: Filters = { status: '', from: '', to: '', captainId: '', table: '', page: 1 };

const STATUS_OPTIONS: { value: OrderStatus | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'OPEN', label: 'Open' },
  { value: 'SUBMITTED', label: 'Sent to kitchen' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const TONE_CLASS = {
  neutral: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200',
  progress: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  sent: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
  ready: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
  done: 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300',
} as const;

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export default function Orders(): ReactElement | null {
  const isAllowed = usePermissionGuard([Permission.ORDER_READ]);
  const { can } = usePermissions();
  // Managers/owners can assign captains, so they see every order and get the captain filter.
  // Captains are scoped to their own tables by the API, so the filter is hidden for them.
  const seesAll = can(Permission.TABLE_ASSIGN_CAPTAIN);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const rangeInvalid = Boolean(filters.from && filters.to && filters.from > filters.to);
  const table = useDebouncedValue(filters.table.trim(), 300);

  const query: OrderListQuery = {
    page: filters.page,
    pageSize: DEFAULT_PAGE_SIZE,
    status: filters.status || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    captainId: seesAll ? filters.captainId || undefined : undefined,
    table: table || undefined,
  };
  const orders = useOrderList(query, isAllowed && !rangeInvalid);
  const captains = useCaptainOptions(seesAll);

  if (!isAllowed) return null;

  const set = (patch: Partial<Filters>): void => setFilters((f) => ({ ...f, page: 1, ...patch }));
  const rows = orders.data?.data ?? [];
  const meta = orders.data?.meta;
  const currency = orders.data?.currency ?? '';
  const dirty = JSON.stringify({ ...filters, page: 1 }) !== JSON.stringify(EMPTY);

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10 sm:py-14">
      <div className="mb-8 max-w-2xl">
        <p className="text-sm font-medium text-muted-foreground">Service flow</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Orders</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {seesAll ? 'Every order across the restaurant.' : 'Orders on the tables assigned to you.'}
        </p>
      </div>

      <form
        aria-label="Order filters"
        onSubmit={(event) => event.preventDefault()}
        className="mb-4 flex flex-wrap items-end gap-3"
      >
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          Status
          <NativeSelect
            aria-label="Filter by status"
            value={filters.status}
            onChange={(e) => set({ status: e.target.value as Filters['status'] })}
          >
            {STATUS_OPTIONS.map((o) => (
              <NativeSelectOption key={o.value} value={o.value}>
                {o.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          From
          <Input
            type="date"
            aria-label="Opened from"
            value={filters.from}
            max={filters.to || undefined}
            onChange={(e) => set({ from: e.target.value })}
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          To
          <Input
            type="date"
            aria-label="Opened to"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(e) => set({ to: e.target.value })}
          />
        </label>
        {seesAll && (
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Captain
            <NativeSelect
              aria-label="Filter by captain"
              value={filters.captainId}
              onChange={(e) => set({ captainId: e.target.value })}
            >
              <NativeSelectOption value="">All captains</NativeSelectOption>
              {(captains.data ?? []).map((c) => (
                <NativeSelectOption key={c.id} value={c.id}>
                  {c.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
        )}
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          Table
          <Input
            aria-label="Filter by table number"
            placeholder="e.g. 12"
            className="w-28"
            value={filters.table}
            onChange={(e) => set({ table: e.target.value })}
          />
        </label>
        {dirty && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setFilters(EMPTY)}>
            <X aria-hidden />
            Clear
          </Button>
        )}
      </form>
      {rangeInvalid && (
        <p role="alert" className="mb-3 text-sm text-destructive">
          “From” must be on or before “To”.
        </p>
      )}

      {orders.isError ? (
        <div className="space-y-3 rounded-md border px-4 py-6 text-center">
          <p role="alert" className="text-sm text-destructive">
            Unable to load orders.
          </p>
          <Button type="button" variant="outline" onClick={() => orders.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Table</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Items</TableHead>
                {seesAll && <TableHead>Captain</TableHead>}
                <TableHead>Opened</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Bill</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((order) => {
                const status = getOrderStatus(order);
                return (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/orders/tables/${order.table.id}`}
                        className="underline-offset-4 hover:underline"
                      >
                        Table {order.table.tableNumber}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge className={TONE_CLASS[status.tone]}>{status.label}</Badge>
                    </TableCell>
                    <TableCell className="max-w-64 truncate text-muted-foreground">
                      {order.itemCount} · {summariseItems(order)}
                    </TableCell>
                    {seesAll && <TableCell>{order.captain?.name ?? 'Unassigned'}</TableCell>}
                    <TableCell>{dateTime.format(new Date(order.openedAt))}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatAmount(order.total, currency)}
                    </TableCell>
                    <TableCell>{order.bill?.billNumber ?? '-'}</TableCell>
                  </TableRow>
                );
              })}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={seesAll ? 7 : 6}
                    className="py-10 text-center text-muted-foreground"
                  >
                    {orders.isPending
                      ? 'Loading orders...'
                      : dirty
                        ? 'No orders match these filters.'
                        : 'No orders yet.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {meta && meta.total > 0 && (
        <div className="mt-4 flex items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>
            {meta.total} {meta.total === 1 ? 'order' : 'orders'} · Page {meta.page} of{' '}
            {meta.totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={meta.page <= 1 || orders.isFetching}
              onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={meta.page >= meta.totalPages || orders.isFetching}
              onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
