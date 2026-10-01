'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type CreateTableStatusRequest,
  createTableStatusRequestSchema,
  type TableStatus,
  updateTableStatusRequestSchema,
} from '@rms/api-contract';
import { type ReactElement, useEffect } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useCreateTableStatus, useUpdateTableStatus } from '@/services/api/requests/table-statuses';
import { useHideSidePane } from '@/store/hooks/sidepane';

export type TableStatusFormSidePaneProps = {
  status?: TableStatus;
  onCancel?: () => void;
};

const FORM_ID = 'table-status-form';

type TableStatusFormConfig = {
  title: string;
  description: string;
  codeHint: string;
  submitLabel: string;
  schema: typeof createTableStatusRequestSchema | typeof updateTableStatusRequestSchema;
  defaultValues: CreateTableStatusRequest;
};

function mapTableStatusForm(status?: TableStatus): TableStatusFormConfig {
  if (status) {
    return {
      title: 'Edit table status',
      description: 'Update the status code and name.',
      codeHint: status.isSystem
        ? 'System status codes cannot be changed.'
        : 'A unique machine-readable code, saved in uppercase.',
      submitLabel: 'Save changes',
      schema: updateTableStatusRequestSchema,
      defaultValues: { code: status.code, name: status.name },
    };
  }

  return {
    title: 'Add table status',
    description: 'Create a status your team can assign to tables.',
    codeHint: 'A unique machine-readable code, saved in uppercase.',
    submitLabel: 'Create status',
    schema: createTableStatusRequestSchema,
    defaultValues: { code: '', name: '' },
  };
}

export default function TableStatusFormSidePane({
  status,
  onCancel,
}: TableStatusFormSidePaneProps): ReactElement {
  const config = mapTableStatusForm(status);
  const createStatus = useCreateTableStatus();
  const updateStatus = useUpdateTableStatus();
  const hideSidePane = useHideSidePane();
  const form = useForm<CreateTableStatusRequest>({
    resolver: zodResolver(config.schema),
    defaultValues: config.defaultValues,
  });
  const { errors } = form.formState;

  useEffect(() => {
    if (createStatus.isSuccess || updateStatus.isSuccess) {
      hideSidePane();
    }
  }, [createStatus.isSuccess, updateStatus.isSuccess, hideSidePane]);

  const onSubmit = form.handleSubmit((values) => {
    if (status) {
      updateStatus.mutate({ id: status.id, input: values });
    } else {
      createStatus.mutate(values);
    }
  });

  const isSaving = createStatus.isPending || updateStatus.isPending;

  return (
    <>
      <SheetHeader>
        <SheetTitle>{config.title}</SheetTitle>
        <SheetDescription>{config.description}</SheetDescription>
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
            <FieldDescription>{config.codeHint}</FieldDescription>
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
        </FieldGroup>
      </form>

      <SheetFooter>
        <Button type="submit" form={FORM_ID} disabled={isSaving}>
          {isSaving ? 'Saving…' : config.submitLabel}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </SheetFooter>
    </>
  );
}
