'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { Reservation } from '@rms/api-contract';
import { Permission } from '@rms/permissions';
import { type ReactElement, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import usePermissions from '@/hooks/auth/usePermissions';
import { useAssignReservationTable } from '@/services/api/requests/reservations';
import { useAssignableTables } from '@/services/api/requests/tables';
import { useHideSidePane } from '@/store/hooks/sidepane';

import {
  getAssignmentTableLabel,
  getReservationTableFormSchema,
  getReservationTableFormSettings,
  type ReservationTableFormValues,
  toReservationTableFormDefaults,
  toReservationTableRequest,
} from './mapper';

type ReservationTableSidePaneProps = { reservation: Reservation; onCancel?: () => void };
const FORM_ID = 'reservation-table-form';

export default function ReservationTableSidePane({
  reservation,
  onCancel,
}: ReservationTableSidePaneProps): ReactElement {
  const { mutateAsync: assignTable, isPending, isSuccess, data } = useAssignReservationTable();
  const { can } = usePermissions();
  const canAssign = can(Permission.RESERVATION_ASSIGN_TABLE);
  const tables = useAssignableTables(canAssign && can(Permission.RESTAURANT_READ));
  const hideSidePane = useHideSidePane();
  const form = useForm<ReservationTableFormValues>({
    resolver: zodResolver(getReservationTableFormSchema()),
    defaultValues: toReservationTableFormDefaults(reservation),
  });
  const { reset } = form;
  const { errors, isDirty } = form.formState;
  const settings = getReservationTableFormSettings(reservation);
  const options = tables.data ?? [];
  const currentTableMissing =
    reservation.tableId !== null && !options.some((table) => table.id === reservation.tableId);

  useEffect(() => {
    reset(toReservationTableFormDefaults(reservation));
  }, [reservation, reset]);

  useEffect(() => {
    if (isSuccess && data) {
      toast.success(
        data.table ? `Assigned table ${data.table.tableNumber}.` : 'Table assignment cleared.',
      );
      hideSidePane();
    }
  }, [isSuccess, data, hideSidePane]);

  const onSubmit = form.handleSubmit(async (values) => {
    if (!canAssign) return;
    try {
      await assignTable({ id: reservation.id, input: toReservationTableRequest(values) });
    } catch {
      // The mutation hook reports the error through useShowApiError; retain the picker for retry.
    }
  });

  return (
    <>
      <SheetHeader>
        <SheetTitle>{settings.title}</SheetTitle>
        <SheetDescription>{settings.description}</SheetDescription>
      </SheetHeader>

      <form id={FORM_ID} onSubmit={onSubmit} noValidate className="flex-1 overflow-y-auto px-4">
        <Field data-invalid={Boolean(errors.tableId)}>
          <FieldLabel htmlFor="reservation-table-id">Table</FieldLabel>
          <NativeSelect
            id="reservation-table-id"
            className="w-full"
            disabled={isPending || tables.isPending || tables.isError || !canAssign}
            aria-invalid={Boolean(errors.tableId)}
            aria-describedby="reservation-table-hint"
            {...form.register('tableId')}
          >
            <NativeSelectOption value="">Unassigned</NativeSelectOption>
            {currentTableMissing && (
              <NativeSelectOption value={reservation.tableId ?? ''} disabled>
                Current table {reservation.table?.tableNumber ?? ''} - unavailable for selection
              </NativeSelectOption>
            )}
            {options.map((table) => (
              <NativeSelectOption
                key={table.id}
                value={table.id}
                disabled={table.capacity < reservation.partySize}
              >
                {getAssignmentTableLabel(table, reservation.partySize)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldDescription id="reservation-table-hint">{settings.hint}</FieldDescription>
          <FieldError>{errors.tableId?.message}</FieldError>
          {tables.isPending && <p className="text-sm text-muted-foreground">Loading tables...</p>}
          {tables.isError && (
            <div className="space-y-2">
              <p role="alert" className="text-sm text-destructive">
                Unable to load tables.
              </p>
              <Button type="button" variant="outline" onClick={() => void tables.refetch()}>
                Try again
              </Button>
            </div>
          )}
          {tables.isSuccess && options.length === 0 && (
            <p className="text-sm text-muted-foreground">No active tables are available.</p>
          )}
        </Field>
      </form>

      <SheetFooter>
        <Button
          type="submit"
          form={FORM_ID}
          disabled={isPending || tables.isPending || tables.isError || !canAssign || !isDirty}
        >
          {isPending ? 'Saving...' : settings.submit}
        </Button>
        <Button type="button" variant="outline" disabled={isPending} onClick={onCancel}>
          Cancel
        </Button>
      </SheetFooter>
    </>
  );
}
