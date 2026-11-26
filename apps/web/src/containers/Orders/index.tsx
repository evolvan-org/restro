'use client';

import type { OrderListQuery } from '@rms/api-contract';
import { Permission } from '@rms/permissions';
import { DEFAULT_PAGE_SIZE } from '@rms/shared';
import { cn } from 'cn';
import { X } from 'lucide-react';
import Link from 'next/link';
import type { ReactElement } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
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
import {
  formatAmount,
  getOrderStatus,
  ORDER_TONE_CLASS,
  summariseItems,
} from '@/containers/CaptainDashboard/mappers';
import usePermissionGuard from '@/hooks/auth/usePermissionGuard';
import usePermissions from '@/hooks/auth/usePermissions';
import useDebouncedValue from '@/hooks/useDebouncedValue';
import { useOrderList } from '@/services/api/requests/orders';
import { useCaptainOptions } from '@/services/api/requests/tables';

const TABLE_SEARCH_DEBOUNCE_MS = 300;

type OrderStatusFilter = NonNullable<OrderListQuery['status']>;

type OrderFilters = {
  status: OrderStatusFilter | '';
  from: string;
  to: string;
  captainId: string;
  tableNumber: string;
  page: number;
};

const DEFAULT_FILTERS: OrderFilters = {
  status: '',
  from: '',
  to: '',
  captainId: '',
  tableNumber: '',
  page: 1,
};

const STATUS_FILTERS: { value: OrderStatusFilter | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'OPEN', label: 'Open' },
  { value: 'SUBMITTED', label: 'Sent to kitchen' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const labelClassName = 'text-xs leading-4 text-muted-foreground';

function formatOpenedAt(iso: string, timeZone: string): string {
  const options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  };
  try {
    return new Intl.DateTimeFormat(undefined, { ...options, timeZone }).format(new Date(iso));
  } catch {
    // An unrecognised zone must not blank the row; fall back to the browser's zone.
    return new Intl.DateTimeFormat(undefined, options).format(new Date(iso));
  }
}

