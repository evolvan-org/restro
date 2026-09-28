'use client';

import type { TableStatus } from '@rms/api-contract';
import { type ReactElement, useState } from 'react';

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
import {
  useDeleteTableStatus,
  useUpdateTableStatusActive,
} from '@/services/api/requests/table-statuses';
import { useHideModal } from '@/store/hooks/modal';

export type TableStatusActionModalProps = {
  status: TableStatus;
  action: 'status' | 'delete';
};

export default function TableStatusActionModal({
  status,
  action,
}: TableStatusActionModalProps): ReactElement {
  const hideModal = useHideModal();
  const updateActive = useUpdateTableStatusActive();
  const deleteStatus = useDeleteTableStatus();
  const [error, setError] = useState<string | null>(null);
  const deleting = action === 'delete';
  const deactivating = status.isActive;
  const isPending = updateActive.isPending || deleteStatus.isPending;

  const confirm = async (): Promise<void> => {
    setError(null);
    try {
      if (deleting) {
        await deleteStatus.mutateAsync(status.id);
      } else {
        await updateActive.mutateAsync({
          id: status.id,
          input: { isActive: !status.isActive },
        });
      }
      hideModal();
    } catch (mutationError) {
      setError(
        getApiErrorMessage(
          mutationError,
          deleting ? 'Unable to delete the table status.' : 'Unable to change the status.',
        ),
      );
    }
  };

  const verb = deleting ? 'Delete' : deactivating ? 'Deactivate' : 'Activate';

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) hideModal();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {verb} {status.name}?
          </DialogTitle>
          <DialogDescription>
            {deleting
              ? 'This permanently removes the custom status. A status assigned to a table cannot be deleted.'
              : deactivating
                ? 'The status will no longer be available for use, but it will not be deleted.'
                : 'The status will become available for use again.'}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={hideModal}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={deleting ? 'destructive' : 'default'}
            onClick={() => void confirm()}
            disabled={isPending}
          >
            {isPending ? 'Saving…' : verb}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
