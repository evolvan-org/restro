'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type ReactElement, useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';

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
import useShowApiError from '@/hooks/api/useShowApiError';
import { useSaveWorkforce, useWorkforceStaff } from '@/services/api/requests/workforce';

import { LEAVE_KIND_LABELS, leaveFormSchema, type LeaveFormValues, leaveInput } from './mappers';

export default function LeaveDialog({
  canManage,
  onClose,
}: {
  canManage: boolean;
  onClose: () => void;
}): ReactElement {
  const form = useForm<LeaveFormValues>({
    resolver: zodResolver(leaveFormSchema),
    defaultValues: { userId: '', startsLocal: '', endsLocal: '', kind: 'ANNUAL', reason: '' },
  });
  const selectedUser = useWatch({ control: form.control, name: 'userId' });
  const staff = useWorkforceStaff(canManage);
  const { mutateAsync: saveWorkforce, isPending, isSuccess } = useSaveWorkforce();
  const showApiError = useShowApiError('Unable to load staff.');
  useEffect(() => {
    if (isSuccess) onClose();
  }, [isSuccess, onClose]);
  useEffect(() => {
    if (staff.error) showApiError(staff.error);
  }, [staff.error, staff.errorUpdatedAt, showApiError]);
  const submit = form.handleSubmit(async (values) => {
    try {
      await saveWorkforce({ action: 'request-leave', input: leaveInput(values) });
    } catch {
      // The request hook reports failures; keep the requested times and reason.
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
          <DialogTitle>Request staff leave</DialogTitle>
          <DialogDescription>
            Enter the exact absence period in your local time. For a full day, use midnight to the
            following midnight. Leave classifications do not calculate pay.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-3">
          <fieldset disabled={isPending} className="space-y-3">
            {canManage && (
              <>
                <label className="block text-sm">
                  Staff (blank means yourself)
                  <select
                    className="w-full rounded border p-2"
                    {...form.register('userId')}
                    value={selectedUser}
                  >
                    <option value="">Yourself</option>
                    {staff.data?.data.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                  </select>
                </label>
                <FieldError>{errors.userId?.message}</FieldError>
              </>
            )}
            <label className="block text-sm">
              Leave type
              <select className="w-full rounded border p-2" {...form.register('kind')}>
                {Object.entries(LEAVE_KIND_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Leave start (local time)
              <Input type="datetime-local" step="0.001" {...form.register('startsLocal')} />
            </label>
            <FieldError>{errors.startsLocal?.message}</FieldError>
            <label className="block text-sm">
              Leave end (local time, excluded)
              <Input type="datetime-local" step="0.001" {...form.register('endsLocal')} />
            </label>
            <FieldError>{errors.endsLocal?.message}</FieldError>
            <label className="block text-sm">
              Leave reason
              <Textarea maxLength={2000} {...form.register('reason')} />
            </label>
            <FieldError>{errors.reason?.message}</FieldError>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={canManage && (staff.isPending || staff.isError)}>
                {isPending ? 'Submitting…' : 'Submit leave request'}
              </Button>
            </div>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
