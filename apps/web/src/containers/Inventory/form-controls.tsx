'use client';

import { type ComponentProps, type ReactElement, type ReactNode, useEffect, useId } from 'react';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import type { ZodType } from 'zod';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

type Labelled = { label: string; error?: string };
export type Choice = { label: string; value: string };

export function InventoryInput({
  label,
  error,
  ...props
}: Labelled & ComponentProps<typeof Input>): ReactElement {
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        {...props}
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </Field>
  );
}

export function InventorySelect({
  label,
  error,
  options,
  ...props
}: Labelled & ComponentProps<typeof NativeSelect> & { options: readonly Choice[] }): ReactElement {
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <NativeSelect
        {...props}
        className="w-full"
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
      >
        {options.map(({ label: option, value }) => (
          <NativeSelectOption key={value} value={value}>
            {option}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </Field>
  );
}

export function InventoryDialog({
  title,
  description,
  children,
  onClose,
  isPending,
  isSuccess,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  isPending?: boolean;
  isSuccess?: boolean;
}): ReactElement {
  useEffect(() => {
    if (isSuccess) onClose();
  }, [isSuccess, onClose]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isPending) onClose();
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-lg">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

export function InventorySubmit({
  pending,
  label = 'Save',
  onClose,
  disabled,
}: {
  pending: boolean;
  label?: string;
  onClose: () => void;
  disabled?: boolean;
}): ReactElement {
  return (
    <DialogFooter>
      <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
        Cancel
      </Button>
      <Button type="submit" disabled={pending || disabled}>
        {pending ? 'Saving…' : label}
      </Button>
    </DialogFooter>
  );
}

export function validateForm<T, TFields extends FieldValues>(
  schema: ZodType<T>,
  input: unknown,
  setError: UseFormSetError<TFields>,
): T | undefined {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  result.error.issues.forEach(({ path, message }) => {
    setError(path.length ? (path.join('.') as Path<TFields>) : 'root', { message });
  });
  return undefined;
}

export const unitLabel = {
  G: 'g',
  KG: 'kg',
  ML: 'mL',
  L: 'L',
  UNIT: 'units',
  PACK: 'packs',
  BOX: 'boxes',
  BAG: 'bags',
} as const;
export function withUnit(quantity: string, unit: keyof typeof unitLabel | null): string {
  return unit ? `${quantity} ${unitLabel[unit]}` : quantity;
}

export function localDate(timestamp: string, timeStyle: 'short' | 'medium' = 'short'): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle }).format(
    new Date(timestamp),
  );
}
