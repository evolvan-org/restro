'use client';

import type { DiningSection } from '@rms/api-contract';
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
import {
  useDeleteDiningSection,
  useUpdateDiningSectionStatus,
} from '@/services/api/requests/dining-sections';
import { useHideModal } from '@/store/hooks/modal';

export type DiningSectionActionModalProps = {
  section: DiningSection;
  action: 'status' | 'delete';
};

export default function DiningSectionActionModal({
  section,
  action,
}: DiningSectionActionModalProps): ReactElement {
  const hideModal = useHideModal();
  const updateStatus = useUpdateDiningSectionStatus();
  const deleteSection = useDeleteDiningSection();
  const [error, setError] = useState<string | null>(null);
  const isDelete = action === 'delete';
  const deactivate = section.isActive;

  const confirm = async (): Promise<void> => {
    setError(null);
    try {
      if (isDelete) {
        await deleteSection.mutateAsync(section.id);
      } else {
        await updateStatus.mutateAsync({
          id: section.id,
          input: { isActive: !section.isActive },
        });
      }
      hideModal();
    } catch (mutationError) {
      setError(
        getApiErrorMessage(
          mutationError,
          isDelete ? 'Unable to delete the dining section.' : 'Unable to change its status.',
        ),
      );
    }
  };

  const title = isDelete
    ? `Delete ${section.name}?`
    : deactivate
      ? `Deactivate ${section.name}?`
      : `Activate ${section.name}?`;
  const pending = deleteSection.isPending || updateStatus.isPending;

  return (
    <Dialog open onOpenChange={(open) => !open && hideModal()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {isDelete
              ? 'This permanently removes the section. Sections assigned to tables cannot be deleted; deactivate them instead.'
              : deactivate
                ? 'The section will become unavailable for use but will not be deleted.'
                : 'The section will become available for use again.'}
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
            variant={isDelete ? 'destructive' : deactivate ? 'warning' : 'success'}
            onClick={confirm}
            disabled={pending}
          >
            {pending ? 'Saving…' : isDelete ? 'Delete' : deactivate ? 'Deactivate' : 'Activate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
