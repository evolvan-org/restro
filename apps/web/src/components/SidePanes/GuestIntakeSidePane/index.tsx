'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { MAX_PARTY_SIZE } from '@rms/api-contract';
import { useRouter } from 'next/navigation';
import { type ReactElement, useEffect, useRef } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import useDebouncedValue from '@/hooks/useDebouncedValue';
import {
  useCreateReservation,
  useCreateWalkIn,
  useGuestLookup,
} from '@/services/api/requests/reservations';
import { useAssignableTables } from '@/services/api/requests/tables';
import { useHideSidePane } from '@/store/hooks/sidepane';

import {
  guestIntakeDefaults,
  guestIntakeFormSchema,
  type GuestIntakeValues,
  type IntakeMode,
  intakeModeSettings,
  type IntakeTable,
  localDateTimeNow,
  toGuestIntakeRequest,
} from './mapper';

const FORM_ID = 'guest-intake-form';
export type GuestIntakeSidePaneProps = {
  initialMode: IntakeMode;
  table?: IntakeTable;
  onCancel?: () => void;
};

export default function GuestIntakeSidePane({
  initialMode,
  table,
  onCancel,
}: GuestIntakeSidePaneProps): ReactElement {
  const router = useRouter();
  const {
    mutateAsync: createWalkIn,
    isPending: seating,
    isSuccess: seated,
    data: walkIn,
  } = useCreateWalkIn();
  const {
    mutateAsync: createReservation,
    isPending: booking,
    isSuccess: booked,
    data: reservation,
  } = useCreateReservation();
  const hideSidePane = useHideSidePane();
  const existingGuestRef = useRef<{ guestName: string } | null>(null);
  const form = useForm<GuestIntakeValues>({
    resolver: (values, context, options) =>
      zodResolver(guestIntakeFormSchema)(
        { ...values, guestName: existingGuestRef.current?.guestName ?? values.guestName },
        context,
        options,
      ),
    defaultValues: guestIntakeDefaults(initialMode, table),
  });
  const mode = useWatch({ control: form.control, name: 'mode' });
  const phone = useWatch({ control: form.control, name: 'phoneNumber' });
  const partySize = useWatch({ control: form.control, name: 'partySize' });
  const typedName = useWatch({ control: form.control, name: 'guestName' });
  const debouncedPhone = useDebouncedValue(phone.trim(), 700);
  const lookup = useGuestLookup(debouncedPhone);
  const existingGuest = phone.trim() === debouncedPhone ? (lookup.data ?? null) : null;
  const tables = useAssignableTables(mode === 'WALK_IN' && !table);
  const busy = seating || booking;
  const settings = intakeModeSettings(mode);
  const { errors } = form.formState;
  const { clearErrors } = form;
  useEffect(() => {
    existingGuestRef.current = existingGuest;
  }, [existingGuest]);
  useEffect(() => {
    clearErrors(['tableId', 'reservationAt']);
  }, [mode, clearErrors]);
  useEffect(() => {
    if (seated && walkIn) {
      toast.success(`${walkIn.guest.guestName} is seated.`);
      hideSidePane();
      if (table && walkIn.tableId) {
        router.push(`/orders/tables/${walkIn.tableId}?reservationId=${walkIn.id}`);
      }
    } else if (booked && reservation) {
      toast.success(`Reservation booked for ${reservation.guest.guestName}.`);
      hideSidePane();
    }
  }, [seated, walkIn, booked, reservation, hideSidePane, router, table]);

  const partySizeField = form.register('partySize', {
    setValueAs: (value: string) => (value === '' ? value : Number(value)),
  });
  const submit = form.handleSubmit(async (values) => {
    try {
      const request = toGuestIntakeRequest(values, table?.id);
      if (request.mode === 'WALK_IN') await createWalkIn(request.input);
      else await createReservation(request.input);
    } catch {
      /* Request hooks report API failures; keep the form and its draft open. */
    }
  });

  return (
    <>
      <SheetHeader>
        <SheetTitle>Walk-in / Reservation</SheetTitle>
        <SheetDescription>{settings.description}</SheetDescription>
      </SheetHeader>
      <form id={FORM_ID} noValidate onSubmit={submit} className="flex-1 overflow-y-auto px-4 pb-4">
        <FieldGroup className="gap-5">
          <fieldset className="min-w-0" disabled={busy}>
            <legend className="mb-2 text-sm font-medium">Visit type</legend>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { value: 'WALK_IN', label: 'Walk-in' },
                  { value: 'RESERVATION', label: 'Reservation' },
                ] as const
              ).map((option) => (
                <label
                  key={option.value}
                  className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-muted"
                >
                  <input type="radio" value={option.value} {...form.register('mode')} />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>
          {table && (
            <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
              Table {table.tableNumber} · {table.capacity} seats
            </div>
          )}
          {mode === 'WALK_IN' && !table && (
            <Field data-invalid={Boolean(errors.tableId)}>
              <FieldLabel htmlFor="guest-intake-table">Table</FieldLabel>
              <NativeSelect
                id="guest-intake-table"
                className="min-h-11"
                {...form.register('tableId')}
                disabled={tables.isPending || busy}
                aria-invalid={Boolean(errors.tableId)}
              >
                <NativeSelectOption value="">Select an available table</NativeSelectOption>
                {(tables.data ?? [])
                  .filter(
                    (candidate) =>
                      candidate.currentStatus.code === 'AVAILABLE' &&
                      candidate.capacity >= (Number(partySize) || 1),
                  )
                  .map((candidate) => (
                    <NativeSelectOption key={candidate.id} value={candidate.id}>
                      Table {candidate.tableNumber} · {candidate.capacity} seats
                    </NativeSelectOption>
                  ))}
              </NativeSelect>
              <FieldError>{errors.tableId?.message}</FieldError>
            </Field>
          )}
          <Field data-invalid={Boolean(errors.phoneNumber)}>
            <FieldLabel htmlFor="guest-intake-phone">Phone number</FieldLabel>
            <Input
              id="guest-intake-phone"
              className="min-h-11 text-base"
              type="tel"
              autoComplete="tel"
              disabled={busy}
              {...form.register('phoneNumber')}
              aria-invalid={Boolean(errors.phoneNumber)}
            />
            <FieldDescription>
              {existingGuest
                ? `Existing guest found: ${existingGuest.guestName}. Their saved name will be used.`
                : lookup.isFetching
                  ? 'Checking for an existing guest…'
                  : 'Existing guests are matched by phone number.'}
            </FieldDescription>
            <FieldError>{errors.phoneNumber?.message}</FieldError>
          </Field>
          <Field data-invalid={Boolean(errors.guestName)}>
            <FieldLabel htmlFor="guest-intake-name">Guest name</FieldLabel>
            {existingGuest ? (
              <Input
                key="existing-guest-name"
                id="guest-intake-name"
                className="min-h-11 text-base"
                value={existingGuest.guestName}
                readOnly
                aria-readonly
              />
            ) : (
              <Input
                key="typed-guest-name"
                id="guest-intake-name"
                className="min-h-11 text-base"
                autoComplete="name"
                disabled={busy}
                {...form.register('guestName')}
                aria-invalid={Boolean(errors.guestName)}
              />
            )}
            {existingGuest &&
              Boolean(typedName.trim()) &&
              typedName.trim() !== existingGuest.guestName && (
                <FieldDescription>
                  Your typed name is retained. Change the phone number to use it for a different
                  guest.
                </FieldDescription>
              )}
            <FieldError>{errors.guestName?.message}</FieldError>
          </Field>
          <Field data-invalid={Boolean(errors.partySize)}>
            <FieldLabel htmlFor="guest-intake-party">Party size</FieldLabel>
            <Input
              id="guest-intake-party"
              className="min-h-11 text-base"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={String(MAX_PARTY_SIZE).length}
              disabled={busy}
              {...partySizeField}
              aria-invalid={Boolean(errors.partySize)}
              onChange={(event) => {
                event.target.value = event.target.value.replace(/\D/g, '');
                void partySizeField.onChange(event);
              }}
            />
            <FieldError>{errors.partySize?.message}</FieldError>
          </Field>
          {mode === 'RESERVATION' && (
            <Field data-invalid={Boolean(errors.reservationAt)}>
              <FieldLabel htmlFor="guest-intake-at">Date and time</FieldLabel>
              <Input
                id="guest-intake-at"
                className="min-h-11 text-base"
                type="datetime-local"
                min={localDateTimeNow()}
                disabled={busy}
                {...form.register('reservationAt')}
                aria-invalid={Boolean(errors.reservationAt)}
              />
              <FieldError>{errors.reservationAt?.message}</FieldError>
            </Field>
          )}
          <Field data-invalid={Boolean(errors.notes)}>
            <FieldLabel htmlFor="guest-intake-notes">Notes</FieldLabel>
            <Textarea
              id="guest-intake-notes"
              rows={2}
              maxLength={255}
              disabled={busy}
              {...form.register('notes')}
              aria-invalid={Boolean(errors.notes)}
            />
            <FieldDescription>Optional, up to 255 characters.</FieldDescription>
            <FieldError>{errors.notes?.message}</FieldError>
          </Field>
        </FieldGroup>
      </form>
      <SheetFooter>
        <Button type="submit" className="min-h-11" form={FORM_ID} disabled={busy}>
          {busy ? settings.pending : settings.submit}
        </Button>
        <Button
          type="button"
          className="min-h-11"
          variant="outline"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </SheetFooter>
    </>
  );
}
