'use client';

import type { RestaurantTable } from '@rms/api-contract';
import type { ReactElement } from 'react';

import FloorTile, { DEFAULT_STATUS_COLOR, type StatusColorClasses } from '@/components/FloorTile';

export type TilePermissions = {
  canReserve: boolean;
  canEditReservation: boolean;
  canViewOrder: boolean;
  canStartOrder: boolean;
  canReadBill: boolean;
  canAssignCaptain: boolean;
  canTransitionStatus: boolean;
};

type FloorSectionProps = {
  name: string;
  /** Section tables after the search filter, before the status chip filter. */
  tables: RestaurantTable[];
  statusFilterCode: string;
  statusFilterName: string;
  colorMap: Record<string, StatusColorClasses>;
  nowMs: number;
  statuses: readonly { id: string; code: string; name: string }[];
  permissions: TilePermissions;
  onWalkInClick: (table: RestaurantTable) => void;
};

export default function FloorSection(props: FloorSectionProps): ReactElement | null {
  const hasFilter = props.statusFilterCode !== '';
  const visible = hasFilter
    ? props.tables.filter((table) => table.currentStatus.code === props.statusFilterCode)
    : props.tables;

  // Hide sections with no matching tables (same behaviour as before).
  if (visible.length === 0) return null;

  const freeCount = props.tables.filter((t) => t.currentStatus.code === 'AVAILABLE').length;
  const summary = hasFilter
    ? `${visible.length} ${props.statusFilterName.toLowerCase()}`
    : `${freeCount} of ${props.tables.length} free`;

  return (
    <section>
      <div className="mb-2.5 flex items-baseline gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-[.12em] text-neutral-600 dark:text-neutral-400">
          {props.name}
        </h2>
        <span className="text-xs text-muted-foreground">{summary}</span>
      </div>
      <div className="flex flex-wrap gap-2.5 xl:gap-3">
        {visible.map((table) => (
          <FloorTile
            key={table.id}
            table={table}
            colorClasses={props.colorMap[table.currentStatus.code] ?? DEFAULT_STATUS_COLOR}
            nowMs={props.nowMs}
            statuses={props.statuses}
            onWalkInClick={props.onWalkInClick}
            {...props.permissions}
          />
        ))}
      </div>
    </section>
  );
}
