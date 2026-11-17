'use client';

import { cn } from 'cn';
import { type KeyboardEvent, type ReactElement, useId, useRef } from 'react';

export type SegmentedOption<T extends string> = { value: T; label: string };

type SegmentedControlProps<T extends string> = {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  'aria-label': string;
  className?: string;
};

/** Id of the tab button for `value`, for `aria-labelledby` on its panel. */
export function segmentedTabId(baseId: string, value: string): string {
  return `${baseId}-tab-${value}`;
}

/** Id of the panel for `value`, referenced by the tab's `aria-controls`. */
export function segmentedPanelId(baseId: string, value: string): string {
  return `${baseId}-panel-${value}`;
}

/**
 * Segmented toggle with tablist semantics. Arrow keys / Home / End move and select (automatic
 * activation); only the selected tab is in the tab order. Pair with `role="tabpanel"` elements using
 * `segmentedPanelId` / `segmentedTabId` and the same `idBase`.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
  idBase,
  ...rest
}: SegmentedControlProps<T> & { idBase: string }): ReactElement {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const fallbackId = useId();
  const base = idBase || fallbackId;

  const move = (index: number): void => {
    const target = options[(index + options.length) % options.length];
    if (!target) return;
    onChange(target.value);
    refs.current[options.indexOf(target)]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const current = options.findIndex((o) => o.value === value);
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        move(current + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        move(current - 1);
        break;
      case 'Home':
        event.preventDefault();
        move(0);
        break;
      case 'End':
        event.preventDefault();
        move(options.length - 1);
        break;
    }
  };

  return (
    <div
      role="tablist"
      aria-label={rest['aria-label']}
      onKeyDown={onKeyDown}
      className={cn('inline-flex items-center gap-1 rounded-lg bg-muted p-1', className)}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="tab"
            id={segmentedTabId(base, option.value)}
            aria-selected={selected}
            aria-controls={segmentedPanelId(base, option.value)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex h-8 items-center rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              selected
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
