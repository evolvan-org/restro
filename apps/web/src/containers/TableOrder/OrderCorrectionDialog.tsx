'use client';

import { type ReactElement, useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getApiErrorMessage } from '@/lib/api-error';

type Props = {
  itemName?: string;
  pending: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
};

export default function OrderCorrectionDialog({
  itemName,
  pending,
  onClose,
  onConfirm,
}: Props): ReactElement {
  const reasonId = useId();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const label = itemName ? 'Void item' : 'Discard order';

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>{itemName ? 'Void ' + itemName + '?' : 'Discard this order?'}</DialogTitle>
          <DialogDescription>
            {itemName
              ? 'The station will see a void for the pending sent quantity. Any unsent quantity stays in the order.'
              : 'This closes the unfired order, clears its cart, and updates the table based on its reservation.'}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (pending || !reason.trim()) return;
            setError('');
            try {
              await onConfirm(reason.trim());
              onClose();
            } catch (cause) {
              setError(
                getApiErrorMessage(
                  cause,
                  itemName ? 'Unable to void this item.' : 'Unable to discard this order.',
                ),
              );
            }
          }}
        >
          <div className="space-y-1.5">
            <label className="font-medium" htmlFor={reasonId}>
              Reason
            </label>
            <textarea
              id={reasonId}
              className="min-h-20 w-full rounded-md border bg-background p-2"
              value={reason}
              maxLength={255}
              required
              disabled={pending}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
              Go back
            </Button>
            <Button type="submit" variant="destructive" disabled={pending || !reason.trim()}>
              {pending ? 'Saving…' : label}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
