'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type CreateTableStatusRequest,
  createTableStatusRequestSchema,
  type TableStatus,
  type UpdateTableStatusRequest,
} from '@rms/api-contract';
import { type ReactElement, useState } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { getApiErrorMessage } from '@/lib/api-error';
import { useCreateTableStatus, useUpdateTableStatus } from '@/services/api/requests/table-statuses';
import { useHideSidePane } from '@/store/hooks/sidepane';

export type TableStatusFormSidePaneProps = {
  status?: TableStatus;
  onCancel?: () => void;
};

const FORM_ID = 'table-status-form';

export default function TableStatusFormSidePane({
  status,
  onCancel,
}: TableStatusFormSidePaneProps): ReactElement {
  const isEdit = status !== undefined;
  const createStatus = useCreateTableStatus();
  const updateStatus = useUpdateTableStatus();
  const hideSidePane = useHideSidePane();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const formSchema = isEdit
    ? createTableStatusRequestSchema.refine((values) => values.sortOrder !== undefined, {
        path: ['sortOrder'],
        message: 'Display order is required',
      })
    : createTableStatusRequestSchema;

  const form = useForm<CreateTableStatusRequest>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      code: status?.code ?? '',
      name: status?.name ?? '',
      sortOrder: status?.sortOrder,
    },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      if (status) {
        await updateStatus.mutateAsync({
          id: status.id,
          input: values as UpdateTableStatusRequest,
        });
      } else {
        await createStatus.mutateAsync(values);
      }
      hideSidePane();
    } catch (error) {
      setSubmitError(
        getApiErrorMessage(
          error,
          status ? 'Unable to update the table status.' : 'Unable to create the table status.',
        ),
      );
    }
  });

  const isSaving = createStatus.isPending || updateStatus.isPending;

  return (
    <>
      <SheetHeader>
        <SheetTitle>{isEdit ? 'Edit table status' : 'Add table status'}</SheetTitle>
        <SheetDescription>
          {isEdit
            ? 'Update the label and display position.'
            : 'Create a status your team can assign to tables.'}
        </SheetDescription>
      </SheetHeader>

      <form id={FORM_ID} onSubmit={onSubmit} noValidate className="flex-1 overflow-y-auto px-4">
        <FieldGroup>
          <Field data-invalid={Boolean(errors.code)}>
            <FieldLabel htmlFor="table-status-code">Code</FieldLabel>
            <Input
              id="table-status-code"
              autoComplete="off"
              readOnly={status?.isSystem}
              aria-readonly={status?.isSystem}
              aria-invalid={Boolean(errors.code)}
              {...form.register('code', {
                onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                  event.target.value = event.target.value.toUpperCase();
                },
              })}
            />
            <FieldDescription>
              {status?.isSystem
                ? 'System status codes cannot be changed.'
                : 'A unique machine-readable code, saved in uppercase.'}
            </FieldDescription>
            <FieldError>{errors.code?.message}</FieldError>
          </Field>

          <Field data-invalid={Boolean(errors.name)}>
            <FieldLabel htmlFor="table-status-name">Name</FieldLabel>
            <Input
              id="table-status-name"
              autoComplete="off"
              aria-invalid={Boolean(errors.name)}
              {...form.register('name')}
            />
            <FieldError>{errors.name?.message}</FieldError>
          </Field>

          <Field data-invalid={Boolean(errors.sortOrder)}>
            <FieldLabel htmlFor="table-status-order">Display order</FieldLabel>
            <Input
              id="table-status-order"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              aria-invalid={Boolean(errors.sortOrder)}
              {...form.register('sortOrder', {
                setValueAs: (value: string) => (value === '' ? undefined : Number(value)),
                onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                  event.target.value = event.target.value.replace(/\D/g, '');
                },
              })}
            />
            <FieldDescription>
              {isEdit
                ? 'Use a whole number starting at 0.'
                : 'Optional. Leave blank to add at the end.'}
            </FieldDescription>
            <FieldError>{errors.sortOrder?.message}</FieldError>
          </Field>

          {submitError ? (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {submitError}
            </p>
          ) : null}
        </FieldGroup>
      </form>

      <SheetFooter>
        <Button type="submit" form={FORM_ID} disabled={isSaving}>
          {isSaving ? 'Saving…' : isEdit ? 'Save changes' : 'Create status'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </SheetFooter>
    </>
  );
}
