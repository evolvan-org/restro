'use client';

import { Check, Copy } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useHideModal } from '@/store/hooks/modal';

/** Props come from `useShowStaffTemporaryPasswordModal()(created)`. */
export type StaffTemporaryPasswordModalProps = {
  name: string;
  email: string;
  temporaryPassword: string;
};

type CopyState = 'idle' | 'copied' | 'failed';

/**
 * Shown once after a staff account is created. The API never returns the password again,
 * so the admin must share it now.
 */
export default function StaffTemporaryPasswordModal({
  name,
  email,
  temporaryPassword,
}: StaffTemporaryPasswordModalProps): ReactElement {
  const hideModal = useHideModal();
  const [copyState, setCopyState] = useState<CopyState>('idle');

  const copyPassword = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
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
          <DialogTitle>Staff account created</DialogTitle>
          <DialogDescription>
            Share these login details with {name}. The temporary password is shown only once.
          </DialogDescription>
        </DialogHeader>

        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Email</dt>
            <dd className="font-medium">{email}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Temporary password</dt>
            <dd className="mt-1 flex items-center gap-2">
              <code className="rounded-md bg-muted px-2 py-1 font-mono text-base select-all">
                {temporaryPassword}
              </code>
              <Button type="button" variant="outline" size="sm" onClick={copyPassword}>
                {copyState === 'copied' ? <Check aria-hidden /> : <Copy aria-hidden />}
                {copyState === 'copied' ? 'Copied' : 'Copy'}
              </Button>
            </dd>
            {copyState === 'failed' ? (
              <p role="alert" className="mt-1 text-destructive">
                Couldn&apos;t copy automatically. Select the password and copy it manually.
              </p>
            ) : null}
          </div>
        </dl>

        <DialogFooter>
          <Button type="button" onClick={hideModal}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
