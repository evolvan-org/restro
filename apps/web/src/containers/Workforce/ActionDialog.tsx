'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  cancelWorkforceRecordSchema,
  decideStaffLeaveSchema,
  replaceStaffShiftSchema,
} from '@rms/api-contract';
import { type ReactElement, useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
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
import { Textarea } from '@/components/ui/textarea';
import useShowApiError from '@/hooks/api/useShowApiError';
import { useSaveWorkforce, useWorkforceStaff } from '@/services/api/requests/workforce';

import type { WorkforceActionSelection } from './view-types';

const actionFormBase = z.object({
  reason: cancelWorkforceRecordSchema.shape.reason,
  replacementUserId: z.union([replaceStaffShiftSchema.shape.replacementUserId, z.literal('')]),
  decision: decideStaffLeaveSchema.shape.decision,
});
const labels = {
  'replace-shift': 'Arrange replacement cover',
  'cancel-shift': 'Cancel staff shift',
  'archive-availability': 'Archive availability',
  'decide-leave': 'Review leave request',
  'cancel-leave': 'Cancel leave',
} as const;
export default function ActionDialog({
  selection,
  onClose,
}: {
  selection: WorkforceActionSelection;
  onClose: () => void;
}): ReactElement {
  const replacing = selection.action === 'replace-shift';
  const reviewing = selection.action === 'decide-leave';
  const schema = actionFormBase.superRefine((values, context) => {
    if (replacing && !values.replacementUserId)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['replacementUserId'],
        message: 'Choose replacement staff',
      });
  });
  const form = useForm<z.infer<typeof actionFormBase>>({
    resolver: zodResolver(schema),
    defaultValues: { reason: '', replacementUserId: '', decision: 'APPROVED' },
  });
  const replacement = useWatch({ control: form.control, name: 'replacementUserId' });
  const staff = useWorkforceStaff(replacing);
  const { mutateAsync: saveWorkforce, isPending, isSuccess } = useSaveWorkforce();
  const showApiError = useShowApiError('Unable to load replacement staff.');
  useEffect(() => {
    if (isSuccess) onClose();
  }, [isSuccess, onClose]);
  useEffect(() => {
    if (staff.error) showApiError(staff.error);
  }, [staff.error, staff.errorUpdatedAt, showApiError]);
  const submit = form.handleSubmit(async (values) => {
    try {
      const expectedVersion = selection.record.version;
      switch (selection.action) {
        case 'replace-shift':
          await saveWorkforce({
            action: 'replace-shift',
            id: selection.record.id,
            input: {
              expectedVersion,
              replacementUserId: values.replacementUserId,
              reason: values.reason,
            },
          });
          break;
        case 'decide-leave':
          await saveWorkforce({
            action: 'decide-leave',
            id: selection.record.id,
            input: { expectedVersion, decision: values.decision, reviewNote: values.reason },
          });
          break;
        default:
          await saveWorkforce({
            action: selection.action,
            id: selection.record.id,
            input: { expectedVersion, reason: values.reason },
          });
      }
    } catch {
      // The mutation hook reports failures. Retain the selected decision and reason.
    }
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isPending) onClose();
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{labels[selection.action]}</DialogTitle>
          <DialogDescription>
            Changes preserve the original record and are recorded with your identity and reason.
          </DialogDescription>
        </DialogHeader>
        <p>
          {selection.record.user.name} · {new Date(selection.record.startsAt).toLocaleString()} –{' '}
          {new Date(selection.record.endsAt).toLocaleString()}
        </p>
        {reviewing && selection.action === 'decide-leave' && (
          <>
            <p>Request reason: {selection.record.reason}</p>
            <p>
              Approving leave keeps existing shifts and flags conflicts on the roster. Arrange
              replacement cover where needed.
            </p>
          </>
        )}
        <form onSubmit={submit} noValidate className="space-y-3">
          <fieldset disabled={isPending} className="space-y-3">
            {replacing && (
              <>
                <label className="block text-sm">
                  Replacement staff
                  <select
                    className="w-full rounded border p-2"
                    {...form.register('replacementUserId')}
                    value={replacement}
                  >
                    <option value="">Choose replacement staff</option>
                    {staff.data?.data
                      .filter((person) => person.id !== selection.record.user.id)
                      .map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.name}
                        </option>
                      ))}
                  </select>
                </label>
                <FieldError>{form.formState.errors.replacementUserId?.message}</FieldError>
              </>
            )}
            {reviewing && (
              <label className="block text-sm">
                Leave decision
                <select className="w-full rounded border p-2" {...form.register('decision')}>
                  <option value="APPROVED">Approve leave</option>
                  <option value="REJECTED">Reject leave</option>
                </select>
              </label>
            )}
            <label className="block text-sm">
              {reviewing ? 'Review note' : 'Reason for change'}
              <Textarea maxLength={2000} {...form.register('reason')} />
            </label>
            <FieldError>{form.formState.errors.reason?.message}</FieldError>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Close
              </Button>
              <Button type="submit" disabled={replacing && (staff.isPending || staff.isError)}>
                {isPending ? 'Saving…' : reviewing ? 'Save leave decision' : 'Confirm change'}
              </Button>
            </div>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
