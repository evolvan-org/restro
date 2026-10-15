'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type CreateTableRequest,
  createTableRequestSchema,
  type RestaurantTable,
} from '@rms/api-contract';
import { Permission } from '@rms/permissions';
import { isTableStatusCode, isTableStatusTransitionAllowed } from '@rms/shared';
import { type ReactElement } from 'react';
import { type Resolver, useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import usePermissions from '@/hooks/auth/usePermissions';
import { getApiErrorMessage } from '@/lib/api-error';
import {
  useCreateTable,
  useTableOptions,
  useTransitionTableStatus,
  useUpdateTable,
} from '@/services/api/requests/tables';
import { useHideSidePane } from '@/store/hooks/sidepane';

export type TableFormSidePaneProps = {
  table?: RestaurantTable;
  onCancel?: () => void;
};

const FORM_ID = 'table-form';

export default function TableFormSidePane({
  table,
  onCancel,
}: TableFormSidePaneProps): ReactElement {
  const isEdit = table !== undefined;
  const options = useTableOptions(true);
  const { mutateAsync: createTable, isPending: isCreating } = useCreateTable();
  const { mutateAsync: updateTable, isPending: isUpdating } = useUpdateTable();
  const { mutateAsync: transitionStatus, isPending: isChangingStatus } = useTransitionTableStatus();
  const { can } = usePermissions();
  const canChangeStatus = can(Permission.TABLE_UPDATE_STATUS);
  const hideSidePane = useHideSidePane();

  const form = useForm<CreateTableRequest>({
    // Validate the full form; submit configuration and status using their separate contracts.
    resolver: zodResolver(createTableRequestSchema) as Resolver<CreateTableRequest>,
    defaultValues: {
      tableNumber: table?.tableNumber ?? '',
      capacity: table?.capacity ?? 2,
      sectionId: table?.section.id ?? '',
      currentStatusId: table?.currentStatus.id ?? '',
    },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    let detailsSaved = false;
    try {
      if (table) {
        const { currentStatusId, ...details } = values;
        const statusChanged = currentStatusId !== table.currentStatus.id;
        const target = options.data?.statuses.find((status) => status.id === currentStatusId);
        if (
          statusChanged &&
          (!canChangeStatus ||
            !target ||
            !isTableStatusCode(target.code) ||
            !isTableStatusTransitionAllowed(table.currentStatus.code, target.code))
        ) {
          form.setError('currentStatusId', { message: 'Select an allowed status.' });
          return;
        }
        const configurationChanged =
          details.tableNumber !== table.tableNumber ||
          details.capacity !== table.capacity ||
          details.sectionId !== table.section.id;
        let currentStatus = table.currentStatus;
        if (configurationChanged) {
          const updated = await updateTable({ id: table.id, input: details });
          currentStatus = updated.currentStatus;
          detailsSaved = true;
        }
        if (
          statusChanged &&
          target &&
          isTableStatusCode(target.code) &&
          target.id !== currentStatus.id
        ) {
          await transitionStatus({ id: table.id, input: { statusCode: target.code } });
        }
      } else {
        await createTable(values);
      }
      hideSidePane();
    } catch (error) {
      const message = getApiErrorMessage(error, 'Unable to save the table.');
      form.setError('root', {
        message: detailsSaved
          ? `Table details saved, but the status change failed. ${message}`
          : message,
      });
    }
  });

  const isSaving = form.formState.isSubmitting || isCreating || isUpdating || isChangingStatus;
  const sections = options.data?.sections ?? [];
  const statuses = options.data?.statuses ?? [];
  const displayedStatuses = table
    ? [table.currentStatus, ...statuses.filter((status) => status.id !== table.currentStatus.id)]
    : statuses;

  return (
    <>
      <SheetHeader>
        <SheetTitle>{isEdit ? 'Edit table' : 'Add table'}</SheetTitle>
        <SheetDescription>
          {isEdit ? 'Update the table setup.' : 'Create a table for this restaurant floor.'}
        </SheetDescription>
      </SheetHeader>

      <form id={FORM_ID} onSubmit={onSubmit} noValidate className="flex-1 overflow-y-auto px-4">
        <FieldGroup>
          <Field data-invalid={Boolean(errors.tableNumber)}>
            <FieldLabel htmlFor="table-number">Table number</FieldLabel>
            <Input
              id="table-number"
              autoComplete="off"
              aria-invalid={Boolean(errors.tableNumber)}
              {...form.register('tableNumber')}
            />
            <FieldDescription>Must be unique in your restaurant.</FieldDescription>
            <FieldError>{errors.tableNumber?.message}</FieldError>
          </Field>

          <Field data-invalid={Boolean(errors.capacity)}>
            <FieldLabel htmlFor="table-capacity">Capacity</FieldLabel>
            <Input
              id="table-capacity"
              type="number"
              min={1}
              max={100}
              step={1}
              aria-invalid={Boolean(errors.capacity)}
              {...form.register('capacity', { valueAsNumber: true })}
            />
            <FieldError>{errors.capacity?.message}</FieldError>
          </Field>

          <Field data-invalid={Boolean(errors.sectionId)}>
            <FieldLabel htmlFor="table-section">Dining Section</FieldLabel>
            <NativeSelect
              id="table-section"
              className="w-full"
              disabled={options.isPending}
              aria-invalid={Boolean(errors.sectionId)}
              {...form.register('sectionId')}
            >
              <NativeSelectOption value="" disabled>
                {options.isPending ? 'Loading sections...' : 'Select Dining Section'}
              </NativeSelectOption>
              {sections.map((section) => (
                <NativeSelectOption key={section.id} value={section.id}>
                  {section.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <FieldError>{errors.sectionId?.message}</FieldError>
          </Field>

          <Field data-invalid={Boolean(errors.currentStatusId)}>
            <FieldLabel htmlFor="table-status">Status</FieldLabel>
            <NativeSelect
              id="table-status"
              className="w-full"
              disabled={options.isPending || (isEdit && !canChangeStatus)}
              aria-invalid={Boolean(errors.currentStatusId)}
              {...form.register('currentStatusId')}
            >
              <NativeSelectOption value="" disabled={isEdit}>
                {options.isPending ? 'Loading statuses...' : 'Use default status'}
              </NativeSelectOption>
              {displayedStatuses.map((status) => {
                const isUnavailable = Boolean(
                  table &&
                  status.id !== table.currentStatus.id &&
                  !isTableStatusTransitionAllowed(table.currentStatus.code, status.code),
                );
                return (
                  <NativeSelectOption key={status.id} value={status.id} disabled={isUnavailable}>
                    {status.name}
                    {isUnavailable ? ' (transition not allowed)' : ''}
                  </NativeSelectOption>
                );
              })}
            </NativeSelect>
            {isEdit && (
              <FieldDescription>
                All active statuses are shown. Only allowed transitions from the current status can
                be selected.
              </FieldDescription>
            )}
            <FieldError>{errors.currentStatusId?.message}</FieldError>
          </Field>

          {errors.root && (
            <p role="alert" className="text-sm text-destructive">
              {errors.root.message}
            </p>
          )}

          {options.isError && (
            <p role="alert" className="rounded-md border px-3 py-2 text-sm text-destructive">
              {getApiErrorMessage(options.error, 'Unable to load table options.')}
            </p>
          )}
        </FieldGroup>
      </form>

      <SheetFooter>
        <Button type="submit" form={FORM_ID} disabled={isSaving || options.isError}>
          {isSaving ? 'Saving...' : isEdit ? 'Save changes' : 'Create table'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </SheetFooter>
    </>
  );
}
