'use client';

import type { CaptainOrderView } from '@rms/api-contract';
import { Permission } from '@rms/permissions';
import { cn } from 'cn';
import { LayoutGrid, type LucideIcon, ReceiptText, TriangleAlert } from 'lucide-react';
import { type ReactElement, useEffect, useState } from 'react';

import { buildStatusColorMap } from '@/components/FloorTile';
import usePermissions from '@/hooks/auth/usePermissions';
import { useCaptainOrders } from '@/services/api/requests/orders';
import { useTableBoard, useTableOptions } from '@/services/api/requests/tables';

import type { TilePermissions } from '../FloorBoard/FloorSection';
import CaptainAttention from './CaptainAttention';
import CaptainFloor from './CaptainFloor';
import CaptainOrders from './CaptainOrders';
import { buildCaptainEvents, CAPTAIN_TABS, type CaptainTab } from './mappers';

const TIMER_TICK_MS = 60_000;
const TAB_ID_BASE = 'captain-tab';

const TAB_ICONS: Record<CaptainTab, LucideIcon> = {
  floor: LayoutGrid,
  orders: ReceiptText,
  attention: TriangleAlert,
};

const tabId = (tab: CaptainTab): string => `${TAB_ID_BASE}-${tab}`;
const panelId = (tab: CaptainTab): string => `${TAB_ID_BASE}-panel-${tab}`;

function Badge({ value, tone }: { value: number; tone: 'alert' | 'count' }): ReactElement {
  return (
    <span
      className={cn(
        'grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-xs font-bold tabular-nums',
        tone === 'alert'
          ? 'bg-red-600 text-white'
          : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200',
      )}
    >
      {value}
    </span>
  );
}

/**
 * Captain-only dashboard (shown to roles holding the `table:be-captain` eligibility marker): the
 * captain's own tables, orders and attention events. Every list is scoped by the API to tables the
 * caller is assigned to. Phones get a bottom nav; tablet and desktop get tabs.
 */
export default function CaptainDashboard(): ReactElement {
  const { can } = usePermissions();
  const canReadFloor = can(Permission.FLOOR_READ);
  const canViewOrder = can(Permission.ORDER_READ);
  const permissions: TilePermissions = {
    canReserve: can(Permission.RESERVATION_WRITE),
    canEditReservation: can(Permission.RESERVATION_WRITE),
    canViewOrder,
    canStartOrder: can(Permission.ORDER_WRITE),
    canReadBill: can(Permission.BILL_READ),
    canAssignCaptain: can(Permission.TABLE_ASSIGN_CAPTAIN),
    canTransitionStatus: can(Permission.TABLE_UPDATE_STATUS),
  };

  const [tab, setTab] = useState<CaptainTab>('floor');
  const [orderView, setOrderView] = useState<CaptainOrderView>('open');
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), TIMER_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const options = useTableOptions(canReadFloor);
  const tables = useTableBoard(canReadFloor);
  // Open orders always load: they feed the Orders count even while another tab is showing.
  const openOrders = useCaptainOrders('open', canViewOrder);
  const closedOrders = useCaptainOrders('closed', canViewOrder && orderView === 'closed');

  useEffect(() => {
    if (!tables.isFetching) setNowMs(Date.now());
  }, [tables.isFetching]);

  const rows = tables.data?.data ?? [];
  const statuses = options.data?.statuses ?? [];
  const events = buildCaptainEvents(rows, nowMs);
  const latestCounts =
    orderView === 'closed' && closedOrders.data ? closedOrders.data : openOrders.data;
  const openCount = latestCounts?.openCount;
  const closedCount = latestCounts?.closedCount;

  const badgeFor = (value: CaptainTab, tone: 'tabs' | 'nav'): ReactElement | null => {
    if (value === 'attention') return <Badge value={events.length} tone="alert" />;
    if (value === 'orders' && tone === 'tabs' && openCount !== undefined) {
      return <Badge value={openCount} tone="count" />;
    }
    return null;
  };

  const renderPanel = (): ReactElement => {
    if (tab === 'orders') {
      if (!canViewOrder) return <NoAccess what="orders" />;
      return (
        <CaptainOrders
          view={orderView}
          onViewChange={setOrderView}
          orders={orderView === 'open' ? openOrders : closedOrders}
          openCount={openCount}
          closedCount={closedCount}
          nowMs={nowMs}
          canViewOrder={canViewOrder}
        />
      );
    }
    if (!canReadFloor) return <NoAccess what="your tables" />;
    if (tab === 'attention') {
      return (
        <CaptainAttention
          events={events}
          permissions={{
            canViewOrder,
            canTransitionStatus: permissions.canTransitionStatus,
            canReadReservations: can(Permission.RESERVATION_READ),
          }}
        />
      );
    }
    return (
      <CaptainFloor
        tables={rows}
        sections={options.data?.sections ?? []}
        statuses={statuses}
        colorMap={buildStatusColorMap(statuses)}
        nowMs={nowMs}
        permissions={permissions}
        isPending={tables.isPending || options.isPending}
        error={tables.error}
        onRetry={() => void tables.refetch()}
      />
    );
  };

  return (
    <div className="flex min-h-[calc(100svh-3.5rem)] flex-col bg-background">
      {/* Tablet and desktop: tabs at the top of the content area. */}
      <div
        role="tablist"
        aria-label="Captain dashboard"
        className="hidden gap-1 border-b px-8 md:flex"
      >
        {CAPTAIN_TABS.map(({ value, label }) => {
          const active = tab === value;
          return (
            <button
              key={value}
              id={tabId(value)}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={panelId(value)}
              onClick={() => setTab(value)}
              className={cn(
                '-mb-px flex h-[52px] items-center gap-2 border-b-[3px] px-[18px] text-[15px] font-semibold transition-colors',
                active
                  ? 'border-neutral-900 text-foreground dark:border-neutral-100'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
              {badgeFor(value, 'tabs')}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={panelId(tab)}
        aria-labelledby={tabId(tab)}
        className="flex-1 px-4 pt-3 pb-[calc(6rem+env(safe-area-inset-bottom))] md:px-8 md:pt-5 md:pb-8"
      >
        {renderPanel()}
      </div>

      {/* Phones: fixed bottom navigation, rendered only on the dashboard. */}
      <nav
        aria-label="Captain navigation"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-background px-2 pt-1.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] md:hidden"
      >
        {CAPTAIN_TABS.map(({ value, label }) => {
          const active = tab === value;
          const Icon = TAB_ICONS[value];
          return (
            <button
              key={value}
              type="button"
              aria-current={active ? 'page' : undefined}
              aria-controls={panelId(value)}
              onClick={() => setTab(value)}
              className={cn(
                'relative flex h-14 flex-1 flex-col items-center justify-center gap-[3px] rounded-[10px] text-xs font-semibold',
                active ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              <span
                className={cn(
                  'grid h-7 w-12 place-items-center rounded-full',
                  active && 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900',
                )}
              >
                <Icon className="size-5" aria-hidden />
              </span>
              {label}
              {value === 'attention' && (
                <span className="absolute top-0.5 left-[calc(50%+10px)] grid h-[18px] min-w-[18px] place-items-center rounded-full border-2 border-background bg-red-600 px-1 text-[11px] font-bold text-white">
                  {events.length}
                  <span className="sr-only"> events</span>
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function NoAccess({ what }: { what: string }): ReactElement {
  return (
    <p className="py-10 text-center text-sm text-muted-foreground">
      You don&apos;t have access to {what}.
    </p>
  );
}
