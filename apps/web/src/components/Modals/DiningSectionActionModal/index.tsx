'use client';

import type { DiningSection } from '@rms/api-contract';
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
import {
  useArchiveDiningSection,
  useUpdateDiningSectionStatus,
} from '@/services/api/requests/dining-sections';
import { useHideModal } from '@/store/hooks/modal';

export type DiningSectionActionModalProps = {
  section: DiningSection;
  action: 'archive' | 'activate';
};

export default function DiningSectionActionModal({
  section,
  action,
}: DiningSectionActionModalProps): ReactElement {
  const hideModal = useHideModal();
  const {
    mutateAsync: updateStatus,
    isPending: isUpdating,
    isSuccess: isUpdated,
  } = useUpdateDiningSectionStatus();
  const {
    mutateAsync: archiveSection,
    isPending: isArchiving,
    isSuccess: isArchived,
  } = useArchiveDiningSection();
  const isArchive = action === 'archive';

  useEffect(() => {
    if (isArchived || isUpdated) {
      hideModal();
    }
  }, [isArchived, isUpdated, hideModal]);

  const confirm = async (): Promise<void> => {
    try {
      if (isArchive) {
        await archiveSection(section.id);
      } else {
        await updateStatus({ id: section.id, input: { isActive: true } });
      }
    } catch {
      // The mutation hook reports the error through useShowApiError; keep the dialog open.
    }
  };

  const pending = isArchiving || isUpdating;

  return (
    <Dialog open onOpenChange={(open) => !open && hideModal()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isArchive ? `Archive ${section.name}?` : `Activate ${section.name}?`}
          </DialogTitle>
          <DialogDescription>
            {isArchive
              ? 'The section will become unavailable for use but will remain in your restaurant and can be activated again.'
              : 'The section will become available for use again.'}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={hideModal}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={isArchive ? 'warning' : 'success'}
            onClick={confirm}
            disabled={pending}
          >
            {pending ? 'Saving…' : isArchive ? 'Archive' : 'Activate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
