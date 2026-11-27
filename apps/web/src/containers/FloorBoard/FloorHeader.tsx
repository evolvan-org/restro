'use client';

import { cn } from 'cn';
import { Check, Plus, Search, TriangleAlert, Users, X } from 'lucide-react';
import type { ReactElement } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type FloorHeaderProps = {
  updatedLabel: string;
  isReconnecting: boolean;
  searchField: UseFormRegisterReturn<'search'>;
  hasSearch: boolean;
  onClearSearch: () => void;
  onSeatWalkIn: () => void;
  canReserve: boolean;
  attentionCount: number;
  onOpenAttention: () => void;
  canAssignCaptains: boolean;
  assignMode: boolean;
  onToggleAssignMode: () => void;
  /** Some QR tables have no captain: highlight and blink the Assign button until all are covered. */
  highlightAssign: boolean;
  /** Id of the element explaining why the button is highlighted. */
  highlightDescriptionId?: string;
};

export default function FloorHeader(props: FloorHeaderProps): ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-[18px] xl:px-8">
      <div className="mr-auto min-w-0">
        <h2 className="text-xl font-semibold tracking-tight">Live floor board</h2>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className={cn(
              'size-2 rounded-full ring-[3px]',
              props.isReconnecting
                ? 'bg-amber-500 ring-amber-100 dark:ring-amber-900/50'
                : 'bg-green-500 ring-green-100 dark:ring-green-900/50',
            )}
            aria-hidden
          />
          {props.isReconnecting ? 'Reconnecting' : 'Live'} · {props.updatedLabel}
        </p>
      </div>

      <Button
        variant="outline"
        className="h-11 gap-1.5 border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 lg:hidden dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
        onClick={props.onOpenAttention}
      >
        <TriangleAlert className="size-4" aria-hidden />
        {props.attentionCount > 0 ? `${props.attentionCount} need attention` : 'Floor activity'}
      </Button>

      <div className="relative w-full sm:w-64">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          {...props.searchField}
          placeholder="Search table, seats or section"
          aria-label="Search tables by number, seating capacity or section"
          className="h-11 pl-9 pr-9 xl:h-9 [&::-webkit-search-cancel-button]:appearance-none"
          onKeyDown={(event) => {
            if (event.key === 'Escape' && props.hasSearch) {
              event.preventDefault();
              props.onClearSearch();
            }
          }}
        />
        {props.hasSearch && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={props.onClearSearch}
            className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:text-foreground xl:size-7"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>

      {props.canAssignCaptains && (
        <Button
          variant={props.assignMode ? 'default' : 'outline'}
          className={cn(
            'h-11 gap-1.5 xl:h-9',
            props.highlightAssign && 'assign-blink',
            // Same rose tokens as the QR "no captain" banner (light and dark come from the theme).
            props.highlightAssign &&
              !props.assignMode &&
              'border-(--qs-rj) bg-(--qs-rj-b) font-semibold text-(--qs-rj-f) hover:bg-[color-mix(in_srgb,var(--qs-rj-b)_92%,var(--qs-rj))] hover:text-(--qs-rj-f) focus-visible:ring-(--qs-rj)/40 dark:border-(--qs-rj) dark:bg-(--qs-rj-b) dark:hover:bg-[color-mix(in_srgb,var(--qs-rj-b)_92%,var(--qs-rj))]',
          )}
          aria-describedby={props.highlightAssign ? props.highlightDescriptionId : undefined}
          onClick={props.onToggleAssignMode}
        >
          {props.assignMode ? (
            <Check className="size-4" aria-hidden />
          ) : (
            <Users className="size-4" aria-hidden />
          )}
          <span className="hidden sm:inline">{props.assignMode ? 'Done' : 'Assign captains'}</span>
          <span className="sr-only sm:hidden">
            {props.assignMode ? 'Done assigning captains' : 'Assign captains'}
          </span>
        </Button>
      )}

      {props.canReserve && (
        <Button className="h-11 gap-1.5 xl:h-9" onClick={props.onSeatWalkIn}>
          <Plus className="size-4" aria-hidden />
          <span className="hidden sm:inline">Seat walk-in</span>
          <span className="sr-only sm:hidden">Seat walk-in</span>
        </Button>
      )}
    </div>
  );
}
