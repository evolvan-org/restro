'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type AddOrderItemRequest,
  addOrderItemRequestSchema,
  type MenuItem,
} from '@rms/api-contract';
import type { ReactElement } from 'react';
import { useForm } from 'react-hook-form';

import { DietMarker } from '@/components/AiScan/markers';
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
  const portions = item.variants.filter((variant) => variant.isActive);
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AddOrderItemRequest>({
    resolver: zodResolver(addOrderItemRequestSchema),
    defaultValues: {
      menuItemId: item.id,
      quantity: 1,
      specialInstructions: '',
      ...(portions.length && { variantId: portions[portions.length - 1]!.id }),
    },
  });
  const variantId = watch('variantId');
  const isSaving = isPending || isSubmitting;
  const submit = handleSubmit(async (input) => {
    if (portions.length && !input.variantId) {
      setError('variantId', { message: 'Choose a portion' });
      return;
    }
    try {
      await onAdd(input);
      onClose();
    } catch {
      // The request hook reports errors; preserve entered values for correction or retry.
    }
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isSaving) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DietMarker diet={item.dietType} showLabel={false} />
            Add {item.name}
          </DialogTitle>
          <DialogDescription>
            {portions.length
              ? `Portions: ${portions.map((portion) => `${portion.name} ${portion.price}`).join(' · ')}.`
              : `Menu price: ${item.price}.`}{' '}
            Adding an item already on the order with the same note increases its quantity, and only
            the new units go to the kitchen. The current menu price is confirmed when added.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          {portions.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Portion</legend>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Portion">
                {portions.map((portion) => (
                  <button
                    key={portion.id}
                    type="button"
                    role="radio"
                    aria-checked={variantId === portion.id}
                    disabled={isSaving}
                    onClick={() => setValue('variantId', portion.id, { shouldValidate: true })}
                    className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm font-semibold ${
                      variantId === portion.id
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background'
                    }`}
                  >
                    {portion.name}
                    <span className="font-normal tabular-nums">{portion.price}</span>
                  </button>
                ))}
              </div>
              <FieldError id="add-item-variant-error">{errors.variantId?.message}</FieldError>
            </fieldset>
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
