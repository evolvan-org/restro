'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type Order,
  type OrderItem,
  type UpdateOrderItemQuantityRequest,
  updateOrderItemQuantityRequestSchema,
} from '@rms/api-contract';
import { Trash2 } from 'lucide-react';
import { type ReactElement, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';

import styles from './editable-line-items.module.css';

type Props = {
  order: Order;
  disabled: boolean;
  removingItemId?: string;
  onQuantity: (itemId: string, input: UpdateOrderItemQuantityRequest) => Promise<void>;
  onRemove: (itemId: string) => Promise<void>;
};

export default function EditableLineItems({
  order,
  disabled,
  removingItemId,
  onQuantity,
  onRemove,
}: Props): ReactElement {
  const items = order.items.filter((item) => item.status === 'ACTIVE');
  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col" className={styles.quantity}>
              Qty
            </th>
            <th scope="col" className={styles.unitPrice}>
              Unit price
            </th>
            <th scope="col" className={styles.amount}>
              Amount
            </th>
            <th scope="col" className={styles.actions}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              disabled={disabled}
              removing={removingItemId === item.id}
              onQuantity={(input) => onQuantity(item.id, input)}
              onRemove={() => onRemove(item.id)}
            />
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={5} className={styles.empty}>
                No active order items.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ItemRow({
  item,
  disabled,
  removing,
  onQuantity,
  onRemove,
}: {
  item: OrderItem;
  disabled: boolean;
  removing: boolean;
  onQuantity: (input: UpdateOrderItemQuantityRequest) => Promise<void>;
  onRemove: () => void;
}): ReactElement {
  const minQuantity = Math.max(1, item.sentQuantity);
  const quantity = useForm<UpdateOrderItemQuantityRequest>({
    resolver: zodResolver(
      updateOrderItemQuantityRequestSchema.extend({
        quantity: updateOrderItemQuantityRequestSchema.shape.quantity.min(
          minQuantity,
          `At least ${minQuantity}; already sent to kitchen`,
        ),
      }),
    ),
    defaultValues: { quantity: item.quantity },
  });
  const { reset } = quantity;
  useEffect(() => {
    reset({ quantity: item.quantity });
  }, [item.quantity, reset]);
  const saving = useRef<Promise<void> | null>(null);
  async function save(): Promise<void> {
    if (saving.current) return saving.current;
    if (!quantity.getFieldState('quantity').isDirty) return;
    const pending = quantity.handleSubmit(async (input) => {
      try {
        await onQuantity(input);
        quantity.reset(input);
      } catch {
        // The request hook reports the failure; retain the draft for retry.
      }
    })();
    saving.current = pending;
    try {
      await pending;
    } finally {
      saving.current = null;
    }
  }
  const busy = disabled || quantity.formState.isSubmitting;
  const draftQuantity = quantity.watch('quantity');
  const quantityField = quantity.register('quantity', { valueAsNumber: true });
  function step(delta: number): void {
    const value = quantity.getValues('quantity');
    if (!Number.isInteger(value) || value + delta < minQuantity || value + delta > 2147483647)
      return;
    quantity.setValue('quantity', value + delta, { shouldDirty: true });
    void save();
  }
  return (
    <tr>
      <td className={styles.name}>
        <span>{item.name}</span>
        <span className={styles.mobileMeta}>
          {item.quantity} × {item.unitPrice}
        </span>
        {item.sentQuantity > 0 && (
          <span className={styles.sentBadge}>
            {item.sentQuantity === item.quantity
              ? 'Sent to kitchen'
              : `${item.sentQuantity} of ${item.quantity} sent to kitchen`}
          </span>
        )}
      </td>
      <td className={styles.quantity}>
        <div className={styles.stepper}>
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
          <input
            id={`billing-quantity-${item.id}`}
            type="number"
            min={minQuantity}
            max={2147483647}
            step={1}
            className={styles.quantityInput}
            disabled={busy}
            aria-invalid={Boolean(quantity.formState.errors.quantity)}
            aria-describedby={`billing-quantity-error-${item.id}`}
            {...quantityField}
            onBlur={(event) => {
              void quantityField.onBlur(event);
              if (quantity.formState.isDirty && !busy) void save();
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
        </div>
        {quantity.formState.errors.quantity && (
          <p id={`billing-quantity-error-${item.id}`} role="alert" className={styles.quantityError}>
            {quantity.formState.errors.quantity.message}
          </p>
        )}
      </td>
      <td className={styles.unitPrice}>{item.unitPrice}</td>
      <td className={styles.amount}>{item.lineTotal}</td>
      <td className={styles.actions}>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={disabled || item.sentQuantity > 0}
          aria-label={`Remove ${item.name} from order`}
          title={item.sentQuantity > 0 ? 'Items sent to the kitchen cannot be removed' : undefined}
          onClick={onRemove}
        >
          {removing ? (
            <span className="sr-only">Removing…</span>
          ) : (
            <Trash2 className="size-4" aria-hidden />
          )}
        </Button>
      </td>
    </tr>
  );
}
