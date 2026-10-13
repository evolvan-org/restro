'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type CategoryType,
  type CreateMenuItemRequest,
  createMenuItemRequestSchema,
  type MenuItem,
  type Unit,
} from '@rms/api-contract';
import { Plus, Trash2 } from 'lucide-react';
import { type ReactElement, useEffect } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { useMenuCategories } from '@/services/api/requests/menu-categories';
import {
  useCreateMenuItem,
  useStockItems,
  useUpdateMenuItem,
} from '@/services/api/requests/menu-items';
import { useHideSidePane } from '@/store/hooks/sidepane';

export type MenuItemFormSidePaneProps = {
  item?: MenuItem;
  onCancel?: () => void;
};

const FORM_ID = 'menu-item-form';

const ITEM_TYPE_OPTIONS: { value: CategoryType; label: string }[] = [
  { value: 'FOOD', label: 'Food' },
  { value: 'BAR', label: 'Bar' },
];

const UNIT_OPTIONS: { value: Unit; label: string }[] = [
  { value: 'G', label: 'g' },
  { value: 'KG', label: 'kg' },
  { value: 'ML', label: 'ml' },
  { value: 'L', label: 'l' },
  { value: 'UNIT', label: 'unit' },
];

const EMPTY_ROW = { stockItemId: '', quantity: '', unit: 'G' as Unit };

