'use client';

import { cn } from 'cn';
import { Plus, Search, TriangleAlert } from 'lucide-react';
import type { ReactElement } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type FloorHeaderProps = {
  updatedLabel: string;
  isReconnecting: boolean;
  searchField: UseFormRegisterReturn<'search'>;
  onSeatWalkIn: () => void;
  canReserve: boolean;
  attentionCount: number;
  onOpenAttention: () => void;
};

export default function FloorHeader(props: FloorHeaderProps): ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-[18px] xl:px-8">
      <div className="mr-auto min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">Live floor board</h1>
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
          placeholder="Find table"
          aria-label="Find table"
          className="h-11 pl-9 xl:h-9"
        />
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border bg-muted px-1.5 text-[11px] text-muted-foreground xl:block">
          /
        </kbd>
      </div>

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