export default function Orders(): ReactElement | null {
  const isAllowed = usePermissionGuard([Permission.ORDER_READ]);
  const { can } = usePermissions();
  // Captain assigners (and the owner) see every order; captains only their own tables.
  const canSeeAll = can(Permission.TABLE_ASSIGN_CAPTAIN);
  const canList = canSeeAll || can(Permission.TABLE_BE_CAPTAIN);

  const filters = useForm<OrderFilters>({ defaultValues: DEFAULT_FILTERS });
  const {
    status = '',
    from = '',
    to = '',
    captainId = '',
    tableNumber = '',
    page = 1,
  } = useWatch({ control: filters.control });
  const debouncedTable = useDebouncedValue(tableNumber.trim(), TABLE_SEARCH_DEBOUNCE_MS);
  const rangeInvalid = Boolean(from && to && from > to);

  const orders = useOrderList(
    {
      page,
      pageSize: DEFAULT_PAGE_SIZE,
      ...(status && { status }),
      ...(from && { from }),
      ...(to && { to }),
      ...(canSeeAll && captainId && { captainId }),
      ...(debouncedTable && { tableNumber: debouncedTable }),
    },
    isAllowed && canList && !rangeInvalid,
  );
  const captains = useCaptainOptions(isAllowed && canSeeAll);

  // The guard redirects users without `order:read`; render nothing until allowed.
  if (!isAllowed) {
    return null;
  }

  const resetPage = { onChange: () => filters.setValue('page', 1) };
  const meta = orders.data?.meta;
  const rows = orders.data?.data ?? [];
  const hasFilters = Boolean(status || from || to || captainId || debouncedTable);
  const columnCount = canSeeAll ? 7 : 6;

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10 sm:py-14">
      <div className="mb-8 max-w-2xl">
        <p className="text-sm font-medium text-muted-foreground">Service flow</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Orders</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {canSeeAll
            ? 'Every order across the restaurant.'
            : 'Orders on the tables assigned to you.'}
        </p>
      </div>

      {!canList ? (
        <p role="alert" className="rounded-md border px-4 py-6 text-center text-sm">
          You don&apos;t have access to the order list.
        </p>
      ) : (
        <>
          <form
            aria-label="Order filters"
            onSubmit={(event) => event.preventDefault()}
            className="mb-4 flex flex-wrap items-start gap-3"
          >
            <Field className="w-auto gap-1.5">
              <FieldLabel htmlFor="orders-status" className={labelClassName}>
                Status
              </FieldLabel>
              <NativeSelect
                id="orders-status"
                className="min-w-40"
                {...filters.register('status', resetPage)}
              >
                {STATUS_FILTERS.map((filter) => (
                  <NativeSelectOption key={filter.value} value={filter.value}>
                    {filter.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field className="w-auto gap-1.5">
              <FieldLabel htmlFor="orders-from" className={labelClassName}>
                From
              </FieldLabel>
              <Input
                id="orders-from"
                type="date"
                max={to || undefined}
                {...filters.register('from', resetPage)}
              />
            </Field>
            <Field className="w-auto gap-1.5" data-invalid={rangeInvalid || undefined}>
              <FieldLabel htmlFor="orders-to" className={labelClassName}>
                To
              </FieldLabel>
              <Input
                id="orders-to"
                type="date"
                min={from || undefined}
                aria-invalid={rangeInvalid || undefined}
                aria-describedby={rangeInvalid ? 'orders-to-error' : undefined}
                {...filters.register('to', resetPage)}
              />
              {rangeInvalid && (
                <FieldError id="orders-to-error" className="max-w-48 text-xs">
                  End date must be on or after the start date
                </FieldError>
              )}
            </Field>
            {canSeeAll && (
              <Field className="w-auto gap-1.5">
                <FieldLabel htmlFor="orders-captain" className={labelClassName}>
                  Captain
                </FieldLabel>
                <NativeSelect
                  id="orders-captain"
                  className="min-w-40"
                  {...filters.register('captainId', resetPage)}
                >
                  <NativeSelectOption value="">All captains</NativeSelectOption>
                  {(captains.data ?? []).map((captain) => (
                    <NativeSelectOption key={captain.id} value={captain.id}>
                      {captain.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            )}
            <Field className="w-auto gap-1.5">
              <FieldLabel htmlFor="orders-table" className={labelClassName}>
                Table
              </FieldLabel>
              <Input
                id="orders-table"
                className="w-28"
                placeholder="e.g. 12"
                maxLength={20}
                {...filters.register('tableNumber', resetPage)}
              />
            </Field>
            <Button
              type="button"
              variant="ghost"
              className="mt-5.5 text-muted-foreground"
              disabled={!hasFilters && !tableNumber}
              onClick={() => filters.reset(DEFAULT_FILTERS)}
            >
              <X aria-hidden />
              Clear
            </Button>
          </form>

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
                    {canSeeAll && <TableHead>Captain</TableHead>}
                    <TableHead>Opened</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Bill</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.data &&
                    rows.map((order) => {
                      const orderStatus = getOrderStatus(order);
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
                            <Badge
                              variant="outline"
                              className={cn(
                                'rounded-full border-transparent',
                                ORDER_TONE_CLASS[orderStatus.tone],
                              )}
                            >
                              {orderStatus.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-72 truncate text-muted-foreground">
                            {summariseItems(order)}
                          </TableCell>
                          {canSeeAll && (
                            <TableCell className={cn(!order.captain && 'text-muted-foreground')}>
                              {order.captain?.name ?? 'Unassigned'}
                            </TableCell>
                          )}
                          <TableCell className="whitespace-nowrap">
                            {formatOpenedAt(order.openedAt, orders.data.timezone)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatAmount(order.total, orders.data.currency)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {order.bill?.billNumber ?? '—'}
                          </TableCell>
                        </TableRow>
                      );
                    })}

                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={columnCount}
                        className="py-10 text-center text-muted-foreground"
                      >
                        {rangeInvalid
                          ? 'Fix the date range to see orders.'
                          : orders.isPending
                            ? 'Loading orders…'
                            : hasFilters
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
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
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
                  onClick={() => filters.setValue('page', page - 1)}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={meta.page >= meta.totalPages || orders.isFetching}
                  onClick={() => filters.setValue('page', page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
