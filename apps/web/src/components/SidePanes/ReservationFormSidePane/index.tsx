'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createReservationRequestSchema } from '@rms/api-contract';
import { type ReactElement, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import useDebouncedValue from '@/hooks/useDebouncedValue';
import { useCreateReservation, useGuestLookup } from '@/services/api/requests/reservations';
import { useHideSidePane } from '@/store/hooks/sidepane';

export type ReservationFormSidePaneProps = {
  onCancel?: () => void;
};

const FORM_ID = 'reservation-form';

// The date/time picker yields a local `YYYY-MM-DDTHH:mm` string; it is converted to a UTC ISO
// datetime and validated against the shared contract schema on submit.
const formSchema = createReservationRequestSchema
  .omit({ reservationAt: true, tableId: true })
  .extend({ reservationAt: z.string().min(1, 'Reservation date and time is required') });
type ReservationFormValues = z.infer<typeof formSchema>;

/** Current local time formatted for a `datetime-local` input's `min` attribute. */
function localDateTimeNow(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

export default function ReservationFormSidePane({
  onCancel,
}: ReservationFormSidePaneProps): ReactElement {
  const { mutateAsync: createReservation, isPending } = useCreateReservation();
  const hideSidePane = useHideSidePane();
  const form = useForm<ReservationFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { guestName: '', phoneNumber: '', partySize: 2, reservationAt: '', notes: '' },
  });
  const { errors } = form.formState;
  const phoneNumber = form.watch('phoneNumber');
  const debouncedPhoneNumber = useDebouncedValue(phoneNumber.trim(), 700);
  const guestLookup = useGuestLookup(debouncedPhoneNumber, debouncedPhoneNumber.length > 0);
  const existingGuest = guestLookup.data ?? null;
  const autoFilledGuestName = useRef<string | null>(null);

  const partySizeField = form.register('partySize', {
    setValueAs: (value: string) => (value === '' ? value : Number(value)),
  });

  useEffect(() => {
    if (existingGuest) {
      autoFilledGuestName.current = existingGuest.guestName;
      form.setValue('guestName', existingGuest.guestName, {
        shouldValidate: Boolean(errors.guestName),
      });
      return;
    }

    if (
      autoFilledGuestName.current &&
      form.getValues('guestName') === autoFilledGuestName.current
    ) {
      form.setValue('guestName', '', { shouldValidate: Boolean(errors.guestName) });
      autoFilledGuestName.current = null;
    }
  }, [errors.guestName, existingGuest, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    const parsed = createReservationRequestSchema.safeParse({
      ...values,
      guestName: existingGuest?.guestName ?? values.guestName,
      reservationAt: new Date(values.reservationAt).toISOString(),
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'reservationAt' || field === 'partySize' || field === 'notes') {
          form.setError(field, { message: issue.message });
        }
      }
      return;
    }

    try {
      const reservation = await createReservation(parsed.data);
      toast.success(`Reservation booked for ${reservation.guest.guestName}.`);
      hideSidePane();
    } catch {
      // The request hook reports the error (including 409 conflicts); keep the form open.
    }
  });

  return (
    <>
      <SheetHeader>
        <SheetTitle>New reservation</SheetTitle>
        <SheetDescription>Book a table for a guest at a future date and time.</SheetDescription>
      </SheetHeader>

      <form id={FORM_ID} onSubmit={onSubmit} noValidate className="flex-1 overflow-y-auto px-4">
        <FieldGroup>
          <Field data-invalid={Boolean(errors.phoneNumber)}>
            <FieldLabel htmlFor="reservation-phone">Phone number</FieldLabel>
            <Input
              id="reservation-phone"
              type="tel"
              autoComplete="tel"
              aria-invalid={Boolean(errors.phoneNumber)}
              {...form.register('phoneNumber')}
            />
            {existingGuest ? (
              <FieldDescription>
                Existing guest found: {existingGuest.guestName}. This booking will use that guest.
              </FieldDescription>
            ) : (
              <FieldDescription>
                {guestLookup.isFetching
                  ? 'Checking for an existing guest...'
                  : 'Existing guests are matched by phone number.'}
              </FieldDescription>
            )}
            <FieldError>{errors.phoneNumber?.message}</FieldError>
          </Field>

          {!existingGuest && (
            <Field data-invalid={Boolean(errors.guestName)}>
              <FieldLabel htmlFor="reservation-name">Guest name</FieldLabel>
              <Input
                id="reservation-name"
                autoComplete="name"
                aria-invalid={Boolean(errors.guestName)}
                {...form.register('guestName')}
              />
              <FieldError>{errors.guestName?.message}</FieldError>
            </Field>
          )}

          <Field data-invalid={Boolean(errors.partySize)}>
            <FieldLabel htmlFor="reservation-party-size">Party size</FieldLabel>
            <Input
              id="reservation-party-size"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
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
            <FieldLabel htmlFor="reservation-at">Date and time</FieldLabel>
            <Input
              id="reservation-at"
              type="datetime-local"
              min={localDateTimeNow()}
              aria-invalid={Boolean(errors.reservationAt)}
              {...form.register('reservationAt')}
            />
            <FieldError>{errors.reservationAt?.message}</FieldError>
          </Field>

          <Field data-invalid={Boolean(errors.notes)}>
            <FieldLabel htmlFor="reservation-notes">Notes</FieldLabel>
            <Textarea
              id="reservation-notes"
              rows={3}
              maxLength={255}
              aria-invalid={Boolean(errors.notes)}
              {...form.register('notes')}
            />
            <FieldDescription>Optional, up to 255 characters.</FieldDescription>
            <FieldError>{errors.notes?.message}</FieldError>
          </Field>
        </FieldGroup>
      </form>

      <SheetFooter>
        <Button type="submit" form={FORM_ID} disabled={isPending}>
          {isPending ? 'Booking...' : 'Book reservation'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </SheetFooter>
    </>
  );
}
