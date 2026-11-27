'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { StaffShift } from '@rms/api-contract';
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

import { shiftDefaults, shiftFormSchema, type ShiftFormValues, shiftInput } from './mappers';

export default function ShiftDialog({
  record,
  onClose,
}: {
  record?: StaffShift;
  onClose: () => void;
}): ReactElement {
  const form = useForm<ShiftFormValues>({
    resolver: zodResolver(shiftFormSchema(Boolean(record))),
    defaultValues: shiftDefaults(record),
  });
  const selectedUser = useWatch({ control: form.control, name: 'userId' });
  const staff = useWorkforceStaff(true);
  const { mutateAsync: saveWorkforce, isPending, isSuccess } = useSaveWorkforce();
  const showApiError = useShowApiError('Unable to load eligible staff.');
  useEffect(() => {
    if (isSuccess) onClose();
  }, [isSuccess, onClose]);
  useEffect(() => {
    if (staff.error) showApiError(staff.error);
  }, [staff.error, staff.errorUpdatedAt, showApiError]);
  const submit = form.handleSubmit(async (values) => {
    try {
      const input = shiftInput(values);
      await saveWorkforce(
        record
          ? {
              action: 'update-shift',
              id: record.id,
              input: { ...input, expectedVersion: record.version, reason: values.reason },
            }
          : { action: 'create-shift', input },
      );
    } catch {
      // The request hook owns API failures. Keep the proposed assignment for correction.
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
          <DialogTitle>{record ? 'Edit staff shift' : 'Assign staff shift'}</DialogTitle>
          <DialogDescription>
            Times use your local time. Overlapping shifts, recorded unavailability and approved
            leave are checked before the assignment is saved.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-3">
          <fieldset disabled={isPending} className="space-y-3">
            <label className="block text-sm">
              Assigned staff
              <select
                className="w-full rounded border p-2"
                {...form.register('userId')}
                value={selectedUser}
              >
                <option value="">Choose staff</option>
                {staff.data?.data.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
            <FieldError>{errors.userId?.message}</FieldError>
            {staff.isSuccess && staff.data.data.length === 0 && (
              <p role="alert">
                Staff need schedule read permission before they can receive shifts.
              </p>
            )}
            <label className="block text-sm">
              Shift start (local time)
              <Input type="datetime-local" step="0.001" {...form.register('startsLocal')} />
            </label>
            <FieldError>{errors.startsLocal?.message}</FieldError>
            <label className="block text-sm">
              Shift end (local time)
              <Input type="datetime-local" step="0.001" {...form.register('endsLocal')} />
            </label>
            <FieldError>{errors.endsLocal?.message}</FieldError>
            <label className="block text-sm">
              Shift note
              <Textarea maxLength={1000} {...form.register('note')} />
            </label>
            <FieldError>{errors.note?.message}</FieldError>
            {record && (
              <>
                <label className="block text-sm">
                  Reason for change
                  <Textarea maxLength={2000} {...form.register('reason')} />
                </label>
                <FieldError>{errors.reason?.message}</FieldError>
              </>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={staff.isPending || staff.isError}>
                {isPending ? 'Saving…' : 'Save shift'}
              </Button>
            </div>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
