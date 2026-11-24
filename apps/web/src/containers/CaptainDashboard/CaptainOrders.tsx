'use client';

import type {
  CaptainOrderListResponse,
  CaptainOrderSummary,
  CaptainOrderView,
} from '@rms/api-contract';
import type { UseQueryResult } from '@tanstack/react-query';
import { cn } from 'cn';
import { ClipboardList } from 'lucide-react';
import Link from 'next/link';
import type { ReactElement } from 'react';

import { getApiErrorMessage } from '@/lib/api-error';

import { FloorError, StateShell } from '../FloorBoard/FloorBoardStates';
import {
  describeOrderTime,
  formatAmount,
  getOrderStatus,
  type OrderTone,
  summariseItems,
} from './mappers';

const TONE_CLASS: Record<OrderTone, string> = {
  neutral: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200',
  progress: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  sent: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
  ready: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
  done: 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300',
};

type CaptainOrdersProps = {
  view: CaptainOrderView;
  onViewChange: (view: CaptainOrderView) => void;
  orders: UseQueryResult<CaptainOrderListResponse>;
  /** Latest counts for the toggle labels, whichever view is loaded. */
  openCount: number | undefined;
  closedCount: number | undefined;
  nowMs: number;
  canViewOrder: boolean;
};

function OrderCard({
  order,
  currency,
  nowMs,
  href,
}: {
  order: CaptainOrderSummary;
  currency: string;
  nowMs: number;
  href: string | null;
}): ReactElement {
  const status = getOrderStatus(order);
  const body = (
    <>
      <div className="flex items-center gap-2.5">
        <span className="text-xl font-bold md:text-[22px]">{order.table.tableNumber}</span>
        {order.bill && (
          <span className="truncate text-[13px] text-muted-foreground">
            Bill {order.bill.billNumber}
          </span>
        )}
        <span
          className={cn(
            'ml-auto shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold',
            TONE_CLASS[status.tone],
          )}
        >
          {status.label}
        </span>
      </div>
      <p className="mt-2 text-sm text-neutral-700 md:mt-2.5 dark:text-neutral-300">
        {summariseItems(order)}
      </p>
      <div className="mt-3 flex items-center text-[13px] text-muted-foreground md:mt-3.5">
        <span className="tabular-nums">{describeOrderTime(order, nowMs)}</span>
        <span className="ml-auto text-base font-bold text-foreground tabular-nums md:text-[17px]">
          {formatAmount(order.total, currency)}
        </span>
      </div>
    </>
  );
  const cardClass = 'block rounded-xl border bg-card p-3.5 md:p-4';

  return href ? (
    <Link
      href={href}
      className={cn(
        cardClass,
        'transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
      aria-label={`Table ${order.table.tableNumber}, ${status.label}. Open order`}
    >
      {body}
    </Link>
  ) : (
    <div className={cardClass}>{body}</div>
  );
}

function ViewToggle({
  view,
  onChange,
  openCount,
  closedCount,
}: {
  view: CaptainOrderView;
  onChange: (view: CaptainOrderView) => void;
  openCount: number | undefined;
  closedCount: number | undefined;
}): ReactElement {
  const options: { value: CaptainOrderView; label: string; count: number | undefined }[] = [
    { value: 'open', label: 'Open', count: openCount },
    { value: 'closed', label: 'Closed', count: closedCount },
  ];
  return (
    <div
      role="group"
      aria-label="Order status"
      className="flex gap-1 rounded-[10px] bg-muted p-1 md:inline-flex"
    >
      {options.map((option) => {
        const active = view === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'h-11 flex-1 rounded-[7px] px-5 text-sm font-semibold transition-colors md:flex-none',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
            {option.count !== undefined && ` · ${option.count}`}
          </button>
        );
      })}
    </div>
  );
}

/** The captain's own orders (scoped by the API): open by default, today's closed on toggle. */
export default function CaptainOrders(props: CaptainOrdersProps): ReactElement {
  const { orders, view } = props;
  const rows = orders.data?.data ?? [];

  const renderBody = (): ReactElement => {
    if (orders.isError && rows.length === 0) {
      return (
        <FloorError
          message={getApiErrorMessage(orders.error, 'Unable to load your orders.')}
          onRetry={() => void orders.refetch()}
        />
      );
    }
    if (orders.isPending) {
      return (
        <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-[118px] animate-pulse rounded-xl bg-neutral-100 dark:bg-neutral-800"
            />
          ))}
        </div>
      );
    }
    if (rows.length === 0) {
      return (
        <StateShell
          icon={<ClipboardList className="size-6" aria-hidden />}
          title={view === 'open' ? 'No open orders' : 'No closed orders today'}
          description={
            view === 'open'
              ? 'Orders on your tables appear here as soon as they are opened.'
              : 'Orders on your tables appear here once they are paid.'
          }
        />
      );
    }
    return (
      <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            currency={orders.data?.currency ?? 'INR'}
            nowMs={props.nowMs}
            href={props.canViewOrder && view === 'open' ? `/orders/tables/${order.table.id}` : null}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-3.5 md:space-y-4">
      <div className="flex flex-col gap-3.5 md:flex-row md:items-center md:gap-4">
        <ViewToggle
          view={view}
          onChange={props.onViewChange}
          openCount={props.openCount}
          closedCount={props.closedCount}
        />
        {view === 'closed' && (
          <p className="text-xs text-muted-foreground md:text-[13px]">
            Today&apos;s closed orders for your tables
          </p>
        )}
      </div>
      {renderBody()}
    </div>
  );
}
