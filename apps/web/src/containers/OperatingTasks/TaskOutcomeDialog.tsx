'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type OperatingTask,
  type RecordOperatingTask,
  recordOperatingTaskSchema,
} from '@rms/api-contract';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useSaveOperatingTask } from '@/services/api/requests/operating-tasks';

export default function TaskOutcomeDialog({
  task,
  onClose,
}: {
  task: OperatingTask;
  onClose: () => void;
}): ReactElement {
  const form = useForm<RecordOperatingTask>({
    resolver: zodResolver(recordOperatingTaskSchema),
    defaultValues: {
      expectedVersion: task.version,
      outcome: 'COMPLETED',
      notes: '',
      temperatureCelsius: null,
      observedExpiryDate: null,
    },
  });
  const { mutateAsync: recordTask, isPending, isSuccess } = useSaveOperatingTask();
  useEffect(() => {
    if (isSuccess) onClose();
  }, [isSuccess, onClose]);
  const submit = form.handleSubmit(async (input) => {
    if (task.kind === 'TEMPERATURE' && input.temperatureCelsius === null) {
      form.setError('temperatureCelsius', { message: 'Record the Celsius measurement.' });
      return;
    }
    if (task.kind === 'EXPIRY' && input.observedExpiryDate === null) {
      form.setError('observedExpiryDate', { message: 'Record the inspected expiry date.' });
      return;
    }
    try {
      await recordTask({ action: 'record', id: task.id, input });
    } catch {
      // Shared mutation error handling owns the notification; retain observations on failure.
    }
  });
  const { errors } = form.formState;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isPending) onClose();
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record check · {task.title}</DialogTitle>
          <DialogDescription>
            Record what you observed. Mark an exception when corrective action is needed;
            measurements do not apply an automatic safety threshold.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-3">
          <fieldset disabled={isPending} className="space-y-3">
            <label className="block text-sm">
              Outcome
              <select className="w-full rounded border p-2" {...form.register('outcome')}>
                <option value="COMPLETED">Completed</option>
                <option value="EXCEPTION">Exception needs attention</option>
              </select>
            </label>
            {task.kind === 'TEMPERATURE' && (
              <label className="block text-sm">
                Measured temperature (°C)
                <Input
                  inputMode="decimal"
                  {...form.register('temperatureCelsius', {
                    setValueAs: (value: unknown) =>
                      typeof value === 'string' ? value.trim() || null : null,
                  })}
                />
              </label>
            )}
            <FieldError>{errors.temperatureCelsius?.message}</FieldError>
            {task.kind === 'EXPIRY' && (
              <label className="block text-sm">
                Observed expiry date
                <Input
                  type="date"
                  {...form.register('observedExpiryDate', {
                    setValueAs: (value: unknown) =>
                      typeof value === 'string' ? value || null : null,
                  })}
                />
              </label>
            )}
            <FieldError>{errors.observedExpiryDate?.message}</FieldError>
            <label className="block text-sm">
              Observation notes
              <Textarea maxLength={2000} {...form.register('notes')} />
            </label>
            <FieldError>{errors.notes?.message}</FieldError>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit">{isPending ? 'Saving…' : 'Record outcome'}</Button>
            </div>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
