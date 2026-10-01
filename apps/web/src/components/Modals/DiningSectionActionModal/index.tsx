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
  const updateStatus = useUpdateDiningSectionStatus();
  const archiveSection = useArchiveDiningSection();
  const isArchive = action === 'archive';

  useEffect(() => {
    if (archiveSection.isSuccess || updateStatus.isSuccess) {
      hideModal();
    }
  }, [archiveSection.isSuccess, updateStatus.isSuccess, hideModal]);

  const confirm = (): void => {
    if (isArchive) {
      archiveSection.mutate(section.id);
    } else {
      updateStatus.mutate({ id: section.id, input: { isActive: true } });
    }
  };

  const pending = archiveSection.isPending || updateStatus.isPending;

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
