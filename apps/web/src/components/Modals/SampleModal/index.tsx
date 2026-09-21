'use client';

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

/** Props come from `showModal(ModalType.Sample, payload)`. */
export type SampleModalProps = {
  title?: string;
};

/**
 * A self-contained modal built on shadcn's `Dialog`. The `ModalDialog`
 * container mounts it while the modal type is `Sample`; `open` is driven off
 * Redux and closing routes back through `hideModal`.
 */
export default function SampleModal({ title = 'Sample modal' }: SampleModalProps) {
  const hideModal = useHideModal();

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) hideModal();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            This modal is rendered by the Redux-driven <code>ModalDialog</code> container. Open it
            from anywhere with <code>useShowSampleModal()</code>.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={hideModal}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
