'use client';

import type { MenuItem } from '@rms/api-contract';
import { cn } from 'cn';
import type { ReactElement } from 'react';

export type OrderingItemAction = (item: MenuItem) => Promise<void>;

type Props = {
  item: MenuItem;
  onAdd?: OrderingItemAction;
  isAdding?: boolean;
};

/** Browse and search share the same card and the existing add-item dialog. */
export default function OrderingMenuItem({ item, onAdd, isAdding }: Props): ReactElement {
  async function handleAdd(): Promise<void> {
    if (!onAdd) return;
    try {
      await onAdd(item);
    } catch {
      // The request hook owns API error notifications; keep the menu and current order open.
    }
  }

  const content = (
    <>
      <span className="flex items-center gap-2">
        <span
          aria-hidden
          className={cn(
            'size-2.5 rounded-full',
            item.isAvailable ? 'bg-emerald-400' : 'bg-zinc-500',
          )}
        />
        <span className="sr-only">{item.itemType}</span>
        {!item.isAvailable && <span className="text-xs text-muted-foreground">Unavailable</span>}
      </span>
      <span className="block text-sm leading-tight font-medium break-words lg:my-3 lg:leading-snug">
        {item.name}
      </span>
      <span className="mt-auto block text-sm font-semibold tabular-nums lg:text-base">
        {item.price}
      </span>
    </>
  );
  const cardClassName = cn(
    'flex h-full min-h-24 w-full flex-col gap-2 rounded-2xl border p-3 text-left shadow-sm transition-colors lg:min-h-32 lg:gap-0 lg:rounded-[1.75rem] lg:p-4 lg:shadow-none',
    !item.isAvailable && 'opacity-50',
  );

  return (
    <li className="min-w-0">
      {onAdd ? (
        <button
          type="button"
          className={cn(
            cardClassName,
            'enabled:cursor-pointer enabled:hover:border-primary/60 enabled:hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed',
          )}
          disabled={!item.isAvailable || isAdding}
          onClick={handleAdd}
          aria-label={`Add ${item.name} to order`}
        >
          {content}
        </button>
      ) : (
        <div className={cardClassName}>{content}</div>
      )}
    </li>
  );
}
