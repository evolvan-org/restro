'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type AttendanceCorrection,
  type AttendanceTimeline,
  type DecideAttendanceCorrection,
  decideAttendanceCorrectionSchema,
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
import { Textarea } from '@/components/ui/textarea';
import { useDecideAttendanceCorrection } from '@/services/api/requests/attendance';

function Timeline({
  title,
  timeline,
}: {
  title: string;
  timeline: AttendanceTimeline;
}): ReactElement {
  return (
    <section className="space-y-2 rounded border p-3">
      <h3 className="font-semibold">{title}</h3>
      <p>In: {new Date(timeline.clockInAt).toLocaleString()}</p>
      <p>Out: {new Date(timeline.clockOutAt).toLocaleString()}</p>
      <ul>
        {timeline.breaks.map((entry, index) => (
          <li key={index}>
            Break {index + 1}: {new Date(entry.startedAt).toLocaleString()} –{' '}
            {new Date(entry.endedAt).toLocaleString()}
          </li>
        ))}
      </ul>
      {timeline.breaks.length === 0 && <p>No breaks</p>}
    </section>
  );
}
export default function ReviewDialog({
  correction,
  onClose,
}: {
  correction: AttendanceCorrection;
  onClose: () => void;
}): ReactElement {
  const form = useForm<DecideAttendanceCorrection>({
    resolver: zodResolver(decideAttendanceCorrectionSchema),
    defaultValues: { expectedVersion: correction.version, decision: 'APPROVED', reviewNote: '' },
  });
  const { mutateAsync: decideCorrection, isPending, isSuccess } = useDecideAttendanceCorrection();
  useEffect(() => {
    if (isSuccess) onClose();
  }, [isSuccess, onClose]);
  const submit = form.handleSubmit(async (input) => {
    try {
      await decideCorrection({ id: correction.id, input });
    } catch {
      // The mutation hook reports errors; retain the review note and decision.
    }
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isPending) onClose();
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review correction · {correction.user.name}</DialogTitle>
          <DialogDescription>
            Approval applies the proposed times to recorded totals and retains the original clock
            records. The reviewer and decision are recorded. This does not calculate or approve pay.
          </DialogDescription>
        </DialogHeader>
        <p>
          Requested by {correction.requestedBy.name}: {correction.reason}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Timeline title="Previous recorded times" timeline={correction.originalTimeline} />
          <Timeline title="Proposed corrected times" timeline={correction.timeline} />
        </div>
        <form onSubmit={submit} noValidate className="space-y-3">
          <fieldset disabled={isPending} className="space-y-3">
            <label className="block text-sm">
              Review decision
              <select className="w-full rounded border p-2" {...form.register('decision')}>
                <option value="APPROVED">Approve correction</option>
                <option value="REJECTED">Reject correction</option>
              </select>
            </label>
            <label className="block text-sm">
              Review note
              <Textarea maxLength={2000} {...form.register('reviewNote')} />
            </label>
            <FieldError>{form.formState.errors.reviewNote?.message}</FieldError>
            <Button type="submit">{isPending ? 'Saving…' : 'Save review decision'}</Button>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
