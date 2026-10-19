'use client';

import type { MenuCategory } from '@rms/api-contract';
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
import { useUpdateMenuCategory } from '@/services/api/requests/menu-categories';
import { useHideModal } from '@/store/hooks/modal';

export type MenuCategoryStatusModalProps = {
  category: MenuCategory;
  action: 'deactivate' | 'activate';
};

export default function MenuCategoryStatusModal({
  category,
  action,
}: MenuCategoryStatusModalProps): ReactElement {
  const hideModal = useHideModal();
  const { mutateAsync: updateCategory, isPending, isSuccess } = useUpdateMenuCategory();
  const isDeactivate = action === 'deactivate';

  useEffect(() => {
    if (isSuccess) hideModal();
  }, [isSuccess, hideModal]);

  const confirm = async (): Promise<void> => {
    try {
      await updateCategory({ id: category.id, input: { isActive: !isDeactivate } });
    } catch {
      // The mutation hook reports the error through useShowApiError; keep the dialog open.
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && hideModal()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isDeactivate ? `Deactivate ${category.name}?` : `Activate ${category.name}?`}
          </DialogTitle>
          <DialogDescription>
            {isDeactivate
              ? 'The category will be hidden from new orders. It and its items are kept and can be activated again.'
              : 'The category will be available for new orders again.'}
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
