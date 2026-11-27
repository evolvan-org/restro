'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { AttendanceSession } from '@rms/api-contract';
import { type ReactElement, useEffect } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';

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
import { useRequestAttendanceCorrection } from '@/services/api/requests/attendance';

import {
  type AttendanceCorrectionForm,
  attendanceCorrectionFormSchema,
  getAttendanceCorrectionDefaults,
  toAttendanceTimeline,
} from './mappers';

export default function CorrectionDialog({
  session,
  onClose,
}: {
  session: AttendanceSession;
  onClose: () => void;
}): ReactElement {
  const form = useForm<AttendanceCorrectionForm>({
    resolver: zodResolver(attendanceCorrectionFormSchema),
    defaultValues: getAttendanceCorrectionDefaults(session),
  });
  const breaks = useFieldArray({ control: form.control, name: 'breaks' });
  const { mutateAsync: requestCorrection, isPending, isSuccess } = useRequestAttendanceCorrection();
  useEffect(() => {
    if (isSuccess) onClose();
  }, [isSuccess, onClose]);
  const submit = form.handleSubmit(async (values) => {
    let timeline;
    try {
      timeline = toAttendanceTimeline(values);
    } catch (error) {
      if (error instanceof z.ZodError)
        form.setError('root', { message: error.issues.map((issue) => issue.message).join('. ') });
      return;
    }
    try {
      await requestCorrection({
        id: session.id,
        input: { expectedVersion: values.expectedVersion, reason: values.reason, timeline },
      });
    } catch {
      // The request hook reports API failures. Preserve the proposed times and reason.
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
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Request attendance correction · {session.user.name}</DialogTitle>
          <DialogDescription>
            Propose the full corrected session and all breaks in your local time. Original clock
            records remain unchanged. A reviewer with approval permission must approve the request
            before it affects recorded totals.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-3">
          <fieldset disabled={isPending} className="space-y-3">
            <label className="block text-sm">
              Correct clock-in
              <Input type="datetime-local" step="0.001" {...form.register('clockInLocal')} />
            </label>
            <FieldError>{errors.clockInLocal?.message}</FieldError>
            <label className="block text-sm">
              Correct clock-out
              <Input type="datetime-local" step="0.001" {...form.register('clockOutLocal')} />
            </label>
            <FieldError>{errors.clockOutLocal?.message}</FieldError>
            <h3 className="font-medium">Corrected breaks</h3>
            {breaks.fields.map((field, index) => (
              <div key={field.id} className="space-y-2 rounded border p-3">
                <label className="block text-sm">
                  Break {index + 1} start
                  <Input
                    type="datetime-local"
                    step="0.001"
                    {...form.register(`breaks.${index}.startedLocal`)}
                  />
                </label>
                <FieldError>{errors.breaks?.[index]?.startedLocal?.message}</FieldError>
                <label className="block text-sm">
                  Break {index + 1} end
                  <Input
                    type="datetime-local"
                    step="0.001"
                    {...form.register(`breaks.${index}.endedLocal`)}
                  />
                </label>
                <FieldError>{errors.breaks?.[index]?.endedLocal?.message}</FieldError>
                <Button type="button" variant="outline" onClick={() => breaks.remove(index)}>
                  Remove break
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              disabled={breaks.fields.length >= 100}
              onClick={() => breaks.append({ startedLocal: '', endedLocal: '' })}
            >
              Add break
            </Button>
            <label className="block text-sm">
              Reason for correction
              <Textarea maxLength={2000} {...form.register('reason')} />
            </label>
            <FieldError>{errors.reason?.message}</FieldError>
            <FieldError>{errors.root?.message}</FieldError>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit">
                {isPending ? 'Submitting…' : 'Submit correction request'}
              </Button>
            </div>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
