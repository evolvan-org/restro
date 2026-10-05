'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type CreateDiningSectionRequest,
  createDiningSectionRequestSchema,
  type DiningSection,
  type UpdateDiningSectionRequest,
  updateDiningSectionRequestSchema,
} from '@rms/api-contract';
import { type ReactElement, useEffect } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
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

type DiningSectionFormConfig = {
  title: string;
  submitLabel: string;
  orderHint: string;
  schema: typeof createDiningSectionRequestSchema | typeof updateDiningSectionRequestSchema;
  defaultValues: CreateDiningSectionRequest;
};

function mapDiningSectionForm(section?: DiningSection): DiningSectionFormConfig {
  if (section) {
    return {
      title: 'Edit dining section',
      submitLabel: 'Save changes',
      orderHint: 'Zero appears first.',
      schema: updateDiningSectionRequestSchema,
      defaultValues: {
        name: section.name,
        description: section.description ?? '',
        sortOrder: section.sortOrder,
      },
    };
  }

  return {
    title: 'Add dining section',
    submitLabel: 'Create section',
    orderHint: 'Optional. Leave blank to add it at the end.',
    schema: createDiningSectionRequestSchema,
    defaultValues: { name: '', description: '' },
  };
}

export default function DiningSectionFormSidePane({
  section,
  onCancel,
}: DiningSectionFormSidePaneProps): ReactElement {
  const config = mapDiningSectionForm(section);
  const {
    mutateAsync: createSection,
    isPending: isCreating,
    isSuccess: isCreated,
  } = useCreateDiningSection();
  const {
    mutateAsync: updateSection,
    isPending: isUpdating,
    isSuccess: isUpdated,
  } = useUpdateDiningSection();
  const hideSidePane = useHideSidePane();

  const form = useForm<CreateDiningSectionRequest>({
    resolver: zodResolver(config.schema),
    defaultValues: config.defaultValues,
  });
  const { errors } = form.formState;
  const sortOrderField = form.register('sortOrder', {
    setValueAs: (value: string) => (value === '' ? undefined : Number(value)),
  });

  useEffect(() => {
    if (isCreated || isUpdated) {
      hideSidePane();
    }
  }, [isCreated, isUpdated, hideSidePane]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (section) {
        const input: UpdateDiningSectionRequest = {
          ...values,
          sortOrder: values.sortOrder ?? section.sortOrder,
        };
        await updateSection({ id: section.id, input });
      } else {
        await createSection(values);
      }
    } catch {
      // The mutation hook reports the error through useShowApiError; keep the form open.
    }
  });

  const isSaving = isCreating || isUpdating;

  return (
    <>
      <SheetHeader>
        <SheetTitle>{config.title}</SheetTitle>
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
            <FieldDescription>{config.orderHint}</FieldDescription>
            <FieldError>{errors.sortOrder?.message}</FieldError>
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
