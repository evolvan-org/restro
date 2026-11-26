'use client';

import type { RestaurantTable, TableSection, TableStatusSummary } from '@rms/api-contract';
import { Permission } from '@rms/permissions';
import { cn } from 'cn';
import { UserRound } from 'lucide-react';
import { type ReactElement, type ReactNode, useState } from 'react';

import { DEFAULT_STATUS_COLOR, type StatusColorClasses } from '@/components/FloorTile';
import usePermissions from '@/hooks/auth/usePermissions';
import { getApiErrorMessage } from '@/lib/api-error';
import { useShowWalkInFormSidePane } from '@/store/hooks/sidepane';

import { FloorError, FloorLoading, FloorNoMatch, StateShell } from '../FloorBoard/FloorBoardStates';
import FloorSection, { type TilePermissions } from '../FloorBoard/FloorSection';
import { useQrTileMarkers } from '../FloorBoard/QrFloorBanner';

type CaptainFloorProps = {
  tables: readonly RestaurantTable[];
  sections: readonly TableSection[];
  statuses: readonly TableStatusSummary[];
  colorMap: Record<string, StatusColorClasses>;
  nowMs: number;
  permissions: TilePermissions;
  isPending: boolean;
  error: unknown;
  onRetry: () => void;
};

function StatusTile({
  active,
  dot,
  count,
  label,
  onClick,
}: {
  active: boolean;
  dot: string;
  count: number;
  label: string;
  onClick: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex h-[68px] min-w-0 items-center gap-3 rounded-xl border bg-background px-4 text-left transition-colors md:px-[14px]',
        active
          ? 'border-neutral-900 ring-1 ring-neutral-900 dark:border-neutral-100 dark:ring-neutral-100'
          : 'hover:bg-muted/50',
      )}
    >
      <span className={cn('size-2.5 shrink-0 rounded-full', dot)} aria-hidden />
      <span className="text-[28px] font-bold leading-none tabular-nums xl:text-[26px]">
        {count}
      </span>
      <span className="min-w-0 text-[15px] font-semibold leading-tight text-neutral-700 xl:text-sm dark:text-neutral-300">
        {label}
      </span>
    </button>
  );
}

function Segment({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}): ReactElement {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'h-11 flex-1 shrink-0 whitespace-nowrap rounded-lg px-4 text-[15px] font-semibold transition-colors md:flex-none md:px-7 xl:text-sm',
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'text-neutral-600 hover:text-foreground dark:text-neutral-400',
      )}
    >
      {children}
    </button>
  );
}

/** Mobile: three columns filling the width. Tablet and up: the design's 128x104 tiles, wrapping. */
const GRID_CLASS = 'grid grid-cols-3 gap-2.5 md:flex md:gap-3 xl:gap-3';
const TILE_CLASS =
  'h-[96px] w-full px-2.5 py-2.5 md:h-[104px] md:w-[128px] md:px-3 md:py-3 xl:h-[104px] xl:w-[128px] xl:rounded-[10px] xl:px-3 xl:py-3';

/**
 * The captain's Floor tab: status tiles (tap to filter, tap again to clear) and a section switch
 * over the captain's own tables, grouped by section with the floor tiles (same content and
 * behaviour, sized to the captain layout). No title, search or walk-in button by design.
 */
export default function CaptainFloor(props: CaptainFloorProps): ReactElement {
  const [statusCode, setStatusCode] = useState('');
  const [sectionId, setSectionId] = useState('');
  const showWalkInForm = useShowWalkInFormSidePane();
  const { tables, statuses, colorMap } = props;
  const { can } = usePermissions();
  const { markers: qrMarkers } = useQrTileMarkers(can(Permission.FLOOR_READ));

  if (props.error && tables.length === 0) {
    return (
      <FloorError
        message={getApiErrorMessage(props.error, 'Unable to load your tables.')}
        onRetry={props.onRetry}
      />
    );
  }
  if (props.isPending) return <FloorLoading />;
  if (tables.length === 0) {
    return (
      <StateShell
        icon={<UserRound className="size-6" aria-hidden />}
        title="No tables are assigned to you yet"
        description="Ask a manager to assign tables to you. They will appear here as soon as they are assigned."
      />
    );
  }

  const sections = props.sections
    .map((section) => ({
      ...section,
      count: tables.filter((table) => table.section.id === section.id).length,
    }))
    .filter((section) => section.count > 0);
  // A stale section filter (e.g. the table was reassigned) falls back to every section.
  const activeSectionId = sections.some((s) => s.id === sectionId) ? sectionId : '';
  const statusName = statuses.find((s) => s.code === statusCode)?.name ?? '';
  const inSection = activeSectionId
    ? tables.filter((t) => t.section.id === activeSectionId)
    : tables;
  const visibleCount = statusCode
    ? inSection.filter((t) => t.currentStatus.code === statusCode).length
    : inSection.length;
  const sectionName = sections.find((s) => s.id === activeSectionId)?.name ?? '';

  const clearFilters = (): void => {
    setStatusCode('');
    setSectionId('');
  };

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="space-y-3 md:space-y-4">
        <div
          role="group"
          aria-label="Filter by status"
          className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-3 xl:max-w-[960px]"
        >
          {statuses.map((status) => {
            const active = statusCode === status.code;
            return (
              <StatusTile
                key={status.id}
                active={active}
                dot={(colorMap[status.code] ?? DEFAULT_STATUS_COLOR).dot}
                count={tables.filter((t) => t.currentStatus.code === status.code).length}
                label={status.name}
                // Tapping the active tile again clears the status filter.
                onClick={() => setStatusCode(active ? '' : status.code)}
              />
            );
          })}
        </div>
        {sections.length > 0 && (
          <div
            role="group"
            aria-label="Filter by section"
            className="flex gap-1 overflow-x-auto rounded-xl bg-muted p-1 [scrollbar-width:none] md:inline-flex md:min-w-[428px] md:max-w-full [&::-webkit-scrollbar]:hidden"
          >
            <Segment active={activeSectionId === ''} onClick={() => setSectionId('')}>
              All sections
            </Segment>
            {sections.map((section) => (
              <Segment
                key={section.id}
                active={activeSectionId === section.id}
                onClick={() => setSectionId(section.id)}
              >
                {`${section.name} · ${section.count}`}
              </Segment>
            ))}
          </div>
        )}
      </div>

      {visibleCount === 0 ? (
        <FloorNoMatch
          message={`No ${[statusName, 'tables', sectionName && `in ${sectionName}`]
            .filter(Boolean)
            .join(' ')} right now.`}
          onClear={clearFilters}
        />
      ) : (
        <div className="space-y-6">
          {sections
            .filter((section) => !activeSectionId || section.id === activeSectionId)
            .map((section) => (
              <FloorSection
                key={section.id}
                name={section.name}
                tables={tables.filter((t) => t.section.id === section.id)}
                statusFilterCode={statusCode}
                statusFilterName={statusName}
                colorMap={colorMap}
                nowMs={props.nowMs}
                statuses={statuses}
                permissions={props.permissions}
                gridClassName={GRID_CLASS}
                tileClassName={TILE_CLASS}
                qrMarkers={qrMarkers}
                onWalkInClick={(table) =>
                  showWalkInForm({
                    id: table.id,
                    tableNumber: table.tableNumber,
                    capacity: table.capacity,
                  })
                }
              />
            ))}
        </div>
      )}
    </div>
  );
}
