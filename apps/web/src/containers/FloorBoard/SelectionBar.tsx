'use client';

import { ChevronDown } from 'lucide-react';
import type { ReactElement } from 'react';

import { CaptainAvatar } from '@/components/FloorTile';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import type { CaptainCardData } from './CaptainRail';
import type { CaptainAssignment } from './useCaptainAssignment';

function plural(count: number): string {
  return `${count} ${count === 1 ? 'table' : 'tables'}`;
}

type SelectionBarProps = {
  cards: readonly CaptainCardData[];
  assignment: CaptainAssignment;
};

/**
 * Floating bar for the current selection (lg+): the click and keyboard route for every drag action.
 * The tablet dock covers smaller screens.
 */
export default function SelectionBar({
  cards,
  assignment,
}: SelectionBarProps): ReactElement | null {
  const count = assignment.selected.length;
  if (count === 0) return null;

  const captains = cards.flatMap(({ target, tables, readOnly }) =>
    target && !readOnly ? [{ target, tables }] : [],
  );

  return (
    <div className="pointer-events-none sticky bottom-4 z-30 mt-4 hidden justify-center lg:flex">
      <div
        role="region"
        aria-label="Selected tables"
        className="pointer-events-auto flex max-w-full items-center gap-3 rounded-xl border bg-popover px-4 py-2.5 text-sm text-popover-foreground shadow-lg"
      >
        <span className="shrink-0 font-semibold" aria-live="polite">
          {plural(count)} selected
        </span>
        <span className="min-w-0 max-w-[240px] truncate text-muted-foreground">
          {assignment.selected.map((table) => table.tableNumber).join(', ')}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button size="sm" className="shrink-0" disabled={assignment.isPending} />}
          >
            Assign to…
            <ChevronDown aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" className="w-64">
            {captains.map(({ target, tables }) => (
              <DropdownMenuItem
                key={target.id}
                nativeButton
                render={<button type="button" />}
                className="w-full"
                onClick={() => assignment.assign(target)}
              >
                <CaptainAvatar
                  name={target.name}
                  className="size-6 bg-muted text-[10px] text-foreground dark:bg-muted dark:text-foreground"
                />
                <span className="min-w-0 flex-1 truncate text-left">{target.name}</span>
                <span className="text-xs text-muted-foreground">{plural(tables)}</span>
              </DropdownMenuItem>
            ))}
            {captains.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem
              nativeButton
              render={<button type="button" />}
              className="w-full"
              onClick={() => assignment.assign(null)}
            >
              <span
                aria-hidden
                className="size-6 shrink-0 rounded-full border-2 border-dashed border-amber-500"
              />
              <span className="flex-1 text-left">No captain</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button size="sm" variant="ghost" className="shrink-0" onClick={assignment.clear}>
          Clear
          <kbd className="rounded border px-1 text-[10px] text-muted-foreground">Esc</kbd>
        </Button>
      </div>
    </div>
  );
}

/** "N tables" pill under the pointer or finger while dragging tiles (rendered in `DragOverlay`). */
export function DragPill({ count }: { count: number }): ReactElement {
  return (
    <div
      aria-hidden
      className="pointer-events-none w-max rounded-full bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-neutral-50 shadow-lg dark:bg-neutral-100 dark:text-neutral-900"
    >
      {plural(Math.max(count, 1))}
    </div>
  );
}
