'use client';

import type { Reservation } from '@rms/api-contract';
import { Permission } from '@rms/permissions';
import { type ReactElement, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import usePermissions from '@/hooks/auth/usePermissions';
import {
  useAssignReservationCaptain,
  useCaptainOptions,
} from '@/services/api/requests/reservations';
import { useHideSidePane } from '@/store/hooks/sidepane';

type ReservationCaptainSidePaneProps = { reservation: Reservation; onCancel?: () => void };
const FORM_ID = 'reservation-captain-form';

export default function ReservationCaptainSidePane({
  reservation,
  onCancel,
}: ReservationCaptainSidePaneProps): ReactElement {
  const { mutateAsync: assignCaptain, isPending } = useAssignReservationCaptain();
  const { can } = usePermissions();
  const canAssign = can(Permission.RESERVATION_ASSIGN_CAPTAIN);
  const captains = useCaptainOptions(canAssign);
  const hideSidePane = useHideSidePane();
  const [captainUserId, setCaptainUserId] = useState(reservation.captainUserId ?? '');
  const options = captains.data ?? [];
  const currentMissing =
    reservation.captain !== null &&
    !options.some((captain) => captain.id === reservation.captain?.id);
  const isDirty = captainUserId !== (reservation.captainUserId ?? '');

  const onSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!canAssign) return;
    try {
      const updated = await assignCaptain({
        id: reservation.id,
        input: { captainUserId: captainUserId || null },
      });
      toast.success(
        updated.captain
          ? `Assigned captain ${updated.captain.name}.`
          : 'Captain assignment cleared.',
      );
      hideSidePane();
    } catch {
      // The mutation hook reports the error through useShowApiError; keep the picker for retry.
    }
  };

  return (
    <>
      <SheetHeader>
        <SheetTitle>{reservation.captainUserId ? 'Change captain' : 'Assign captain'}</SheetTitle>
        <SheetDescription>
          Choose the captain responsible for {reservation.guest.guestName}, party of{' '}
          {reservation.partySize}.
        </SheetDescription>
      </SheetHeader>

      <form id={FORM_ID} onSubmit={onSubmit} noValidate className="flex-1 overflow-y-auto px-4">
        <Field>
          <FieldLabel htmlFor="reservation-captain-id">Captain</FieldLabel>
          <NativeSelect
            id="reservation-captain-id"
            className="w-full"
            value={captainUserId}
            onChange={(event) => setCaptainUserId(event.target.value)}
            disabled={isPending || captains.isPending || captains.isError || !canAssign}
          >
            <NativeSelectOption value="">Unassigned</NativeSelectOption>
            {currentMissing && reservation.captain && (
              <NativeSelectOption value={reservation.captain.id} disabled>
                Current captain {reservation.captain.name} - unavailable for selection
              </NativeSelectOption>
            )}
            {options.map((captain) => (
              <NativeSelectOption key={captain.id} value={captain.id}>
                {captain.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldDescription>
            Only active captains of this restaurant can be selected.
          </FieldDescription>
          {captains.isPending && (
            <p className="text-sm text-muted-foreground">Loading captains...</p>
          )}
          {captains.isError && (
            <div className="space-y-2">
              <p role="alert" className="text-sm text-destructive">
                Unable to load captains.
              </p>
              <Button type="button" variant="outline" onClick={() => void captains.refetch()}>
                Try again
              </Button>
            </div>
          )}
          {captains.isSuccess && options.length === 0 && (
            <p className="text-sm text-muted-foreground">No active captains are available.</p>
          )}
        </Field>
      </form>

      <SheetFooter>
        <Button
          type="submit"
          form={FORM_ID}
          disabled={isPending || captains.isPending || captains.isError || !canAssign || !isDirty}
        >
          {isPending ? 'Saving...' : 'Save captain'}
        </Button>
        <Button type="button" variant="outline" disabled={isPending} onClick={onCancel}>
          Cancel
        </Button>
      </SheetFooter>
    </>
  );
}
