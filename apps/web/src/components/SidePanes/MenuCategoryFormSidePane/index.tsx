'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type CategoryType,
  type CreateMenuCategoryRequest,
  createMenuCategoryRequestSchema,
  type MenuCategory,
} from '@rms/api-contract';
import { type ReactElement, useEffect } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  useCreateMenuCategory,
  useUpdateMenuCategory,
} from '@/services/api/requests/menu-categories';
import { useHideSidePane } from '@/store/hooks/sidepane';

export type MenuCategoryFormSidePaneProps = {
  category?: MenuCategory;
  onCancel?: () => void;
};

const FORM_ID = 'menu-category-form';

const CATEGORY_TYPE_OPTIONS: { value: CategoryType; label: string }[] = [
  { value: 'FOOD', label: 'Food' },
  { value: 'BAR', label: 'Bar' },
];

export default function MenuCategoryFormSidePane({
  category,
  onCancel,
}: MenuCategoryFormSidePaneProps): ReactElement {
  const {
    mutateAsync: createCategory,
    isPending: isCreating,
    isSuccess: isCreated,
  } = useCreateMenuCategory();
  const {
    mutateAsync: updateCategory,
    isPending: isUpdating,
    isSuccess: isUpdated,
  } = useUpdateMenuCategory();
  const hideSidePane = useHideSidePane();

  // The create schema also validates edits: name and type are always present in this form.
  const form = useForm<CreateMenuCategoryRequest>({
    resolver: zodResolver(createMenuCategoryRequestSchema),
    defaultValues: category
      ? { name: category.name, categoryType: category.categoryType, sortOrder: category.sortOrder }
      : { name: '', categoryType: 'FOOD' },
  });
  const { errors } = form.formState;
  const sortOrderField = form.register('sortOrder', {
    setValueAs: (value: string) => (value === '' ? undefined : Number(value)),
  });

  useEffect(() => {
    if (isCreated || isUpdated) hideSidePane();
  }, [isCreated, isUpdated, hideSidePane]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (category) {
        await updateCategory({
          id: category.id,
          input: { ...values, sortOrder: values.sortOrder ?? category.sortOrder },
        });
      } else {
        await createCategory(values);
      }
    } catch {
      // The mutation hook reports the error through useShowApiError; keep the form open.
    }
  });

  const isSaving = isCreating || isUpdating;

  return (
    <>
      <SheetHeader>
        <SheetTitle>{category ? 'Edit menu category' : 'Add menu category'}</SheetTitle>
        <SheetDescription>
          Categories group menu items, such as Starters, Mains, or Cocktails.
        </SheetDescription>
      </SheetHeader>

      <form id={FORM_ID} onSubmit={onSubmit} noValidate className="flex-1 overflow-y-auto px-4">
        <FieldGroup>
          <Field data-invalid={Boolean(errors.name)}>
            <FieldLabel htmlFor="category-name">Name</FieldLabel>
            <Input
              id="category-name"
              autoComplete="off"
              aria-invalid={Boolean(errors.name)}
              {...form.register('name')}
            />
            <FieldDescription>Must be unique within your restaurant.</FieldDescription>
            <FieldError>{errors.name?.message}</FieldError>
          </Field>

          <Field data-invalid={Boolean(errors.categoryType)}>
            <FieldLabel htmlFor="category-type">Type</FieldLabel>
            <NativeSelect
              id="category-type"
              aria-invalid={Boolean(errors.categoryType)}
              {...form.register('categoryType')}
            >
              {CATEGORY_TYPE_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
            <FieldDescription>Food goes to the kitchen, bar items to the bar.</FieldDescription>
            <FieldError>{errors.categoryType?.message}</FieldError>
          </Field>

          <Field data-invalid={Boolean(errors.sortOrder)}>
            <FieldLabel htmlFor="category-sort-order">Display order</FieldLabel>
            <Input
              id="category-sort-order"
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
              {category ? 'Zero appears first.' : 'Optional. Leave blank to add it at the end.'}
            </FieldDescription>
            <FieldError>{errors.sortOrder?.message}</FieldError>
          </Field>
        </FieldGroup>
      </form>

      <SheetFooter>
        <Button type="submit" form={FORM_ID} disabled={isSaving}>
          {isSaving ? 'Saving…' : category ? 'Save changes' : 'Create category'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </SheetFooter>
    </>
  );
}
