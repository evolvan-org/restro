'use client';

import type { StaffAccount } from '@rms/api-contract';
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
import { useUpdateStaffStatus } from '@/services/api/requests/staff';
import { useHideModal } from '@/store/hooks/modal';

/** Props come from `useShowStaffStatusModal()(account)`. */
export type StaffStatusModalProps = {
  account: StaffAccount;
};

/** Confirms activating or deactivating a staff account. */
export default function StaffStatusModal({ account }: StaffStatusModalProps): ReactElement {
  const hideModal = useHideModal();
  const updateStatus = useUpdateStaffStatus();
  const [error, setError] = useState<string | null>(null);
  const deactivate = account.status === 'ACTIVE';

  const confirm = (): void => {
    setError(null);
    updateStatus.mutate(
      { id: account.id, input: { status: deactivate ? 'INACTIVE' : 'ACTIVE' } },
      {
        onSuccess: hideModal,
        onError: (mutationError) => {
          setError(getApiErrorMessage(mutationError, 'Unable to change the account status.'));
        },
      },
    );
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
            variant={deactivate ? 'destructive' : 'default'}
            onClick={confirm}
            disabled={updateStatus.isPending}
          >
            {updateStatus.isPending ? 'Saving…' : deactivate ? 'Deactivate' : 'Activate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
