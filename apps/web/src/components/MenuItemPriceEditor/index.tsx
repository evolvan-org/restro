'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type MenuItem,
  type UpdateMenuItemPriceRequest,
  updateMenuItemPriceRequestSchema,
} from '@rms/api-contract';
import { Check, Loader2, Pencil, X } from 'lucide-react';
import { type ReactElement, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useUpdateMenuItemPrice } from '@/services/api/requests/menu-items';

import { getMenuItemPriceFormDefaults, getMenuItemPriceFormLabels } from './mapper';

export default function MenuItemPriceEditor({ item }: { item: MenuItem }): ReactElement {
  // This local state only controls editor visibility; RHF and TanStack own values, errors and saving.
  const [isEditing, setIsEditing] = useState(false);
  const {
    mutateAsync: updatePrice,
    isPending: isSaving,
    isSuccess: isPriceUpdated,
    reset: resetPriceMutation,
  } = useUpdateMenuItemPrice();
  const form = useForm<UpdateMenuItemPriceRequest>({
    resolver: zodResolver(updateMenuItemPriceRequestSchema),
    defaultValues: getMenuItemPriceFormDefaults(item),
  });
  const { errors } = form.formState;
  const labels = getMenuItemPriceFormLabels(item.name);
  const priceErrorId = `menu-item-price-error-${item.id}`;
  const priceHintId = `menu-item-price-hint-${item.id}`;

  useEffect(() => {
    if (isPriceUpdated) {
      setIsEditing(false);
      resetPriceMutation();
    }
  }, [isPriceUpdated, resetPriceMutation]);

  const startEditing = (): void => {
    form.reset(getMenuItemPriceFormDefaults(item));
    setIsEditing(true);
  };

  const cancelEditing = (): void => {
    form.reset(getMenuItemPriceFormDefaults(item));
    setIsEditing(false);
  };

  const onSubmit = form.handleSubmit(async (input) => {
    try {
      await updatePrice({ id: item.id, input });
    } catch {
      // The request hook reports the API error; keep the editor and entered price available to retry.
    }
  });

  if (!isEditing) {
    return (
      <div className="flex items-center gap-1">
        <span>{item.price}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={labels.edit}
          onClick={startEditing}
        >
          <Pencil aria-hidden />
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="min-w-56 space-y-1">
      <div className="flex items-center gap-1">
        <Input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          autoFocus
          aria-label={labels.price}
          aria-invalid={Boolean(errors.price)}
          aria-describedby={`${priceHintId}${errors.price ? ` ${priceErrorId}` : ''}`}
          disabled={isSaving}
          className="h-8 w-32"
          {...form.register('price')}
        />
        <Button
          type="submit"
          variant="ghost"
          size="icon-sm"
          disabled={isSaving}
          aria-label={labels.save}
        >
          {isSaving ? <Loader2 aria-hidden className="animate-spin" /> : <Check aria-hidden />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={isSaving}
          aria-label={labels.cancel}
          onClick={cancelEditing}
        >
          <X aria-hidden />
        </Button>
      </div>
      <p id={priceHintId} className="text-xs text-muted-foreground">
        {labels.hint}
      </p>
      <FieldError id={priceErrorId}>{errors.price?.message}</FieldError>
    </form>
  );
}
