'use client';

import type { FireOrderResponse, OrderItem } from '@rms/api-contract';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type Props = {
  items: OrderItem[];
  result?: FireOrderResponse;
  isPending: boolean;
  onConfirm: () => Promise<FireOrderResponse>;
  onClose: () => void;
};

export default function SendOrderDialog({
  items,
  result,
  isPending,
  onConfirm,
  onClose,
}: Props): ReactElement {
  async function submit(): Promise<void> {
    try {
      await onConfirm();
    } catch {
      // The mutation hook reports the error; keep the dialog open for retry.
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isPending) onClose();
      }}
    >
      <DialogContent showCloseButton={!isPending}>
        <DialogHeader>
          <DialogTitle>{result ? 'Order sent' : 'Send order?'}</DialogTitle>
          <DialogDescription>
            {result
              ? 'The following kitchen order tickets were created.'
              : `${items.length} unsent item${items.length === 1 ? '' : 's'} will be sent for preparation.`}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            {result.kots.map((kot) => (
              <section key={kot.id} className="space-y-2 rounded-lg border p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold">{kot.kotNumber}</h3>
                  <Badge variant="secondary">{kot.destination}</Badge>
                </div>
                <ul className="space-y-2 text-sm">
                  {kot.items.map((item) => (
                    <li key={item.id}>
                      <p>
                        {item.quantity} × {item.name}
                      </p>
                      {item.specialInstructions && (
                        <p className="break-words text-muted-foreground">
                          {item.specialInstructions}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
            {items.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3">
                <span>
                  {item.quantity} × {item.name}
                  {item.specialInstructions && (
                    <span className="block break-words text-muted-foreground">
                      {item.specialInstructions}
                    </span>
                  )}
                </span>
                <Badge variant="outline">{item.itemType === 'FOOD' ? 'KITCHEN' : 'BAR'}</Badge>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          {result ? (
            <Button type="button" onClick={onClose}>
              Close
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" disabled={isPending} onClick={onClose}>
                Cancel
              </Button>
              <Button type="button" disabled={isPending} onClick={() => void submit()}>
                {isPending ? 'Sending...' : 'Send to kitchen'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
