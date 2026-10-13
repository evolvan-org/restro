'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { CancelReservationRequest, Reservation } from '@rms/api-contract';
import { type ReactElement, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { useCancelReservation } from '@/services/api/requests/reservations';
import { useHideModal } from '@/store/hooks/modal';

import { getCancellationFormSchema, toCancellationFormDefaults } from './mapper';

export type ReservationCancelModalProps = { reservation: Reservation };

const FORM_ID = 'reservation-cancel-form';

export default function ReservationCancelModal({
  reservation,
}: ReservationCancelModalProps): ReactElement {
  const { mutateAsync: cancelReservation, isPending, isSuccess, data } = useCancelReservation();
  const hideModal = useHideModal();
  const form = useForm<CancelReservationRequest>({
    resolver: zodResolver(getCancellationFormSchema()),
    defaultValues: toCancellationFormDefaults(),
  });
  const { errors } = form.formState;

  useEffect(() => {
    if (isSuccess && data) {
      toast.success(`Reservation cancelled for ${data.guest.guestName}.`);
      hideModal();
    }
  }, [isSuccess, data, hideModal]);

  const onSubmit = form.handleSubmit(async (input) => {
    try {
      await cancelReservation({ id: reservation.id, input });
    } catch {
      // The mutation hook reports the failure through useShowApiError; retain the reason for retry.
    }
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isPending) hideModal();
      }}
    >
      <DialogContent showCloseButton={!isPending}>
        <DialogHeader>
          <DialogTitle>Cancel reservation for {reservation.guest.guestName}?</DialogTitle>
          <DialogDescription>
            The reservation will be marked cancelled and any held table will be released.
          </DialogDescription>
        </DialogHeader>

        <form id={FORM_ID} onSubmit={onSubmit} noValidate>
          <Field data-invalid={Boolean(errors.reason)}>
            <FieldLabel htmlFor="reservation-cancel-reason">Cancellation reason</FieldLabel>
            <Textarea
              id="reservation-cancel-reason"
              rows={3}
              maxLength={255}
              disabled={isPending}
              aria-invalid={Boolean(errors.reason)}
              {...form.register('reason')}
            />
            <FieldDescription>Optional, up to 255 characters.</FieldDescription>
            <FieldError>{errors.reason?.message}</FieldError>
          </Field>
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={isPending} onClick={hideModal}>
            Keep reservation
          </Button>
          <Button type="submit" form={FORM_ID} variant="destructive" disabled={isPending}>
            {isPending ? 'Cancelling...' : 'Cancel reservation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
