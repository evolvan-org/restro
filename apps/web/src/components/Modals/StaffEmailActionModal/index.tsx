'use client';

import type { StaffAccount } from '@rms/api-contract';
import { type ReactElement } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useResendStaffInvite, useSendStaffPasswordReset } from '@/services/api/requests/staff';
import { useHideModal } from '@/store/hooks/modal';

export type StaffEmailActionModalProps = {
  account: StaffAccount;
  action: 'resend-invite' | 'password-reset';
};

export default function StaffEmailActionModal({
  account,
  action,
}: StaffEmailActionModalProps): ReactElement {
  const resendInvite = useResendStaffInvite();
  const sendReset = useSendStaffPasswordReset();
  const hideModal = useHideModal();
  const mutation = action === 'resend-invite' ? resendInvite : sendReset;
  const isInvite = action === 'resend-invite';

  const confirm = async (): Promise<void> => {
    try {
      const result = await mutation.mutateAsync(account.id);
      toast.success(result.message);
      hideModal();
    } catch {
      // The request hook displays the API error and keeps the confirmation open.
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !mutation.isPending && hideModal()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isInvite ? 'Resend staff invitation?' : 'Send password reset?'}
          </DialogTitle>
          <DialogDescription>
            {isInvite
              ? `A new invitation will be emailed to ${account.email}; the previous link will stop working.`
              : `A single-use password-reset link will be emailed to ${account.email}. Their current password remains valid until the link is used.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={hideModal} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={confirm} disabled={mutation.isPending}>
            {mutation.isPending ? 'Sending…' : 'Send email'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
