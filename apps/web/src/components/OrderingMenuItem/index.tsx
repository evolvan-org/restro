'use client';

import type { MenuItem } from '@rms/api-contract';
import { cn } from 'cn';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export type OrderingItemAction = (item: MenuItem) => Promise<void>;

type Props = {
  item: MenuItem;
  onAdd?: OrderingItemAction;
  isAdding?: boolean;
};

/** Browse and search share the same display and the future add-item integration point. */
export default function OrderingMenuItem({ item, onAdd, isAdding }: Props): ReactElement {
  async function handleAdd(): Promise<void> {
    if (!onAdd) return;
    try {
      await onAdd(item);
    } catch {
      // The request hook owns API error notifications; keep the menu and current order open.
    }
  }

  return (
    <li
      className={cn(
        'flex items-center justify-between gap-4 rounded-lg border p-4',
        !item.isAvailable && 'bg-muted/40 text-muted-foreground',
      )}
    >
      <div className="min-w-0 space-y-1">
        <p className="font-medium break-words">{item.name}</p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>{item.price}</span>
          <Badge variant="outline">{item.itemType}</Badge>
          {!item.isAvailable && <Badge variant="secondary">Unavailable</Badge>}
        </div>
      </div>
      {item.isAvailable && (
        <Button
          type="button"
          size="sm"
          disabled={!onAdd || isAdding}
          onClick={handleAdd}
          aria-label={`Add ${item.name} to order`}
          title={!onAdd ? 'Adding items is not available yet' : undefined}
        >
          Add
        </Button>
      )}
    </li>
  );
}
