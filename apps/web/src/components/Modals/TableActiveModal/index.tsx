'use client';

import type { RestaurantTable } from '@rms/api-contract';
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
import { useUpdateTableActive } from '@/services/api/requests/tables';
import { useHideModal } from '@/store/hooks/modal';

export type TableActiveModalProps = {
  table: RestaurantTable;
};

export default function TableActiveModal({ table }: TableActiveModalProps): ReactElement {
  const hideModal = useHideModal();
  const { mutateAsync: updateActive, isPending, isSuccess } = useUpdateTableActive();
  const deactivate = table.isActive;

  useEffect(() => {
    if (isSuccess) hideModal();
  }, [isSuccess, hideModal]);

  const confirm = async (): Promise<void> => {
    try {
      await updateActive({ id: table.id, input: { isActive: !deactivate } });
    } catch {
      // The request hook reports the error; keep the dialog open for retry.
    }
  };

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
            {deactivate
              ? `Deactivate table ${table.tableNumber}?`
              : `Activate table ${table.tableNumber}?`}
          </DialogTitle>
          <DialogDescription>
            {deactivate
              ? 'The table is soft-deleted: it stays in the system with its reservation and order history, but is hidden from future availability workflows. You can activate it again at any time.'
              : 'The table becomes available for future workflows again.'}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={hideModal}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={deactivate ? 'destructive' : 'default'}
            onClick={confirm}
            disabled={isPending}
          >
            {isPending ? 'Saving...' : deactivate ? 'Deactivate' : 'Activate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
