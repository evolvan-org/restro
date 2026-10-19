'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { MenuItem, ServingType, UpdateMenuItemClassificationRequest } from '@rms/api-contract';
import { Check, Loader2 } from 'lucide-react';
import { type ReactElement, useEffect } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { NativeSelect } from '@/components/ui/native-select';
import { getServingTypeOptions } from '@/lib/serving-types';
import { useUpdateMenuItemClassification } from '@/services/api/requests/menu-items';

import {
  getClassificationFormDefaults,
  getClassificationFormLabels,
  getClassificationFormSchema,
} from './mapper';

export default function MenuItemClassificationEditor({
  item,
  categoryType,
}: {
  item: MenuItem;
  categoryType: ServingType | undefined;
}): ReactElement {
  const { mutateAsync: updateClassification, isPending: isSaving } =
    useUpdateMenuItemClassification();
  const form = useForm<UpdateMenuItemClassificationRequest>({
    resolver: zodResolver(getClassificationFormSchema(categoryType)),
    defaultValues: getClassificationFormDefaults(item),
  });
  const { reset } = form;
  const { errors, isDirty } = form.formState;
  const labels = getClassificationFormLabels(item.name, categoryType);
  const hintId = `classification-hint-${item.id}`;
  const errorId = `classification-error-${item.id}`;

  useEffect(() => {
    reset(getClassificationFormDefaults({ itemType: item.itemType }));
  }, [item.itemType, reset]);

  const onSubmit = form.handleSubmit(async (input) => {
    try {
      await updateClassification({ id: item.id, input });
    } catch {
      // The request hook reports failures; keep the selected type so the user can retry.
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="min-w-48 space-y-1">
      <div className="flex items-center gap-1">
        <NativeSelect
          size="sm"
          aria-label={labels.select}
          aria-invalid={Boolean(errors.itemType)}
          aria-describedby={`${hintId}${errors.itemType ? ` ${errorId}` : ''}`}
          disabled={isSaving || !categoryType}
          {...form.register('itemType')}
        >
          {getServingTypeOptions().map(({ value, label }) => (
            <option key={value} value={value} disabled={value !== categoryType}>
              {label}
            </option>
          ))}
        </NativeSelect>
        <Button
          type="submit"
          variant="ghost"
          size="icon-sm"
          aria-label={labels.save}
          disabled={isSaving || !isDirty || !categoryType}
        >
          {isSaving ? <Loader2 aria-hidden className="animate-spin" /> : <Check aria-hidden />}
        </Button>
      </div>
      <p id={hintId} className="text-xs text-muted-foreground">
        {labels.hint}
      </p>
      <FieldError id={errorId}>{errors.itemType?.message}</FieldError>
    </form>
  );
}
