'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type CreateTableRequest,
  createTableRequestSchema,
  type RestaurantTable,
} from '@rms/api-contract';
import { type ReactElement, useEffect } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { getApiErrorMessage } from '@/lib/api-error';
import { useCreateTable, useTableOptions, useUpdateTable } from '@/services/api/requests/tables';
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
  const {
    mutateAsync: createTable,
    isPending: isCreating,
    isSuccess: isCreated,
  } = useCreateTable();
  const {
    mutateAsync: updateTable,
    isPending: isUpdating,
    isSuccess: isUpdated,
  } = useUpdateTable();
  const hideSidePane = useHideSidePane();

  const form = useForm<CreateTableRequest>({
    resolver: zodResolver(createTableRequestSchema),
    defaultValues: {
      tableNumber: table?.tableNumber ?? '',
      capacity: table?.capacity ?? 2,
      sectionId: table?.section.id ?? '',
      currentStatusId: table?.currentStatus.id ?? '',
    },
  });
  const { errors } = form.formState;

  useEffect(() => {
    if (isCreated || isUpdated) {
      hideSidePane();
    }
  }, [isCreated, isUpdated, hideSidePane]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (table) {
        await updateTable({ id: table.id, input: values });
      } else {
        await createTable(values);
      }
    } catch {
      // The request hook reports the error; keep the form open for correction or retry.
    }
  });

  const isSaving = isCreating || isUpdating;
  const sections = options.data?.sections ?? [];
  const statuses = options.data?.statuses ?? [];
  const firstStatusId = statuses[0]?.id;

  useEffect(() => {
    if (!isEdit && firstStatusId && !form.getValues('currentStatusId')) {
      form.setValue('currentStatusId', firstStatusId);
    }
  }, [isEdit, firstStatusId, form]);

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
              disabled={options.isPending}
              aria-invalid={Boolean(errors.currentStatusId)}
              {...form.register('currentStatusId')}
            >
              <NativeSelectOption value="" disabled>
                {options.isPending ? 'Loading statuses...' : 'Select a status'}
              </NativeSelectOption>
              {statuses.map((status) => (
                <NativeSelectOption key={status.id} value={status.id}>
                  {status.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <FieldError>{errors.currentStatusId?.message}</FieldError>
          </Field>

          {options.isError ? (
            <p role="alert" className="rounded-md border px-3 py-2 text-sm text-destructive">
              {getApiErrorMessage(options.error, 'Unable to load table options.')}
            </p>
          ) : null}
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
