'use client';

import type { MenuItem } from '@rms/api-contract';
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
import { useUpdateMenuItem } from '@/services/api/requests/menu-items';
import { useHideModal } from '@/store/hooks/modal';

export type MenuItemStatusModalProps = {
  item: MenuItem;
  action: 'deactivate' | 'activate';
};

export default function MenuItemStatusModal({
  item,
  action,
}: MenuItemStatusModalProps): ReactElement {
  const hideModal = useHideModal();
  const { mutateAsync: updateItem, isPending, isSuccess } = useUpdateMenuItem();
  const isDeactivate = action === 'deactivate';

  useEffect(() => {
    if (isSuccess) hideModal();
  }, [isSuccess, hideModal]);

  const confirm = async (): Promise<void> => {
    try {
      await updateItem({ id: item.id, input: { isActive: !isDeactivate } });
    } catch {
      // The mutation hook reports the error through useShowApiError; keep the dialog open.
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && hideModal()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isDeactivate ? `Deactivate ${item.name}?` : `Activate ${item.name}?`}
          </DialogTitle>
          <DialogDescription>
            {isDeactivate
              ? 'The item can no longer be ordered. It and its recipe are kept and can be activated again.'
              : 'The item will be available for new orders again.'}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={hideModal}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={isDeactivate ? 'warning' : 'success'}
            onClick={confirm}
            disabled={isPending}
          >
            {isPending ? 'Saving…' : isDeactivate ? 'Deactivate' : 'Activate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
