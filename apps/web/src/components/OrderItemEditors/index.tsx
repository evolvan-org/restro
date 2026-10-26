'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type OrderItem,
  type UpdateOrderItemInstructionsRequest,
  updateOrderItemInstructionsRequestSchema,
  type UpdateOrderItemQuantityRequest,
  updateOrderItemQuantityRequestSchema,
} from '@rms/api-contract';
import { type ReactElement, type Ref, useEffect, useImperativeHandle, useRef } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export type OrderItemEditorsHandle = {
  save: () => Promise<boolean>;
};

type Props = {
  ref?: Ref<OrderItemEditorsHandle>;
  item: OrderItem;
  disabled: boolean;
  onQuantity: (input: UpdateOrderItemQuantityRequest) => Promise<void>;
  onInstructions: (input: UpdateOrderItemInstructionsRequest) => Promise<void>;
};

export default function OrderItemEditors({
  ref,
  item,
  disabled,
  onQuantity,
  onInstructions,
}: Props): ReactElement {
  const minQuantity = Math.max(1, item.sentQuantity);
  const quantity = useForm<UpdateOrderItemQuantityRequest>({
    resolver: zodResolver(
      updateOrderItemQuantityRequestSchema.extend({
        quantity: updateOrderItemQuantityRequestSchema.shape.quantity.min(
          minQuantity,
          `Quantity must be at least ${minQuantity}; these units have already been sent`,
        ),
      }),
    ),
    defaultValues: { quantity: item.quantity },
  });
  const instructions = useForm<UpdateOrderItemInstructionsRequest>({
    resolver: zodResolver(updateOrderItemInstructionsRequestSchema),
    defaultValues: { specialInstructions: item.specialInstructions ?? '' },
  });
  const { reset: resetQuantity } = quantity;
  const { reset: resetInstructions } = instructions;
  useEffect(() => {
    resetQuantity({ quantity: item.quantity });
  }, [item.quantity, resetQuantity]);
  useEffect(() => {
    resetInstructions({ specialInstructions: item.specialInstructions ?? '' });
  }, [item.specialInstructions, resetInstructions]);
  const busy = disabled || quantity.formState.isSubmitting || instructions.formState.isSubmitting;
  const quantitySave = useRef<Promise<boolean> | null>(null);
  const instructionsSave = useRef<Promise<boolean> | null>(null);

  async function saveQuantity(): Promise<boolean> {
    if (quantitySave.current) return quantitySave.current;
    if (!quantity.getFieldState('quantity').isDirty) return true;
    const pending = (async (): Promise<boolean> => {
      let saved = false;
      await quantity.handleSubmit(async (input) => {
        try {
          await onQuantity(input);
          quantity.reset(input);
          saved = true;
        } catch {
          // The request hook reports the failure. Retain the draft and block sending.
        }
      })();
      return saved;
    })();
    quantitySave.current = pending;
    try {
      return await pending;
    } finally {
      quantitySave.current = null;
    }
  }
  // Units already on a KOT cannot be taken back, so the line may only grow past them.
  const step = (delta: number): void => {
    const value = quantity.getValues('quantity');
    if (!Number.isInteger(value) || value + delta < minQuantity || value + delta > 2147483647)
      return;
    quantity.setValue('quantity', value + delta, { shouldDirty: true });
    void saveQuantity();
  };
  async function saveInstructions(): Promise<boolean> {
    if (instructionsSave.current) return instructionsSave.current;
    if (!instructions.getFieldState('specialInstructions').isDirty) return true;
    const pending = (async (): Promise<boolean> => {
      let saved = false;
      await instructions.handleSubmit(async (input) => {
        try {
          await onInstructions(input);
          instructions.reset({ specialInstructions: input.specialInstructions ?? '' });
          saved = true;
        } catch {
          // The request hook reports the failure. Retain the draft and block sending.
        }
      })();
      return saved;
    })();
    instructionsSave.current = pending;
    try {
      return await pending;
    } finally {
      instructionsSave.current = null;
    }
  }

  useImperativeHandle(ref, () => ({
    save: async () => {
      if (!(await saveQuantity())) return false;
      return item.sentQuantity === 0 ? saveInstructions() : true;
    },
  }));
  const draftQuantity = quantity.watch('quantity');
  const quantityField = quantity.register('quantity', { valueAsNumber: true });
  const instructionsField = instructions.register('specialInstructions');

  return (
    <div className="space-y-3 py-2">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void saveQuantity();
        }}
        noValidate
        className="space-y-1"
      >
        <label htmlFor={`quantity-${item.id}`} className="text-xs font-medium">
          Quantity
        </label>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            disabled={busy || !Number.isInteger(draftQuantity) || draftQuantity <= minQuantity}
            aria-label={`Decrease quantity of ${item.name}`}
            onClick={() => step(-1)}
          >
            −
          </Button>
          <Input
            id={`quantity-${item.id}`}
            type="number"
            min={minQuantity}
            max={2147483647}
            step={1}
            className="h-8 w-16"
            disabled={busy}
            aria-invalid={Boolean(quantity.formState.errors.quantity)}
            aria-describedby={`quantity-error-${item.id}`}
            {...quantityField}
            onBlur={(event) => {
              void quantityField.onBlur(event);
              if (quantity.formState.isDirty && !busy) void saveQuantity();
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            disabled={busy || !Number.isInteger(draftQuantity) || draftQuantity >= 2147483647}
            aria-label={`Increase quantity of ${item.name}`}
            onClick={() => step(1)}
          >
            +
          </Button>
          <Button
            type="submit"
            size="sm"
            variant="ghost"
            disabled={busy || !quantity.formState.isDirty}
          >
            Save
          </Button>
        </div>
        <FieldError id={`quantity-error-${item.id}`}>
          {quantity.formState.errors.quantity?.message}
        </FieldError>
      </form>
      {item.sentQuantity === 0 && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void saveInstructions();
          }}
          noValidate
          className="space-y-1"
        >
          <label htmlFor={`instructions-${item.id}`} className="text-xs font-medium">
            Special instructions
          </label>
          <Textarea
            id={`instructions-${item.id}`}
            rows={2}
            maxLength={255}
            disabled={busy}
            placeholder="e.g. No onions"
            aria-invalid={Boolean(instructions.formState.errors.specialInstructions)}
            aria-describedby={`instructions-error-${item.id}`}
            {...instructionsField}
            onBlur={(event) => {
              void instructionsField.onBlur(event);
              // Persist a pending note on blur so sending to the kitchen never drops it.
              if (instructions.formState.isDirty && !busy) void saveInstructions();
            }}
          />
          <FieldError id={`instructions-error-${item.id}`}>
            {instructions.formState.errors.specialInstructions?.message}
          </FieldError>
          <div className="flex gap-1">
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={busy || !instructions.formState.isDirty}
            >
              Save note
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy || !instructions.watch('specialInstructions')}
              onClick={() => {
                instructions.setValue('specialInstructions', null, { shouldDirty: true });
                void saveInstructions();
              }}
            >
              Clear note
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
