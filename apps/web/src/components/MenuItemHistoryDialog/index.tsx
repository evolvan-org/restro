'use client';

import type { MenuHistoryReason, MenuItem } from '@rms/api-contract';
import { type ReactElement, useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import useShowApiError from '@/hooks/api/useShowApiError';
import { useMenuItemHistory } from '@/services/api/requests/menu-items';

const reasonLabels: Record<MenuHistoryReason, string> = {
  BASELINE: 'Before the first recorded change',
  CREATED: 'Item created',
  UPDATED: 'Item or recipe changed',
  PRICE_CHANGED: 'Price changed',
};

type Props = { item: MenuItem; onClose: () => void };

export default function MenuItemHistoryDialog({ item, onClose }: Props): ReactElement {
  const pagination = useForm({ defaultValues: { page: 1 } });
  const page = useWatch({ control: pagination.control, name: 'page' });
  const history = useMenuItemHistory(item.id, { page, pageSize: 10 });
  const showApiError = useShowApiError('Unable to load menu history.');

  useEffect(() => {
    if (history.error) showApiError(history.error);
  }, [history.error, history.errorUpdatedAt, showApiError]);

  const meta = history.data?.meta;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>History of {item.name}</DialogTitle>
          <DialogDescription>
            Saved recipes and prices at each recorded change. A baseline is captured when history
            starts; earlier changes cannot be reconstructed.
          </DialogDescription>
        </DialogHeader>
        {history.isPending && <p role="status">Loading menu history…</p>}
        {history.isError && (
          <div role="alert">
            <p>Unable to load menu history.</p>
            <Button type="button" variant="outline" onClick={() => void history.refetch()}>
              Try again
            </Button>
          </div>
        )}
        {history.isSuccess && history.data.data.length === 0 && (
          <p>No recorded changes yet. History starts with the next recipe or price change.</p>
        )}
        <ol className="space-y-4">
          {history.data?.data.map((entry) => (
            <li key={entry.id} className="rounded-lg border p-4">
              <h3 className="font-medium">
                Revision {entry.revision} · {reasonLabels[entry.reason]}
              </h3>
              <p className="text-sm text-muted-foreground">
                <time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString()}</time>
                {' · '}
                {entry.recordedBy.name}
              </p>
              <p className="mt-2">Price: {entry.snapshot.price}</p>
              <p className="text-sm">{entry.snapshot.name}</p>
              {entry.snapshot.recipe.length > 0 ? (
                <ul className="mt-2 list-inside list-disc text-sm">
                  {entry.snapshot.recipe.map((line) => (
                    <li key={line.stockItem.id}>
                      {line.stockItem.name}: {line.quantity} {line.unit.toLowerCase()}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No recipe recorded.</p>
              )}
              {entry.snapshot.customizations && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer">Saved sizes, extras and combo setup</summary>
                  <ul className="mt-2 list-inside list-disc space-y-1">
                    {entry.snapshot.customizations.variants.map((variant) => (
                      <li key={variant.id}>
                        Size: {variant.name} · {variant.price}
                      </li>
                    ))}
                    {entry.snapshot.customizations.groups.map((group) => (
                      <li key={group.id}>
                        {group.name} · Choose {group.minSelect} to {group.maxSelect}
                        <ul className="ml-4 list-inside list-disc">
                          {group.modifiers.map((option) => (
                            <li key={option.id}>
                              {option.name} · Adjustment {option.priceAdjustment}
                              {option.kitchenNote && ` · ${option.kitchenNote}`}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                    {entry.snapshot.customizations.components.map((component) => (
                      <li key={component.menuItemId}>
                        Combo item {component.menuItemId} · Quantity {component.quantity}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-muted-foreground">
                    Combo item references retain their saved IDs; historical component names were
                    not recorded here.
                  </p>
                </details>
              )}
            </li>
          ))}
        </ol>
        {meta && meta.total > 0 && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm">
              Page {meta.page} of {meta.totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={page <= 1 || history.isFetching}
                onClick={() => pagination.setValue('page', page - 1)}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={page >= meta.totalPages || history.isFetching}
                onClick={() => pagination.setValue('page', page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
