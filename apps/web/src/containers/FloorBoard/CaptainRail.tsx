'use client';

import { useDroppable } from '@dnd-kit/core';
import type { RestaurantTable, TableCaptain } from '@rms/api-contract';
import { cn } from 'cn';
import { Eye } from 'lucide-react';
import { type ReactElement, useId, useState } from 'react';

import { CaptainAvatar } from '@/components/FloorTile';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  SegmentedControl,
  segmentedPanelId,
  segmentedTabId,
} from '@/components/ui/segmented-control';
import { shortNameOf } from '@/lib/qr';

import type { AssignTarget, CaptainAssignment } from './useCaptainAssignment';

export type CaptainCardData = {
  target: AssignTarget;
  tables: number;
  seats: number;
  /** A current holder who is no longer captain-eligible: counted, but not a drop target. */
  readOnly: boolean;
};

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/**
 * Load per captain from the board rows: the "No captain" bucket first, then every eligible
 * captain, then anyone still holding tables who has lost eligibility (so the counts add up).
 */
export function buildCaptainCards(
  rows: readonly RestaurantTable[],
  captains: readonly TableCaptain[],
): CaptainCardData[] {
  const load = new Map<string | null, { tables: number; seats: number }>();
  const holders = new Map<string, TableCaptain>();
  for (const table of rows) {
    const entry = load.get(table.captainUserId) ?? { tables: 0, seats: 0 };
    load.set(table.captainUserId, {
      tables: entry.tables + 1,
      seats: entry.seats + table.capacity,
    });
    if (table.captain) holders.set(table.captain.id, table.captain);
  }
  const card = (target: AssignTarget, readOnly = false): CaptainCardData => ({
    target,
    readOnly,
    ...(load.get(target?.id ?? null) ?? { tables: 0, seats: 0 }),
  });
  const eligible = new Set(captains.map((captain) => captain.id));
  return [
    card(null),
    ...captains.map((captain) => card(captain)),
    ...[...holders.values()]
      .filter((holder) => !eligible.has(holder.id))
      .map((holder) => card(holder, true)),
  ];
}

type CaptainCardProps = {
  data: CaptainCardData;
  totalSeats: number;
  assignment: CaptainAssignment;
  /** Tablet dock: a smaller card without the meter and eye button. */
  compact?: boolean;
};

/** Drop data on each captain card; the floor board's `DndContext` assigns on drop. */
export type CaptainDropData = { target: AssignTarget };

function CaptainCard({ data, totalSeats, assignment, compact }: CaptainCardProps): ReactElement {
  const { target, readOnly } = data;
  const targetId = target?.id ?? null;
  const name = target ? target.name : 'No captain';
  const selectedCount = assignment.selected.length;
  const canAssign = !readOnly && !assignment.isPending;
  const isFiltered = targetId !== null && assignment.focusCaptainId === targetId;
  const justAssigned =
    assignment.justAssigned && assignment.justAssigned.targetId === targetId
      ? assignment.justAssigned.count
      : 0;
  const { setNodeRef, isOver } = useDroppable({
    id: `captain:${targetId ?? 'none'}`,
    data: { target } satisfies CaptainDropData,
    disabled: !canAssign,
  });
  const dropTarget = isOver && assignment.dragCount > 0;

  const stats = `${plural(data.tables, 'table')} · ${plural(data.seats, 'seat')}`;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'relative flex items-center gap-2 rounded-[10px] border bg-card transition-colors',
        // Compact (tablet dock): at least a 44px touch target.
        compact ? 'min-h-11 min-w-[150px] shrink-0 p-2' : 'p-3',
        !target && 'border-dashed',
        dropTarget && 'border-2 border-dashed border-neutral-900 bg-muted dark:border-neutral-100',
        isFiltered && !dropTarget && 'border-neutral-900 dark:border-neutral-100',
        justAssigned > 0 && 'ring-2 ring-green-500',
        readOnly && 'opacity-60',
      )}
    >
      <button
        type="button"
        disabled={!canAssign || selectedCount === 0}
        onClick={() => assignment.assign(target)}
        aria-label={
          selectedCount > 0
            ? target
              ? `Assign ${plural(selectedCount, 'table')} to ${name}`
              : `Remove the captain from ${plural(selectedCount, 'table')}`
            : `${name}, ${stats}`
        }
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default"
      >
        {target ? (
          <CaptainAvatar
            name={target.name}
            className={compact ? 'size-7 text-[10px]' : 'size-8 text-xs'}
          />
        ) : (
          <span
            aria-hidden
            className={cn(
              'shrink-0 rounded-full border-2 border-dashed border-amber-500',
              compact ? 'size-7' : 'size-8',
            )}
          />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">
            {compact && target ? shortNameOf(target.name) : name}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {dropTarget ? `Drop to assign ${plural(assignment.dragCount, 'table')}` : stats}
          </span>
          {!compact && target && (
            <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
              <span
                className="block h-full rounded-full bg-neutral-900 dark:bg-neutral-100"
                style={{ width: `${totalSeats ? (data.seats / totalSeats) * 100 : 0}%` }}
              />
            </span>
          )}
        </span>
      </button>
      {justAssigned > 0 && (
        <Badge variant="active" className="absolute -right-1.5 -top-1.5">
          +{justAssigned}
        </Badge>
      )}
      {!compact && target && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-pressed={isFiltered}
          aria-label={`Show only ${name}'s tables`}
          className={cn(isFiltered && 'bg-muted text-foreground')}
          onClick={() => assignment.setFocusCaptainId(isFiltered ? null : targetId)}
        >
          <Eye />
        </Button>
      )}
    </div>
  );
}