export default function MenuItemFormSidePane({
  item,
  onCancel,
}: MenuItemFormSidePaneProps): ReactElement {
  const {
    mutateAsync: createItem,
    isPending: isCreating,
    isSuccess: isCreated,
  } = useCreateMenuItem();
  const {
    mutateAsync: updateItem,
    isPending: isUpdating,
    isSuccess: isUpdated,
  } = useUpdateMenuItem();
  const hideSidePane = useHideSidePane();
  const categories = useMenuCategories(true);
  const stockItems = useStockItems(true);

  const form = useForm<CreateMenuItemRequest>({
    resolver: zodResolver(createMenuItemRequestSchema),
    defaultValues: item
      ? {
          categoryId: item.categoryId,
          name: item.name,
          description: item.description ?? '',
          price: Number(item.price),
          itemType: item.itemType,
          isAvailable: item.isAvailable,
          recipe: item.recipe.map((row) => ({
            stockItemId: row.stockItem.id,
            quantity: row.quantity,
            unit: row.unit,
          })),
        }
      : {
          categoryId: '',
          name: '',
          description: '',
          itemType: 'FOOD',
          isAvailable: true,
          recipe: [{ ...EMPTY_ROW }],
        },
  });
  const { errors } = form.formState;
  const recipe = useFieldArray({ control: form.control, name: 'recipe' });
  const priceField = form.register('price', {
    setValueAs: (value: string | number) => (value === '' ? undefined : Number(value)),
  });

  useEffect(() => {
    if (isCreated || isUpdated) hideSidePane();
  }, [isCreated, isUpdated, hideSidePane]);

  const onSubmit = form.handleSubmit(async (values) => {
    const input = { ...values, description: values.description || undefined };
    try {
      if (item) {
        await updateItem({
          id: item.id,
          input: { ...input, description: values.description || null },
        });
      } else {
        await createItem(input);
      }
    } catch {
      // The mutation hook reports the error through useShowApiError; keep the form open.
    }
  });

  const isSaving = isCreating || isUpdating;
  // A soft-deleted-from-master or inactive category can't be picked, but an edited item may still sit in one.
  const categoryOptions = (categories.data ?? []).filter(
    (category) => category.isActive || category.id === item?.categoryId,
  );
  const stockOptions = (stockItems.data ?? []).map((stock) => ({
    value: stock.id,
    label: stock.name,
  }));
  const pickedIds = new Set(form.watch('recipe').map((row) => row.stockItemId));
  const recipeError = errors.recipe?.root?.message ?? errors.recipe?.message;

  return (
    <>
      <SheetHeader>
        <SheetTitle>{item ? 'Edit menu item' : 'Add menu item'}</SheetTitle>
        <SheetDescription>
          Every item needs a recipe built from your ingredient list. Saving does not change stock.
        </SheetDescription>
      </SheetHeader>

      <form
        id={FORM_ID}
        onSubmit={onSubmit}
        noValidate
        className="flex-1 overflow-y-auto px-4 pb-48"
      >
        <FieldGroup>
          <Field data-invalid={Boolean(errors.name)}>
            <FieldLabel htmlFor="item-name">Name</FieldLabel>
            <Input
              id="item-name"
              autoComplete="off"
              aria-invalid={Boolean(errors.name)}
              {...form.register('name')}
            />
            <FieldError>{errors.name?.message}</FieldError>
          </Field>

          <Field data-invalid={Boolean(errors.categoryId)}>
            <FieldLabel htmlFor="item-category">Category</FieldLabel>
            <Controller
              control={form.control}
              name="categoryId"
              render={({ field }) => (
                <SearchableSelect
                  id="item-category"
                  placeholder="Search or select a category"
                  value={field.value}
                  onChange={field.onChange}
                  aria-invalid={Boolean(errors.categoryId)}
                  options={categoryOptions.map((category) => ({
                    value: category.id,
                    label: category.name,
                  }))}
                />
              )}
            />
            <FieldError>{errors.categoryId?.message}</FieldError>
          </Field>

          <Field data-invalid={Boolean(errors.description)}>
            <FieldLabel htmlFor="item-description">Description</FieldLabel>
            <Textarea
              id="item-description"
              rows={2}
              aria-invalid={Boolean(errors.description)}
              {...form.register('description')}
            />
            <FieldError>{errors.description?.message}</FieldError>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field data-invalid={Boolean(errors.price)}>
              <FieldLabel htmlFor="item-price">Price</FieldLabel>
              <Input
                id="item-price"
                type="text"
                inputMode="decimal"
                aria-invalid={Boolean(errors.price)}
                {...priceField}
              />
              <FieldError>{errors.price?.message}</FieldError>
            </Field>

            <Field data-invalid={Boolean(errors.itemType)}>
              <FieldLabel htmlFor="item-type">Type</FieldLabel>
              <NativeSelect
                id="item-type"
                aria-invalid={Boolean(errors.itemType)}
                {...form.register('itemType')}
              >
                {ITEM_TYPE_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
              <FieldError>{errors.itemType?.message}</FieldError>
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...form.register('isAvailable')} />
            Available for ordering
          </label>

          <fieldset className="space-y-3">
            <div className="flex items-center justify-between">
              <legend className="text-sm font-medium">Recipe</legend>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="Add ingredient"
                onClick={() => recipe.append({ ...EMPTY_ROW })}
              >
                <Plus aria-hidden />
                Add ingredient
              </Button>
            </div>
            <FieldDescription>Ingredients come from the stock list only.</FieldDescription>

            {recipe.fields.map((field, index) => {
              const rowErrors = errors.recipe?.[index];
              return (
                <div key={field.id} className="space-y-2 rounded-md border bg-muted/30 p-3">
                  <Controller
                    control={form.control}
                    name={`recipe.${index}.stockItemId`}
                    render={({ field: stockField }) => (
                      <SearchableSelect
                        aria-label={`Ingredient ${index + 1}`}
                        placeholder="Search ingredient…"
                        value={stockField.value}
                        onChange={stockField.onChange}
                        aria-invalid={Boolean(rowErrors?.stockItemId)}
                        options={stockOptions.filter(
                          (option) =>
                            option.value === stockField.value || !pickedIds.has(option.value),
                        )}
                      />
                    )}
                  />
                  <div className="grid grid-cols-[1fr_6rem_auto] items-start gap-2">
                    <Input
                      aria-label={`Quantity ${index + 1}`}
                      inputMode="decimal"
                      placeholder="Quantity"
                      autoComplete="off"
                      aria-invalid={Boolean(rowErrors?.quantity)}
                      {...form.register(`recipe.${index}.quantity`)}
                    />
                    <NativeSelect
                      aria-label={`Unit ${index + 1}`}
                      {...form.register(`recipe.${index}.unit`)}
                    >
                      {UNIT_OPTIONS.map(({ value, label }) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </NativeSelect>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ingredient ${index + 1}`}
                      disabled={recipe.fields.length === 1}
                      onClick={() => recipe.remove(index)}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                  <FieldError>
                    {rowErrors?.stockItemId?.message ??
                      rowErrors?.quantity?.message ??
                      rowErrors?.unit?.message}
                  </FieldError>
                </div>
              );
            })}
            <FieldError>{recipeError}</FieldError>
          </fieldset>
        </FieldGroup>
      </form>

      <SheetFooter>
        <Button type="submit" form={FORM_ID} disabled={isSaving}>
          {isSaving ? 'Saving…' : item ? 'Save changes' : 'Create item'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </SheetFooter>
    </>
  );
}
