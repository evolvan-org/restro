'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { StaffAvailability } from '@rms/api-contract';
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

import {
  AVAILABILITY_LABELS,
  availabilityDefaults,
  availabilityFormSchema,
  type AvailabilityFormValues,
  availabilityInput,
} from './mappers';

export default function AvailabilityDialog({
  record,
  canManage,
  onClose,
}: {
  record?: StaffAvailability;
  canManage: boolean;
  onClose: () => void;
}): ReactElement {
  const form = useForm<AvailabilityFormValues>({
    resolver: zodResolver(availabilityFormSchema(Boolean(record))),
    defaultValues: availabilityDefaults(record),
  });
  const selectedUser = useWatch({ control: form.control, name: 'userId' });
  const staff = useWorkforceStaff(canManage && !record);
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
      const input = availabilityInput(values);
      await saveWorkforce(
        record
          ? {
              action: 'update-availability',
              id: record.id,
              input: {
                startsAt: input.startsAt,
                endsAt: input.endsAt,
                kind: input.kind,
                note: input.note,
                expectedVersion: record.version,
                reason: values.reason,
              },
            }
          : { action: 'create-availability', input },
      );
    } catch {
      // The request hook owns failures; preserve the operator's draft.
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
          <DialogTitle>{record ? 'Edit availability' : 'Record staff availability'}</DialogTitle>
          <DialogDescription>
            Unavailable windows block new conflicting assignments and flag existing shifts.
            Available windows are preferences. Times use your local time.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-3">
          <fieldset disabled={isPending} className="space-y-3">
            {canManage && !record && (
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
              Availability type
              <select className="w-full rounded border p-2" {...form.register('kind')}>
                {Object.entries(AVAILABILITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Window start (local time)
              <Input type="datetime-local" step="0.001" {...form.register('startsLocal')} />
            </label>
            <FieldError>{errors.startsLocal?.message}</FieldError>
            <label className="block text-sm">
              Window end (local time)
              <Input type="datetime-local" step="0.001" {...form.register('endsLocal')} />
            </label>
            <FieldError>{errors.endsLocal?.message}</FieldError>
            <label className="block text-sm">
              Availability note
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
              <Button
                type="submit"
                disabled={canManage && !record && (staff.isPending || staff.isError)}
              >
                {isPending ? 'Saving…' : 'Save availability'}
              </Button>
            </div>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
