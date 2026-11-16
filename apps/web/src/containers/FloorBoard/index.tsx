'use client';

import type { RestaurantTable } from '@rms/api-contract';
import { Permission } from '@rms/permissions';
import { MAX_PAGE_SIZE } from '@rms/shared';
import { type ReactElement, useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { buildStatusColorMap } from '@/components/FloorTile';
import { getTableAttention } from '@/components/FloorTile/attention';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import usePermissionGuard from '@/hooks/auth/usePermissionGuard';
import usePermissions from '@/hooks/auth/usePermissions';
import { getApiErrorMessage } from '@/lib/api-error';
import { useReservations } from '@/services/api/requests/reservations';
import { useTableBoard, useTableOptions } from '@/services/api/requests/tables';
import { useShowWalkInFormSidePane } from '@/store/hooks/sidepane';

import AttentionRail, { type AttentionEntry } from './AttentionRail';
import {
  FloorEmpty,
  FloorError,
  FloorLoading,
  FloorNoMatch,
  ReconnectingBanner,
} from './FloorBoardStates';
import FloorHeader from './FloorHeader';
import FloorSection, { type TilePermissions } from './FloorSection';
import { type FloorBoardFilters, getFloorBoardFilterDefaults } from './mapper';
import SectionTabs from './SectionTabs';
import StatusFilterChips from './StatusFilterChips';

const TIMER_TICK_MS = 60_000;
const UP_NEXT_WINDOW_MS = 2 * 60 * 60 * 1000;
const STALE_AFTER_MS = 60_000;

function formatAgo(ms: number): string {
  if (ms < 10_000) return 'updated just now';
  if (ms < STALE_AFTER_MS) return `updated ${Math.round(ms / 1000)}s ago`;
  return `updated ${Math.round(ms / 60_000)} min ago`;
}

export default function FloorBoard(): ReactElement | null {
  const isAllowed = usePermissionGuard([Permission.RESTAURANT_READ]);
  const { can } = usePermissions();
  const canRead = can(Permission.RESTAURANT_READ);
  const canReadReservations = can(Permission.RESERVATION_READ);
  const permissions: TilePermissions = {
    canReserve: can(Permission.RESERVATION_WRITE),
    canEditReservation: can(Permission.RESERVATION_WRITE),
    canViewOrder: can(Permission.ORDER_READ),
    canStartOrder: can(Permission.ORDER_WRITE),
    canReadBill: can(Permission.BILL_READ),
    canAssignCaptain: can(Permission.TABLE_ASSIGN_CAPTAIN),
    canTransitionStatus: can(Permission.TABLE_UPDATE_STATUS),
  };

  const { control, register, setValue, reset } = useForm<FloorBoardFilters>({
    defaultValues: getFloorBoardFilterDefaults(),
  });
  const sectionId = useWatch({ control, name: 'sectionId' });
  const statusCode = useWatch({ control, name: 'statusCode' });
  const search = useWatch({ control, name: 'search' });
  const [railOpen, setRailOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), TIMER_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const options = useTableOptions(canRead);
  // One complete snapshot keeps local filters, chip counts, and covers consistent.
  const tables = useTableBoard(canRead);

  useEffect(() => {
    if (!tables.isFetching) setNowMs(Date.now());
  }, [tables.isFetching]);

  // "Up next" window; bucket to the minute so the query key is stable between ticks.
  const minuteBucket = Math.floor(nowMs / 60_000);
  const upNextWindow = useMemo(() => {
    const from = new Date(minuteBucket * 60_000);
    return {
      from: from.toISOString(),
      to: new Date(from.getTime() + UP_NEXT_WINDOW_MS).toISOString(),
    };
  }, [minuteBucket]);
  const upcoming = useReservations(
    {
      page: 1,
      pageSize: MAX_PAGE_SIZE,
      status: 'BOOKED',
      sortDirection: 'asc',
      from: upNextWindow.from,
      to: upNextWindow.to,
    },
    canRead && canReadReservations,
  );

  const showWalkInForm = useShowWalkInFormSidePane();

  if (!isAllowed) return null;

  const sections = options.data?.sections ?? [];
  const statuses = options.data?.statuses ?? [];
  const rows = tables.data?.data ?? [];
  const colorMap = buildStatusColorMap(statuses);
  const hasFilters = Boolean(sectionId || statusCode || search.trim());

  // Derived, unfiltered-list metrics.
  const counts: Record<string, number> = {};
  for (const status of statuses) {
    counts[status.code] = rows.filter((t) => t.currentStatus.code === status.code).length;
  }
  const occupiedCovers = rows
    .filter((t) => t.currentStatus.code === 'OCCUPIED')
    .reduce((sum, t) => sum + (t.activeReservation?.partySize ?? 0), 0);
  const totalCapacity = rows.reduce((sum, t) => sum + t.capacity, 0);

  const sectionsWithCounts = sections
    .map((s) => ({
      id: s.id,
      name: s.name,
      count: rows.filter((t) => t.section.id === s.id).length,
    }))
    .filter((s) => s.count > 0);

  const matchesSearch = (table: RestaurantTable): boolean =>
    !search.trim() || table.tableNumber.toLowerCase().includes(search.trim().toLowerCase());

  const searched = rows.filter(matchesSearch);
  const afterSection = sectionId ? searched.filter((t) => t.section.id === sectionId) : searched;
  const afterStatus = statusCode
    ? afterSection.filter((t) => t.currentStatus.code === statusCode)
    : afterSection;
  const visibleCount = afterStatus.length;

  const statusName = statuses.find((s) => s.code === statusCode)?.name ?? '';
  const sectionName = sections.find((s) => s.id === sectionId)?.name ?? '';

  // Attention + up-next feeds for the rail.
  const attention: AttentionEntry[] = rows
    .map((table) => {
      const level = getTableAttention(table, nowMs);
      return level ? { table, level } : null;
    })
    .filter((entry): entry is AttentionEntry => entry !== null);
  const upNext = [...(upcoming.data?.data ?? [])].sort(
    (a, b) => new Date(a.reservationAt).getTime() - new Date(b.reservationAt).getTime(),
  );

  const age = tables.dataUpdatedAt ? nowMs - tables.dataUpdatedAt : 0;
  const isReconnecting =
    (tables.isError && rows.length > 0) || (tables.dataUpdatedAt > 0 && age > STALE_AFTER_MS);

  const onSeatWalkIn = (): void => {
    showWalkInForm();
  };

  const clearFilters = (): void => {
    reset(getFloorBoardFilterDefaults());
  };

  const noMatchMessage = [
    statusName && `${statusName}`,
    'tables',
    sectionName && `in ${sectionName}`,
    search.trim() && `matching “${search.trim()}”`,
  ]
    .filter(Boolean)
    .join(' ');

  const rail = (
    <AttentionRail
      attention={attention}
      upNext={upNext}
      upNextTotal={upcoming.data?.meta.total ?? 0}
      nowMs={nowMs}
      canViewOrder={permissions.canViewOrder}
      canTransitionStatus={permissions.canTransitionStatus}
      canEditReservation={permissions.canEditReservation}
      canReadReservations={canReadReservations}
    />
  );

  const renderBody = (): ReactElement => {
    if (tables.isError && rows.length === 0) {
      return (
        <FloorError
          message={getApiErrorMessage(tables.error, 'Unable to load the floor board.')}
          onRetry={() => void tables.refetch()}
        />
      );
    }
    if (tables.isPending) return <FloorLoading />;
    if (rows.length === 0) return <FloorEmpty />;
    if (visibleCount === 0) {
      return <FloorNoMatch message={`No ${noMatchMessage} right now.`} onClear={clearFilters} />;
    }
    return (
      <div className="space-y-6">
        {sectionsWithCounts
          .filter((s) => !sectionId || s.id === sectionId)
          .map((s) => (
            <FloorSection
              key={s.id}
              name={s.name}
              tables={searched.filter((t) => t.section.id === s.id)}
              statusFilterCode={statusCode}
              statusFilterName={statusName}
              colorMap={colorMap}
              nowMs={nowMs}
              statuses={statuses}
              permissions={permissions}
              onWalkInClick={(table) =>
                showWalkInForm({
                  id: table.id,
                  tableNumber: table.tableNumber,
                  capacity: table.capacity,
                })
              }
            />
          ))}
        <p className="hidden text-sm text-muted-foreground xl:block">
          Showing {visibleCount} of {rows.length} tables
        </p>
      </div>
    );
  };

  return (
    <div className="flex h-[calc(100svh-3.5rem)] overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="shrink-0 border-b">
          <FloorHeader
            updatedLabel={formatAgo(age)}
            isReconnecting={isReconnecting}
            searchField={register('search')}
            onSeatWalkIn={onSeatWalkIn}
            canReserve={permissions.canReserve}
            attentionCount={attention.length}
            onOpenAttention={() => setRailOpen(true)}
          />
          {statuses.length > 0 && (
            <StatusFilterChips
              statuses={statuses}
              colorMap={colorMap}
              counts={counts}
              total={rows.length}
              activeCode={statusCode}
              onChange={(code) => setValue('statusCode', code)}
              onClear={() => setValue('statusCode', '')}
              coversLabel={`${occupiedCovers}/${totalCapacity}`}
            />
          )}
          {sectionsWithCounts.length > 0 && (
            <SectionTabs
              sections={sectionsWithCounts}
              total={rows.length}
              activeSectionId={sectionId}
              onChange={(id) => setValue('sectionId', id)}
            />
          )}
        </div>
        <main className="flex-1 overflow-y-auto px-6 py-[18px] xl:px-8">
          {isReconnecting && rows.length > 0 && (
            <ReconnectingBanner
              lastUpdatedLabel={`Last ${formatAgo(age)}.`}
              onRefresh={() => void tables.refetch()}
              isRefreshing={tables.isFetching}
            />
          )}
          {renderBody()}
        </main>
      </div>

      <aside className="hidden w-[300px] shrink-0 overflow-y-auto border-l bg-neutral-50 p-4 lg:block xl:w-[320px] xl:p-5 dark:bg-neutral-900/40">
        {rail}
      </aside>

      {/* Smaller screens: the rail remains reachable even when no table needs attention. */}
      <Sheet open={railOpen} onOpenChange={setRailOpen}>
        <SheetContent side="right" className="w-[320px] overflow-y-auto p-4">
          <SheetHeader className="px-0">
            <SheetTitle>Floor activity</SheetTitle>
          </SheetHeader>
          {rail}
        </SheetContent>
      </Sheet>
    </div>
  );
}
