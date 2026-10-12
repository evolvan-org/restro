'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createReservationRequestSchema, MAX_PARTY_SIZE } from '@rms/api-contract';
import { type ReactElement, useRef } from 'react';
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
  const existingGuestRef = useRef<{ guestName: string } | null>(null);
  const form = useForm<ReservationFormValues>({
    // An existing guest's stored name stands in for the name field, which is never overwritten.
    resolver: (values, context, options) =>
      zodResolver(formSchema)(
        { ...values, guestName: existingGuestRef.current?.guestName ?? values.guestName },
        context,
        options,
      ),
    defaultValues: { guestName: '', phoneNumber: '', partySize: 2, reservationAt: '', notes: '' },
  });
  const { errors } = form.formState;
  const phoneNumber = form.watch('phoneNumber');
  const debouncedPhoneNumber = useDebouncedValue(phoneNumber.trim(), 700);
  const guestLookup = useGuestLookup(debouncedPhoneNumber);
  const existingGuest = guestLookup.data ?? null;
  const typedGuestName = form.watch('guestName').trim();
  existingGuestRef.current = existingGuest;

  const partySizeField = form.register('partySize', {
    setValueAs: (value: string) => (value === '' ? value : Number(value)),
  });

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

          <Field data-invalid={Boolean(errors.guestName)}>
            <FieldLabel htmlFor="reservation-name">Guest name</FieldLabel>
            {existingGuest ? (
              <Input
                key="existing-guest-name"
                id="reservation-name"
                value={existingGuest.guestName}
                readOnly
                aria-readonly
              />
            ) : (
              <Input
                key="typed-guest-name"
                id="reservation-name"
                autoComplete="name"
                aria-invalid={Boolean(errors.guestName)}
                {...form.register('guestName')}
              />
            )}
            {existingGuest && typedGuestName && typedGuestName !== existingGuest.guestName && (
              <FieldDescription>
                You typed &ldquo;{typedGuestName}&rdquo;, but this phone number belongs to an
                existing guest, so their name is used. Change the phone number to use your entry.
              </FieldDescription>
            )}
            <FieldError>{errors.guestName?.message}</FieldError>
          </Field>

          <Field data-invalid={Boolean(errors.partySize)}>
            <FieldLabel htmlFor="reservation-party-size">Party size</FieldLabel>
            <Input
              id="reservation-party-size"
              type="text"
              inputMode="numeric"
              maxLength={String(MAX_PARTY_SIZE).length}
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
