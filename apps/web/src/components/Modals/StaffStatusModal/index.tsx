'use client';

import type { StaffAccount } from '@rms/api-contract';
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
import { useUpdateStaffStatus } from '@/services/api/requests/staff';
import { useHideModal } from '@/store/hooks/modal';

/** Props come from `useShowStaffStatusModal()(account)`. */
export type StaffStatusModalProps = {
  account: StaffAccount;
};

/** Confirms activating or deactivating a staff account. */
export default function StaffStatusModal({ account }: StaffStatusModalProps): ReactElement {
  const hideModal = useHideModal();
  const { mutateAsync: updateStatus, isPending, isSuccess } = useUpdateStaffStatus();
  const deactivate = account.status === 'ACTIVE';

  useEffect(() => {
    if (isSuccess) hideModal();
  }, [isSuccess, hideModal]);

  const confirm = async (): Promise<void> => {
    try {
      await updateStatus({
        id: account.id,
        input: { status: deactivate ? 'INACTIVE' : 'ACTIVE' },
      });
    } catch {
      // The mutation hook reports the error through useShowApiError; keep the dialog open.
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
            {deactivate ? `Deactivate ${account.name}?` : `Activate ${account.name}?`}
          </DialogTitle>
          <DialogDescription>
            {deactivate
              ? 'They will no longer be able to log in. You can activate the account again at any time.'
              : 'They will be able to log in again with their existing password.'}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={hideModal}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={deactivate ? 'warning' : 'success'}
            onClick={confirm}
            disabled={isPending}
          >
            {isPending ? 'Saving…' : deactivate ? 'Deactivate' : 'Activate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
