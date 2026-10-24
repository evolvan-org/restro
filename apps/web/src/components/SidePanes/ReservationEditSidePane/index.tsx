'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  MAX_PARTY_SIZE,
  type Reservation,
  updateReservationRequestSchema,
} from '@rms/api-contract';
import { type ReactElement, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { useUpdateReservation } from '@/services/api/requests/reservations';
import { useHideSidePane } from '@/store/hooks/sidepane';

import {
  getReservationEditFormSchema,
  getReservationEditFormSettings,
  type ReservationEditFormValues,
  toReservationEditFormDefaults,
  toReservationEditRequest,
} from './mapper';

export type ReservationEditSidePaneProps = {
  reservation: Reservation;
  onCancel?: () => void;
};

const FORM_ID = 'reservation-edit-form';

export default function ReservationEditSidePane({
  reservation,
  onCancel,
}: ReservationEditSidePaneProps): ReactElement {
  const { mutateAsync: updateReservation, isPending, isSuccess, data } = useUpdateReservation();
  const hideSidePane = useHideSidePane();
  const form = useForm<ReservationEditFormValues>({
    resolver: zodResolver(getReservationEditFormSchema()),
    defaultValues: toReservationEditFormDefaults(reservation),
  });
  const { reset } = form;
  const { errors } = form.formState;
  const settings = getReservationEditFormSettings();
  const partySizeField = form.register('partySize', {
    setValueAs: (value: string) => (value === '' ? value : Number(value)),
  });

  useEffect(() => {
    reset(toReservationEditFormDefaults(reservation));
  }, [reservation, reset]);

  useEffect(() => {
    if (isSuccess && data) {
      toast.success(`Reservation updated for ${data.guest.guestName}.`);
      hideSidePane();
    }
  }, [isSuccess, data, hideSidePane]);

  const onSubmit = form.handleSubmit(async (values) => {
    const parsed = updateReservationRequestSchema.safeParse(
      toReservationEditRequest(values, reservation),
    );
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const [field, guestField] = issue.path;
        if (field === 'reservationAt' || field === 'partySize' || field === 'notes') {
          form.setError(field, { message: issue.message });
        } else if (
          field === 'guest' &&
          (guestField === 'guestName' || guestField === 'phoneNumber')
        ) {
          form.setError(`guest.${guestField}`, { message: issue.message });
        }
      }
      return;
    }

    try {
      await updateReservation({ id: reservation.id, input: parsed.data });
    } catch {
      // The mutation hook reports the error through useShowApiError; retain the form for retry.
    }
  });

  return (
    <>
      <SheetHeader>
        <SheetTitle>{settings.title}</SheetTitle>
        <SheetDescription>{settings.description}</SheetDescription>
      </SheetHeader>

      <form id={FORM_ID} onSubmit={onSubmit} noValidate className="flex-1 overflow-y-auto px-4">
        <FieldGroup>
          <Field data-invalid={Boolean(errors.guest?.guestName)}>
            <FieldLabel htmlFor="reservation-edit-name">{settings.labels.guestName}</FieldLabel>
            <Input
              id="reservation-edit-name"
              autoComplete="name"
              maxLength={255}
              disabled={isPending}
              aria-invalid={Boolean(errors.guest?.guestName)}
              {...form.register('guest.guestName')}
            />
            <FieldDescription>{settings.hints.guest}</FieldDescription>
            <FieldError>{errors.guest?.guestName?.message}</FieldError>
          </Field>

          <Field data-invalid={Boolean(errors.guest?.phoneNumber)}>
            <FieldLabel htmlFor="reservation-edit-phone">{settings.labels.phoneNumber}</FieldLabel>
            <Input
              id="reservation-edit-phone"
              type="tel"
              autoComplete="tel"
              maxLength={30}
              disabled={isPending}
              aria-invalid={Boolean(errors.guest?.phoneNumber)}
              {...form.register('guest.phoneNumber')}
            />
            <FieldError>{errors.guest?.phoneNumber?.message}</FieldError>
          </Field>

          <Field data-invalid={Boolean(errors.partySize)}>
            <FieldLabel htmlFor="reservation-edit-party-size">
              {settings.labels.partySize}
            </FieldLabel>
            <Input
              id="reservation-edit-party-size"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={String(MAX_PARTY_SIZE).length}
              disabled={isPending}
              aria-invalid={Boolean(errors.partySize)}
              {...partySizeField}
              onChange={(event) => {
                event.target.value = event.target.value.replace(/\D/g, '');
                void partySizeField.onChange(event);
              }}
            />
            <FieldError>{errors.partySize?.message}</FieldError>
          </Field>

          <Field data-invalid={Boolean(errors.reservationAt)}>
            <FieldLabel htmlFor="reservation-edit-at">{settings.labels.reservationAt}</FieldLabel>
            <Input
              id="reservation-edit-at"
              type="datetime-local"
              disabled={isPending || reservation.status === 'SEATED'}
              aria-invalid={Boolean(errors.reservationAt)}
              {...form.register('reservationAt')}
            />
            <FieldDescription>
              {reservation.status === 'SEATED'
                ? 'Reservation time is locked after the guest is seated.'
                : settings.hints.reservationAt}
            </FieldDescription>
            <FieldError>{errors.reservationAt?.message}</FieldError>
          </Field>

          <Field data-invalid={Boolean(errors.notes)}>
            <FieldLabel htmlFor="reservation-edit-notes">{settings.labels.notes}</FieldLabel>
            <Textarea
              id="reservation-edit-notes"
              rows={3}
              maxLength={255}
              disabled={isPending}
              aria-invalid={Boolean(errors.notes)}
              {...form.register('notes')}
            />
            <FieldDescription>{settings.hints.notes}</FieldDescription>
            <FieldError>{errors.notes?.message}</FieldError>
          </Field>
        </FieldGroup>
      </form>

      <SheetFooter>
        <Button type="submit" form={FORM_ID} disabled={isPending}>
          {isPending ? settings.labels.pending : settings.labels.submit}
        </Button>
        <Button type="button" variant="outline" disabled={isPending} onClick={onCancel}>
          {settings.labels.cancel}
        </Button>
      </SheetFooter>
    </>
  );
}
