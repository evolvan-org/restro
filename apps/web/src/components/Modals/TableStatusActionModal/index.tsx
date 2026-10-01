'use client';

import type { TableStatus } from '@rms/api-contract';
import { type ReactElement, useEffect } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useArchiveTableStatus,
  useUpdateTableStatusActive,
} from '@/services/api/requests/table-statuses';
import { useHideModal } from '@/store/hooks/modal';

export type TableStatusActionModalProps = {
  status: TableStatus;
  action: 'status' | 'archive';
};

export default function TableStatusActionModal({
  status,
  action,
}: TableStatusActionModalProps): ReactElement {
  const hideModal = useHideModal();
  const updateActive = useUpdateTableStatusActive();
  const archiveStatus = useArchiveTableStatus();
  const archiving = action === 'archive';
  const deactivating = status.isActive;
  const isPending = updateActive.isPending || archiveStatus.isPending;

  useEffect(() => {
    if (updateActive.isSuccess || archiveStatus.isSuccess) {
      hideModal();
    }
  }, [updateActive.isSuccess, archiveStatus.isSuccess, hideModal]);

  const confirm = (): void => {
    if (archiving) {
      archiveStatus.mutate(status.id);
    } else {
      updateActive.mutate({ id: status.id, input: { isActive: !status.isActive } });
    }
  };

  const verb = archiving ? 'Archive' : deactivating ? 'Deactivate' : 'Activate';

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
            {archiving
              ? 'The custom status will become inactive but remain available for later reactivation.'
              : deactivating
                ? 'The status will no longer be available for use, but it will not be deleted.'
                : 'The status will become available for use again.'}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={hideModal}>
            Cancel
          </Button>
          <Button type="button" variant="default" onClick={confirm} disabled={isPending}>
            {isPending ? 'Saving…' : verb}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
