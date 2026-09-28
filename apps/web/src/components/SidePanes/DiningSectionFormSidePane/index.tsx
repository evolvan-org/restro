'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type CreateDiningSectionRequest,
  createDiningSectionRequestSchema,
  type DiningSection,
  type UpdateDiningSectionRequest,
  updateDiningSectionRequestSchema,
} from '@rms/api-contract';
import { type ReactElement, useState } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { getApiErrorMessage } from '@/lib/api-error';
import {
  useCreateDiningSection,
  useUpdateDiningSection,
} from '@/services/api/requests/dining-sections';
import { useHideSidePane } from '@/store/hooks/sidepane';

export type DiningSectionFormSidePaneProps = {
  section?: DiningSection;
  onCancel?: () => void;
};

const FORM_ID = 'dining-section-form';

export default function DiningSectionFormSidePane({
  section,
  onCancel,
}: DiningSectionFormSidePaneProps): ReactElement {
  const isEdit = section !== undefined;
  const createSection = useCreateDiningSection();
  const updateSection = useUpdateDiningSection();
  const hideSidePane = useHideSidePane();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<CreateDiningSectionRequest>({
    resolver: zodResolver(
      isEdit ? updateDiningSectionRequestSchema : createDiningSectionRequestSchema,
    ),
    defaultValues: {
      name: section?.name ?? '',
      description: section?.description ?? '',
      sortOrder: section?.sortOrder,
    },
  });
  const { errors } = form.formState;
  const sortOrderField = form.register('sortOrder', {
    setValueAs: (value: string) => (value === '' ? undefined : Number(value)),
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      if (section) {
        const input: UpdateDiningSectionRequest = {
          ...values,
          sortOrder: values.sortOrder ?? section.sortOrder,
        };
        await updateSection.mutateAsync({ id: section.id, input });
      } else {
        await createSection.mutateAsync(values);
      }
      hideSidePane();
    } catch (error) {
      setSubmitError(
        getApiErrorMessage(
          error,
          isEdit ? 'Unable to update the dining section.' : 'Unable to create the dining section.',
        ),
      );
    }
  });

  const isSaving = createSection.isPending || updateSection.isPending;

  return (
    <>
      <SheetHeader>
        <SheetTitle>{isEdit ? 'Edit dining section' : 'Add dining section'}</SheetTitle>
        <SheetDescription>
          Organize tables into areas such as Indoor, Patio, Rooftop, or Bar.
        </SheetDescription>
      </SheetHeader>

      <form id={FORM_ID} onSubmit={onSubmit} noValidate className="flex-1 overflow-y-auto px-4">
        <FieldGroup>
          <Field data-invalid={Boolean(errors.name)}>
            <FieldLabel htmlFor="section-name">Name</FieldLabel>
            <Input
              id="section-name"
              autoComplete="off"
              aria-invalid={Boolean(errors.name)}
              {...form.register('name')}
            />
            <FieldDescription>Must be unique within your restaurant.</FieldDescription>
            <FieldError>{errors.name?.message}</FieldError>
          </Field>

          <Field data-invalid={Boolean(errors.description)}>
            <FieldLabel htmlFor="section-description">Description</FieldLabel>
            <Input
              id="section-description"
              autoComplete="off"
              aria-invalid={Boolean(errors.description)}
              {...form.register('description')}
            />
            <FieldDescription>Optional, up to 255 characters.</FieldDescription>
            <FieldError>{errors.description?.message}</FieldError>
          </Field>

          <Field data-invalid={Boolean(errors.sortOrder)}>
            <FieldLabel htmlFor="section-sort-order">Display order</FieldLabel>
            <Input
              id="section-sort-order"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              aria-invalid={Boolean(errors.sortOrder)}
              {...sortOrderField}
              onChange={(event) => {
                event.target.value = event.target.value.replace(/\D/g, '');
                void sortOrderField.onChange(event);
              }}
            />
            <FieldDescription>
              {isEdit ? 'Zero appears first.' : 'Optional. Leave blank to add it at the end.'}
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
          {isSaving ? 'Saving…' : isEdit ? 'Save changes' : 'Create section'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </SheetFooter>
    </>
  );
}
