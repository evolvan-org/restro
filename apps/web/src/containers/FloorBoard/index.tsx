'use client';

import {
  type Announcements,
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  MouseSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { snapCenterToCursor } from '@dnd-kit/modifiers';
import type { RestaurantTable } from '@rms/api-contract';
import { Permission } from '@rms/permissions';
import { MAX_PAGE_SIZE } from '@rms/shared';
import { cn } from 'cn';
import { type ReactElement, useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { buildStatusColorMap, type TileAssignState } from '@/components/FloorTile';
import { getTableAttention } from '@/components/FloorTile/attention';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import usePermissions from '@/hooks/auth/usePermissions';
import useDebouncedValue from '@/hooks/useDebouncedValue';
import { getApiErrorMessage } from '@/lib/api-error';
import { useReservations } from '@/services/api/requests/reservations';
import { useCaptainOptions, useTableBoard, useTableOptions } from '@/services/api/requests/tables';
import { useShowWalkInFormSidePane } from '@/store/hooks/sidepane';

import AssignInfoBar from './AssignInfoBar';
import AttentionRail, { type AttentionEntry } from './AttentionRail';
import { buildCaptainCards, CaptainDock, type CaptainDropData, CaptainRail } from './CaptainRail';
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
import QrFloorBanner, {
  getQrTablesWithoutCaptain,
  QR_NO_CAPTAIN_MESSAGE_ID,
  useQrTileMarkers,
} from './QrFloorBanner';
import { searchTables } from './search';
import SectionTabs from './SectionTabs';
import SelectionBar, { DragPill } from './SelectionBar';
import StatusFilterChips from './StatusFilterChips';
import TakeoverDialog from './TakeoverDialog';
import useCaptainAssignment from './useCaptainAssignment';

const TIMER_TICK_MS = 60_000;
const UP_NEXT_WINDOW_MS = 2 * 60 * 60 * 1000;
const STALE_AFTER_MS = 60_000;
const SEARCH_DEBOUNCE_MS = 250;
const NO_TABLES: RestaurantTable[] = [];

// Drag onto a captain card: a click (mouse) or quick tap (touch) still selects; a touch drag needs
// a short press so swiping still scrolls the floor.
const MOUSE_ACTIVATION = { activationConstraint: { distance: 5 } };
const TOUCH_ACTIVATION = { activationConstraint: { delay: 200, tolerance: 5 } };

// A captain counts as the target only while the pointer or finger is over it.
const collisionDetection: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  return within.length > 0 ? within : rectIntersection(args);
};

function dropTargetName(data: unknown): string {
  const target = (data as CaptainDropData | undefined)?.target;
  return target ? target.name : 'No captain';
}

function formatAgo(ms: number): string {
  if (ms < 10_000) return 'updated just now';
  if (ms < STALE_AFTER_MS) return `updated ${Math.round(ms / 1000)}s ago`;
  return `updated ${Math.round(ms / 60_000)} min ago`;
}

export default function FloorBoard(): ReactElement | null {
  const { can, isLoading: permissionsLoading } = usePermissions();
  const canRead = can(Permission.FLOOR_READ);
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
  // Captain-eligible callers get a board scoped to their own tables, so bulk assignment (and its
  // per-captain counts) is offered only to staff who see the whole floor.
  const canAssignCaptains = permissions.canAssignCaptain && !can(Permission.TABLE_BE_CAPTAIN);

  const { control, register, setValue, reset } = useForm<FloorBoardFilters>({
    defaultValues: getFloorBoardFilterDefaults(),
  });
  const sectionId = useWatch({ control, name: 'sectionId' });
  const statusCode = useWatch({ control, name: 'statusCode' });
  const search = useWatch({ control, name: 'search' });
  const noCaptain = useWatch({ control, name: 'noCaptain' });
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const [railOpen, setRailOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), TIMER_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const options = useTableOptions(canRead);
  // One complete snapshot keeps local filters, chip counts, and covers consistent.
  const tables = useTableBoard(canRead);
  const qr = useQrTileMarkers(canRead);
  const rows = tables.data?.data ?? NO_TABLES;
  const assignment = useCaptainAssignment(rows);
  const captains = useCaptainOptions(assignment.active);
  const sensors = useSensors(
    useSensor(MouseSensor, MOUSE_ACTIVATION),
    useSensor(TouchSensor, TOUCH_ACTIVATION),
  );

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

  if (permissionsLoading) return null;
  // Embedded in the dashboard (visible to every `dashboard:read` role), so show an in-pane notice
  // instead of redirecting users who lack `floor:read`.
  if (!canRead) {
    return (
      <p className="px-6 py-10 text-center text-sm text-muted-foreground xl:px-8">
        You don&apos;t have access to the live floor board.
      </p>
    );
  }

  const sections = options.data?.sections ?? [];
  const statuses = options.data?.statuses ?? [];
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

  const assignMode = assignment.active;
  // A drag is in progress: everything but the captains list fades out.
  const isDragging = assignMode && assignment.dragCount > 0;
  const tableNumbers = new Map(rows.map((table) => [table.id, table.tableNumber]));
  const qrTablesWithoutCaptain = getQrTablesWithoutCaptain(qr.data, tableNumbers);
  const unassignedCount = rows.filter((t) => t.captainUserId === null).length;
  const searched = searchTables(rows, debouncedSearch);
  const afterCaptain =
    assignMode && noCaptain ? searched.filter((t) => t.captainUserId === null) : searched;
  const afterSection = sectionId
    ? afterCaptain.filter((t) => t.section.id === sectionId)
    : afterCaptain;
  const afterStatus = statusCode
    ? afterSection.filter((t) => t.currentStatus.code === statusCode)
    : afterSection;
  const visibleCount = afterStatus.length;
  const renderedSections = sectionsWithCounts.filter((s) => !sectionId || s.id === sectionId);
  // Render order (section by section), for shift-click ranges.
  const orderedVisibleIds = renderedSections.flatMap((s) =>
    afterStatus.filter((t) => t.section.id === s.id).map((t) => t.id),
  );

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

  const clearSearch = (): void => {
    setValue('search', '');
  };

  const activeQuery = debouncedSearch.trim();

  const noMatchMessage = [
    statusName && `${statusName}`,
    'tables',
    assignMode && noCaptain && 'without a captain',
    sectionName && `in ${sectionName}`,
    activeQuery && `matching “${activeQuery}”`,
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

  const captainCards = assignMode ? buildCaptainCards(rows, captains.data ?? []) : [];
  const focusCaptainName =
    captainCards.find((card) => card.target && card.target.id === assignment.focusCaptainId)?.target
      ?.name ?? null;

  const toggleAssignMode = (): void => {
    if (!assignMode) {
      assignment.enter();
      return;
    }
    assignment.exit();
    setValue('noCaptain', false);
  };

  const getTileState = (table: RestaurantTable): TileAssignState => ({
    selected: assignment.selectedIds.has(table.id),
    conflict: assignment.conflictIds.has(table.id),
    dimmed: assignment.focusCaptainId !== null && table.captainUserId !== assignment.focusCaptainId,
    onToggle: (event) => assignment.toggle(table.id, event.shiftKey, orderedVisibleIds),
  });

  /** Tables a drag from `tableId` carries: the selection, or just that table if unselected. */
  const dragSize = (tableId: string): number =>
    assignment.selectedIds.has(tableId) ? assignment.selectedIds.size : 1;
  const tablesLabel = (count: number): string => `${count} ${count === 1 ? 'table' : 'tables'}`;

  const onDragStart = ({ active, activatorEvent }: DragStartEvent): void => {
    assignment.startDrag(String(active.id));
    // Light haptic tick on touch (Android; iOS has no web vibration API).
    if ('touches' in activatorEvent) navigator.vibrate?.(10);
  };
  const onDragEnd = ({ over }: DragEndEvent): void => {
    assignment.endDrag();
    const drop = over?.data.current as CaptainDropData | undefined;
    if (drop) assignment.assign(drop.target);
  };
  // Screen-reader feedback (the defaults read out raw ids).
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${tablesLabel(dragSize(String(active.id)))}.`,
    onDragOver: ({ over }) =>
      over ? `Over ${dropTargetName(over.data.current)}. Release to assign.` : undefined,
    onDragEnd: ({ over }) =>
      over ? `Dropped on ${dropTargetName(over.data.current)}.` : 'Dropped. No captain changed.',
    onDragCancel: () => 'Drag cancelled. No captain changed.',
  };

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
      return activeQuery ? (
        <FloorNoMatch
          title={`No tables match “${activeQuery}”`}
          message={sectionId || statusCode ? `No ${noMatchMessage} right now.` : undefined}
          clearLabel="Clear search"
          onClear={clearSearch}
        />
      ) : (
        <FloorNoMatch message={`No ${noMatchMessage} right now.`} onClear={clearFilters} />
      );
    }
    return (
      <div className="space-y-6">
        {renderedSections.map((s) => (
          <FloorSection
            key={s.id}
            name={s.name}
            tables={afterCaptain.filter((t) => t.section.id === s.id)}
            statusFilterCode={statusCode}
            statusFilterName={statusName}
            colorMap={colorMap}
            nowMs={nowMs}
            statuses={statuses}
            permissions={permissions}
            qrMarkers={qr.markers}
            assign={
              assignMode
                ? {
                    selectedIds: assignment.selectedIds,
                    getTileState,
                    onSelectSection: assignment.selectMany,
                  }
                : undefined
            }
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
        {activeQuery && (
          <p className="text-sm text-muted-foreground xl:hidden" aria-live="polite">
            {visibleCount} {visibleCount === 1 ? 'table' : 'tables'}
          </p>
        )}
      </div>
    );
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      accessibility={{ announcements }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={assignment.endDrag}
    >
      <div className="flex">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="shrink-0 border-b">
            <FloorHeader
              updatedLabel={formatAgo(age)}
              isReconnecting={isReconnecting}
              searchField={register('search')}
              hasSearch={Boolean(search)}
              onClearSearch={clearSearch}
              onSeatWalkIn={onSeatWalkIn}
              canReserve={permissions.canReserve}
              attentionCount={attention.length}
              onOpenAttention={() => setRailOpen(true)}
              canAssignCaptains={canAssignCaptains}
              assignMode={assignMode}
              onToggleAssignMode={toggleAssignMode}
              highlightAssign={qrTablesWithoutCaptain.length > 0}
              highlightDescriptionId={QR_NO_CAPTAIN_MESSAGE_ID}
            />
            {statuses.length > 0 && (
              <StatusFilterChips
                statuses={statuses}
                colorMap={colorMap}
                counts={counts}
                total={rows.length}
                activeCode={statusCode}
                onChange={(code) => {
                  setValue('statusCode', code);
                  setValue('noCaptain', false);
                }}
                onClear={() => {
                  setValue('statusCode', '');
                  setValue('noCaptain', false);
                }}
                coversLabel={`${occupiedCovers}/${totalCapacity}`}
                noCaptain={
                  assignMode
                    ? {
                        count: unassignedCount,
                        active: noCaptain,
                        onToggle: () => {
                          setValue('noCaptain', !noCaptain);
                          setValue('statusCode', '');
                        },
                      }
                    : undefined
                }
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
          <div className="flex-1 px-6 py-[18px] xl:px-8">
            {assignMode && rows.length > 0 && (
              <AssignInfoBar
                assignment={assignment}
                focusCaptainName={focusCaptainName}
                visibleUnassignedIds={afterStatus
                  .filter((t) => t.captainUserId === null)
                  .map((t) => t.id)}
              />
            )}
            {isReconnecting && rows.length > 0 && (
              <ReconnectingBanner
                lastUpdatedLabel={`Last ${formatAgo(age)}.`}
                onRefresh={() => void tables.refetch()}
                isRefreshing={tables.isFetching}
              />
            )}
            {rows.length > 0 && <QrFloorBanner data={qr.data} tableNumbers={tableNumbers} />}
            {renderBody()}
            {assignMode && <SelectionBar cards={captainCards} assignment={assignment} />}
          </div>
          {assignMode && (
            <CaptainDock
              cards={captainCards}
              totalSeats={totalCapacity}
              assignment={assignment}
              raised={isDragging}
            />
          )}
        </div>

        <aside
          className={cn(
            'hidden w-[300px] shrink-0 border-l bg-neutral-50 p-4 lg:block xl:w-[320px] xl:p-5 dark:bg-neutral-900/40',
            // Above the drag backdrop; opaque so the faded page doesn't show through.
            isDragging && 'relative z-50 dark:bg-neutral-900',
          )}
        >
          {assignMode ? (
            <CaptainRail
              cards={captainCards}
              totalSeats={totalCapacity}
              assignment={assignment}
              isLoading={captains.isPending}
              attentionCount={attention.length}
              activity={rail}
            />
          ) : (
            rail
          )}
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

        {isDragging && (
          // Fades the page while dragging so only the captains list (the drop zone) stands out.
          // Pointer events pass through, so drops outside the rail are still rejected.
          <div
            aria-hidden
            className="pointer-events-none fixed inset-0 z-40 bg-background/80 backdrop-blur-[2px] animate-in fade-in-0 duration-150"
          />
        )}

        {assignMode && (
          <>
            <TakeoverDialog assignment={assignment} />
            {/* Above the drag backdrop (z-40) and the raised rail/dock (z-50). */}
            <DragOverlay modifiers={[snapCenterToCursor]} dropAnimation={null} zIndex={60}>
              {isDragging ? <DragPill count={assignment.dragCount} /> : null}
            </DragOverlay>
          </>
        )}
      </div>
    </DndContext>
  );
}
