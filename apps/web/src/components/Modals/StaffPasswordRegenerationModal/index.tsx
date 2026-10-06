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
import { useRegenerateStaffPassword } from '@/services/api/requests/staff';
import { useHideModal, useShowStaffTemporaryPasswordModal } from '@/store/hooks/modal';

export type StaffPasswordRegenerationModalProps = { account: StaffAccount };

/** Keep this dialog mounted until the replacement password is available to share. */
export default function StaffPasswordRegenerationModal({
  account,
}: StaffPasswordRegenerationModalProps): ReactElement {
  const {
    mutateAsync: regeneratePassword,
    data,
    isPending,
    isSuccess,
  } = useRegenerateStaffPassword();
  const hideModal = useHideModal();
  const showTemporaryPassword = useShowStaffTemporaryPasswordModal();

  useEffect(() => {
    if (isSuccess && data) showTemporaryPassword(data, 'regenerated');
  }, [isSuccess, data, showTemporaryPassword]);

  const confirm = async (): Promise<void> => {
    try {
      await regeneratePassword(account.id);
    } catch {
      // The mutation hook reports the error through useShowApiError; retain the dialog.
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !isPending && hideModal()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Regenerate staff password?</DialogTitle>
          <DialogDescription>
            This replaces the password for {account.name} ({account.email}). Their old password will
            no longer work. Share the new temporary password shown afterwards.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={hideModal} disabled={isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={confirm} disabled={isPending}>
            {isPending ? 'Regenerating…' : 'Regenerate password'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