type CaptainListProps = {
  cards: readonly CaptainCardData[];
  totalSeats: number;
  assignment: CaptainAssignment;
  isLoading: boolean;
};

function CaptainList({ cards, totalSeats, assignment, isLoading }: CaptainListProps): ReactElement {
  return (
    <div className="space-y-2.5">
      {cards.map((data) => (
        <CaptainCard
          key={data.target?.id ?? 'none'}
          data={data}
          totalSeats={totalSeats}
          assignment={assignment}
        />
      ))}
      {isLoading && <p className="text-sm text-muted-foreground">Loading captains…</p>}
      <p className="pt-1 text-xs text-muted-foreground">
        Only staff whose role has the Captain permission appear here.
      </p>
    </div>
  );
}

type RailView = 'captains' | 'activity';

type CaptainRailProps = Omit<CaptainListProps, 'totalSeats'> & {
  totalSeats: number;
  attentionCount: number;
  /** The regular activity rail, kept reachable while assigning. */
  activity: ReactElement;
};

/** Replaces the activity rail (lg+) while the floor board is in assign-captains mode. */
export function CaptainRail({ attentionCount, activity, ...list }: CaptainRailProps): ReactElement {
  const [chosenView, setView] = useState<RailView>('captains');
  const idBase = useId();
  // While dragging, the captains list is the drop zone, so it shows even from the Activity tab;
  // the chosen tab comes back after the drop.
  const view: RailView = list.assignment.dragCount > 0 ? 'captains' : chosenView;
  return (
    // Sticky so the drop zone stays on screen on a long, scrolled floor.
    <div className="sticky top-4 max-h-[calc(100dvh-2rem)] space-y-4 overflow-y-auto">
      <SegmentedControl<RailView>
        idBase={idBase}
        aria-label="Rail view"
        options={[
          { value: 'captains', label: 'Captains' },
          { value: 'activity', label: `Activity (${attentionCount})` },
        ]}
        value={view}
        onChange={setView}
        className="flex w-full [&>button]:flex-1 [&>button]:justify-center"
      />
      <div
        role="tabpanel"
        id={segmentedPanelId(idBase, view)}
        aria-labelledby={segmentedTabId(idBase, view)}
      >
        {view === 'captains' ? <CaptainList {...list} /> : activity}
      </div>
    </div>
  );
}

/** Tablet (< lg): the captains rail as a bottom dock; drag tables onto a captain, or tap tables then tap a captain. */
export function CaptainDock({
  cards,
  totalSeats,
  assignment,
  raised = false,
}: Omit<CaptainListProps, 'isLoading'> & {
  /** Lifted above the drag backdrop while a drag is in progress. */
  raised?: boolean;
}): ReactElement {
  const count = assignment.selected.length;
  return (
    <div
      className={cn(
        'sticky bottom-0 border-t bg-background/95 px-4 py-3 backdrop-blur lg:hidden',
        raised ? 'z-50 bg-background' : 'z-30',
      )}
    >
      <div className="mb-2 flex min-h-8 items-center gap-2 text-sm">
        <span className="font-medium" aria-live="polite">
          {count > 0
            ? `${plural(count, 'table')} selected · Tap a captain to assign`
            : 'Drag tables onto a captain, or tap tables then a captain'}
        </span>
        {count > 0 && (
          <Button variant="ghost" size="sm" className="ml-auto" onClick={assignment.clear}>
            Clear
          </Button>
        )}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {cards.map((data) => (
          <CaptainCard
            key={data.target?.id ?? 'none'}
            data={data}
            totalSeats={totalSeats}
            assignment={assignment}
            compact
          />
        ))}
      </div>
    </div>
  );
}
