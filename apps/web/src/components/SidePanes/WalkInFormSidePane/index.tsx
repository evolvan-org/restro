'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type CreateWalkInRequest,
  createWalkInRequestSchema,
} from '@rms/api-contract';
import { type ReactElement, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import useDebouncedValue from '@/hooks/useDebouncedValue';
import { useCreateWalkIn, useGuestLookup } from '@/services/api/requests/reservations';
import { useHideSidePane } from '@/store/hooks/sidepane';

export type WalkInFormSidePaneProps = {
  onCancel?: () => void;
};

const FORM_ID = 'walk-in-form';

export default function WalkInFormSidePane({
  onCancel,
}: WalkInFormSidePaneProps): ReactElement {
  const { mutateAsync: createWalkIn, isPending } = useCreateWalkIn();
  const hideSidePane = useHideSidePane();
  const form = useForm<CreateWalkInRequest>({
    resolver: zodResolver(createWalkInRequestSchema),
    defaultValues: {
      guestName: '',
      phoneNumber: '',
      partySize: 1,
      notes: '',
    },
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
    try {
      const reservation = await createWalkIn({
        ...values,
        guestName: existingGuest?.guestName ?? values.guestName,
      });
      toast.success(`${reservation.guest.guestName} is seated.`);
      hideSidePane();
    } catch {
      // The request hook reports the error; keep the form open for correction or retry.
    }
  });

  return (
    <>
      <SheetHeader>
        <SheetTitle>Register walk-in</SheetTitle>
        <SheetDescription>
          Add an arriving guest and create a seated reservation immediately.
        </SheetDescription>
      </SheetHeader>

      <form id={FORM_ID} onSubmit={onSubmit} noValidate className="flex-1 overflow-y-auto px-4">
        <FieldGroup>
          <Field data-invalid={Boolean(errors.phoneNumber)}>
            <FieldLabel htmlFor="walk-in-phone">Phone number</FieldLabel>
            <Input
              id="walk-in-phone"
              type="tel"
              autoComplete="tel"
              aria-invalid={Boolean(errors.phoneNumber)}
              {...form.register('phoneNumber')}
            />
            {existingGuest ? (
              <FieldDescription>
                Existing guest found: {existingGuest.guestName}. This walk-in will use that guest.
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
              <FieldLabel htmlFor="walk-in-name">Guest name</FieldLabel>
              <Input
                id="walk-in-name"
                autoComplete="name"
                aria-invalid={Boolean(errors.guestName)}
                {...form.register('guestName')}
              />
              <FieldError>{errors.guestName?.message}</FieldError>
            </Field>
          )}

          <Field data-invalid={Boolean(errors.partySize)}>
            <FieldLabel htmlFor="walk-in-party-size">Party size</FieldLabel>
            <Input
              id="walk-in-party-size"
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

          <Field data-invalid={Boolean(errors.notes)}>
            <FieldLabel htmlFor="walk-in-notes">Notes</FieldLabel>
            <Input
              id="walk-in-notes"
              autoComplete="off"
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
          {isPending ? 'Registering...' : 'Register walk-in'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </SheetFooter>
    </>
  );
}
