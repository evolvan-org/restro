'use client';

import { cn } from 'cn';
import type { ReactElement } from 'react';

import { DEFAULT_STATUS_COLOR, type StatusColorClasses } from '@/components/FloorTile';

type StatusOption = { id: string; code: string; name: string };

type StatusFilterChipsProps = {
  statuses: readonly StatusOption[];
  colorMap: Record<string, StatusColorClasses>;
  counts: Record<string, number>;
  total: number;
  activeCode: string;
  onChange: (code: string) => void;
  onClear: () => void;
  coversLabel: string;
};

function Chip({
  active,
  dot,
  label,
  count,
  onClick,
}: {
  active: boolean;
  dot?: string;
  label: string;
  count: number;
  onClick: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-11 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors xl:h-9 xl:px-3 xl:text-[13px]',
        active
          ? 'border-neutral-900 bg-neutral-900 text-neutral-50 dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900'
          : 'border-border bg-background hover:bg-muted',
      )}
    >
      {dot && <span className={cn('size-2.5 rounded-full', dot)} aria-hidden />}
      {label}
      <span
        className={cn(
          'rounded-full px-1.5 text-xs font-semibold tabular-nums',
          active ? 'bg-neutral-700 text-neutral-50 dark:bg-neutral-300 dark:text-neutral-900' : 'bg-neutral-100 dark:bg-neutral-800',
        )}
      >
        {count}
      </span>
    </button>
  );
}

export default function StatusFilterChips(props: StatusFilterChipsProps): ReactElement {
  const hasFilter = props.activeCode !== '';
  return (
    <div className="flex flex-wrap items-center gap-2 px-6 py-3 xl:px-8">
      <Chip
        active={!hasFilter}
        label="All tables"
        count={props.total}
        onClick={() => props.onChange('')}
      />
      {props.statuses.map((status) => (
        <Chip
          key={status.id}
          active={props.activeCode === status.code}
          dot={(props.colorMap[status.code] ?? DEFAULT_STATUS_COLOR).dot}
          label={status.name}
          count={props.counts[status.code] ?? 0}
          onClick={() => props.onChange(status.code)}
        />
      ))}
      {hasFilter && (
        <button
          type="button"
          onClick={props.onClear}
          className="hidden text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground xl:inline"
        >
          Clear filter
        </button>
      )}
      <span className="ml-auto text-sm text-muted-foreground tabular-nums">
        Covers {props.coversLabel}
      </span>
    </div>
  );
}
