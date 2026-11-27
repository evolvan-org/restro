'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type AddOrderItemRequest,
  emptyMenuCustomizations,
  type MenuItem,
} from '@rms/api-contract';
import { type ReactElement, useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

import {
  getAddOrderItemDefaults,
  getAddOrderItemFormSchema,
  getOrderSelectionPricePreview,
} from './mappers';

type Props = {
  item: MenuItem;
  isPending: boolean;
  onAdd: (input: AddOrderItemRequest) => Promise<void>;
  onClose: () => void;
};

export default function AddOrderItemDialog({
  item,
  isPending,
  onAdd,
  onClose,
}: Props): ReactElement {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting, isSubmitSuccessful },
  } = useForm<AddOrderItemRequest>({
    resolver: zodResolver(getAddOrderItemFormSchema(item)),
    defaultValues: getAddOrderItemDefaults(item),
  });
  const config = item.customizations ?? emptyMenuCustomizations();
  const variantId = useWatch({ control, name: 'variantId' });
  const modifierIds = useWatch({ control, name: 'modifierIds' });
  const quantity = useWatch({ control, name: 'quantity' });
  const preview = getOrderSelectionPricePreview(item, variantId, modifierIds, quantity);
  const isSaving = isPending || isSubmitting;
  useEffect(() => {
    if (isSubmitSuccessful) onClose();
  }, [isSubmitSuccessful, onClose]);
  const submit = handleSubmit(async (input) => {
    await onAdd(input);
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isSaving) onClose();
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add {item.name}</DialogTitle>
          <DialogDescription>
            Standard price: {item.price}. Select sizes and extras below. The server confirms the
            current price and choices before adding. Identical choices and notes share one line.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            void submit(event).catch(() => {
              // The mutation hook reports failure. RHF retains drafts and keeps success false.
            });
          }}
          noValidate
          className="space-y-4"
        >
          {config.variants.length > 0 && (
            <label className="block space-y-2 text-sm font-medium">
              Size
              <select
                className="w-full rounded border p-2"
                disabled={isSaving}
                {...register('variantId', { setValueAs: (value: string) => value || undefined })}
              >
                <option value="">Standard · {item.price}</option>
                {config.variants.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.name} · {variant.price}
                  </option>
                ))}
              </select>
            </label>
          )}
          {config.groups.map((group) => (
            <fieldset key={group.id} className="space-y-2 rounded border p-3" disabled={isSaving}>
              <legend className="text-sm font-medium">{group.name}</legend>
              <p className="text-sm text-muted-foreground">
                Choose {group.minSelect} to {group.maxSelect}
              </p>
              {group.modifiers.map((option) => (
                <label key={option.id} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" value={option.id} {...register('modifierIds')} />
                  <span>
                    {option.name} ({option.priceAdjustment.startsWith('-') ? '' : '+'}
                    {option.priceAdjustment})
                  </span>
                </label>
              ))}
            </fieldset>
          ))}
          <FieldError>{errors.modifierIds?.message}</FieldError>
          {config.components.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Includes {config.components.reduce((sum, component) => sum + component.quantity, 0)}{' '}
              combo components in their standard portions. The combo price covers included items.
            </p>
          )}
          <div className="space-y-2">
            <label htmlFor="add-item-quantity" className="text-sm font-medium">
              Quantity
            </label>
            <Input
              id="add-item-quantity"
              type="number"
              min={1}
              max={2147483647}
              step={1}
              autoFocus
              disabled={isSaving}
              aria-invalid={Boolean(errors.quantity)}
              aria-describedby="add-item-quantity-error"
              {...register('quantity', { valueAsNumber: true })}
            />
            <FieldError id="add-item-quantity-error">{errors.quantity?.message}</FieldError>
          </div>
          {preview && (
            <p role="status" className="text-sm">
              Unit price {preview.unitPrice} · Line total {preview.total}
            </p>
          )}
          <div className="space-y-2">
            <label htmlFor="add-item-instructions" className="text-sm font-medium">
              Special instructions (optional)
            </label>
            <Textarea
              id="add-item-instructions"
              maxLength={255}
              disabled={isSaving}
              aria-invalid={Boolean(errors.specialInstructions)}
              aria-describedby="add-item-instructions-error"
              {...register('specialInstructions')}
            />
            <FieldError id="add-item-instructions-error">
              {errors.specialInstructions?.message}
            </FieldError>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={isSaving} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? 'Adding...' : 'Add to order'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
