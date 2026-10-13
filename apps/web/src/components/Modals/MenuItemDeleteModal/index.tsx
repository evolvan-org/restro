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
import { useDeleteMenuItem } from '@/services/api/requests/menu-items';
import { useHideModal } from '@/store/hooks/modal';

export type MenuItemDeleteModalProps = {
  item: MenuItem;
};

export default function MenuItemDeleteModal({ item }: MenuItemDeleteModalProps): ReactElement {
  const hideModal = useHideModal();
  const { mutateAsync: deleteItem, isPending, isSuccess } = useDeleteMenuItem();

  useEffect(() => {
    if (isSuccess) hideModal();
  }, [isSuccess, hideModal]);

  const confirm = async (): Promise<void> => {
    try {
      await deleteItem(item.id);
    } catch {
      // The mutation hook reports the error through useShowApiError; keep the dialog open.
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && hideModal()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {item.name}?</DialogTitle>
          <DialogDescription>
            The item and its recipe will be removed from the menu and can no longer be ordered.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={hideModal}>
            Cancel
          </Button>
          <Button type="button" variant="warning" onClick={confirm} disabled={isPending}>
            {isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
