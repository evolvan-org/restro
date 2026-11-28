'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { cancelOperatingTaskSchema, type OperatingTask } from '@rms/api-contract';
import { type ReactElement, useEffect } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FieldError } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { useSaveOperatingTask } from '@/services/api/requests/operating-tasks';

export default function TaskDecisionDialog({
  task,
  mode,
  onClose,
}: {
  task: OperatingTask;
  mode: 'cancel' | 'resolve';
  onClose: () => void;
}): ReactElement {
  const form = useForm<{ reason: string }>({
    resolver: zodResolver(cancelOperatingTaskSchema.pick({ reason: true })),
    defaultValues: { reason: '' },
  });
  const { mutateAsync: saveDecision, isPending, isSuccess } = useSaveOperatingTask();
  useEffect(() => {
    if (isSuccess) onClose();
  }, [isSuccess, onClose]);
  const submit = form.handleSubmit(async ({ reason }) => {
    try {
      await saveDecision(
        mode === 'cancel'
          ? { action: 'cancel', id: task.id, input: { expectedVersion: task.version, reason } }
          : {
              action: 'resolve',
              id: task.id,
              input: { expectedVersion: task.version, resolution: reason },
            },
      );
    } catch {
      // The request hook reports failures; retain the reason for retry.
    }
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isPending) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === 'resolve' ? 'Resolve exception' : 'Cancel check'} · {task.title}
          </DialogTitle>
          <DialogDescription>
            The original observations and this decision remain in history.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-3">
          <label className="block text-sm">
            {mode === 'resolve' ? 'Corrective action taken' : 'Cancellation reason'}
            <Textarea maxLength={2000} disabled={isPending} {...form.register('reason')} />
          </label>
          <FieldError>{form.formState.errors.reason?.message}</FieldError>
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Saving…' : mode === 'resolve' ? 'Resolve exception' : 'Cancel check'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
