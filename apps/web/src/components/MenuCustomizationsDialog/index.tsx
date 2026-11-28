'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type MenuCustomizations,
  menuCustomizationsSchema,
  type MenuItem,
} from '@rms/api-contract';
import { type ReactElement, useEffect } from 'react';
import {
  type Control,
  useFieldArray,
  useForm,
  type UseFormRegister,
  useWatch,
} from 'react-hook-form';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import useShowApiError from '@/hooks/api/useShowApiError';
import {
  useConfigureMenuItem,
  useMenuCustomizationOptions,
} from '@/services/api/requests/menu-items';

import { getMenuCustomizationDefaults } from './mappers';

type Props = { item: MenuItem; onClose: () => void };
type GroupProps = {
  index: number;
  control: Control<MenuCustomizations>;
  register: UseFormRegister<MenuCustomizations>;
  disabled: boolean;
};

function ModifierGroupFields({ index, control, register, disabled }: GroupProps): ReactElement {
  const modifiers = useFieldArray({ control, name: `groups.${index}.modifiers` });
  return (
    <div className="space-y-3">
      <label className="block text-sm">
        Choice group name
        <Input disabled={disabled} {...register(`groups.${index}.name`)} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          Minimum choices
          <Input
            type="number"
            min={0}
            max={20}
            disabled={disabled}
            {...register(`groups.${index}.minSelect`, { valueAsNumber: true })}
          />
        </label>
        <label className="text-sm">
          Maximum choices
          <Input
            type="number"
            min={1}
            max={20}
            disabled={disabled}
            {...register(`groups.${index}.maxSelect`, { valueAsNumber: true })}
          />
        </label>
      </div>
      <p className="text-sm text-muted-foreground">
        A minimum above zero makes this group required.
      </p>
      {modifiers.fields.map((field, optionIndex) => (
        <fieldset key={field.id} className="space-y-2 rounded border p-3">
          <legend className="text-sm">Option {optionIndex + 1}</legend>
          <label className="block text-sm">
            Option name
            <Input
              disabled={disabled}
              {...register(`groups.${index}.modifiers.${optionIndex}.name`)}
            />
          </label>
          <label className="block text-sm">
            Price adjustment
            <Input
              inputMode="decimal"
              disabled={disabled}
              {...register(`groups.${index}.modifiers.${optionIndex}.priceAdjustment`)}
            />
          </label>
          <label className="block text-sm">
            Kitchen note for an extra or substitution
            <Input
              maxLength={255}
              disabled={disabled}
              {...register(`groups.${index}.modifiers.${optionIndex}.kitchenNote`)}
            />
          </label>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => modifiers.remove(optionIndex)}
          >
            Remove option
          </Button>
        </fieldset>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={disabled || modifiers.fields.length >= 20}
        onClick={() =>
          modifiers.append({
            id: crypto.randomUUID(),
            name: '',
            priceAdjustment: '0',
            kitchenNote: '',
          })
        }
      >
        Add option
      </Button>
    </div>
  );
}

export default function MenuCustomizationsDialog({ item, onClose }: Props): ReactElement {
  const form = useForm<MenuCustomizations>({
    resolver: zodResolver(menuCustomizationsSchema),
    defaultValues: getMenuCustomizationDefaults(item),
  });
  const variants = useFieldArray({ control: form.control, name: 'variants' });
  const groups = useFieldArray({ control: form.control, name: 'groups' });
  const components = useFieldArray({ control: form.control, name: 'components' });
  const selectedComponents = useWatch({ control: form.control, name: 'components' });
  const options = useMenuCustomizationOptions();
  const { mutateAsync: configureMenuItem, isPending, isSuccess } = useConfigureMenuItem();
  const showApiError = useShowApiError('Unable to load combo choices.');

  useEffect(() => {
    if (isSuccess) onClose();
  }, [isSuccess, onClose]);

  useEffect(() => {
    if (options.error) showApiError(options.error);
  }, [options.error, options.errorUpdatedAt, showApiError]);

  const submit = form.handleSubmit(async (input) => {
    try {
      await configureMenuItem({ id: item.id, input });
    } catch {
      // The mutation hook reports API errors. Keep configuration drafts for correction.
    }
  });
  const { errors } = form.formState;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isPending) onClose();
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Sizes extras and combos for {item.name}</DialogTitle>
          <DialogDescription>
            Configure portion prices, required choices and included combo components. Changes are
            recorded in history. The standard portion uses the menu price.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-6">
          <fieldset className="space-y-3" disabled={isPending}>
            <legend className="font-semibold">Sizes</legend>
            {variants.fields.map((field, index) => (
              <div key={field.id} className="space-y-2 rounded border p-3">
                <label className="block text-sm">
                  Size name
                  <Input {...form.register(`variants.${index}.name`)} />
                </label>
                <label className="block text-sm">
                  Price for this size
                  <Input inputMode="decimal" {...form.register(`variants.${index}.price`)} />
                </label>
                <Button type="button" variant="outline" onClick={() => variants.remove(index)}>
                  Remove size
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              disabled={variants.fields.length >= 20}
              onClick={() =>
                variants.append({ id: crypto.randomUUID(), name: '', price: item.price })
              }
            >
              Add size
            </Button>
            {errors.variants && <p role="alert">Check each size name and price.</p>}
          </fieldset>
          <fieldset className="space-y-3" disabled={isPending}>
            <legend className="font-semibold">Extras and substitutions</legend>
            {groups.fields.map((field, index) => (
              <div key={field.id} className="space-y-3 rounded border p-3">
                <ModifierGroupFields
                  index={index}
                  control={form.control}
                  register={form.register}
                  disabled={isPending}
                />
                <Button type="button" variant="outline" onClick={() => groups.remove(index)}>
                  Remove group
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              disabled={groups.fields.length >= 20}
              onClick={() =>
                groups.append({
                  id: crypto.randomUUID(),
                  name: '',
                  minSelect: 0,
                  maxSelect: 1,
                  modifiers: [
                    { id: crypto.randomUUID(), name: '', priceAdjustment: '0', kitchenNote: '' },
                  ],
                })
              }
            >
              Add choice group
            </Button>
            {errors.groups && (
              <p role="alert">Check group names, options, prices and selection limits.</p>
            )}
          </fieldset>
          <fieldset className="space-y-3" disabled={isPending}>
            <legend className="font-semibold">Included combo components</legend>
            <p className="text-sm text-muted-foreground">
              The combo menu price covers these included items.
            </p>
            {components.fields.map((field, index) => (
              <div key={field.id} className="space-y-2 rounded border p-3">
                <label className="block text-sm">
                  Menu item
                  <select
                    className="w-full rounded border p-2"
                    {...form.register(`components.${index}.menuItemId`)}
                    value={selectedComponents[index]?.menuItemId ?? ''}
                  >
                    <option value="">Select an item</option>
                    {(options.data ?? [])
                      .filter((candidate) => candidate.id !== item.id)
                      .map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="block text-sm">
                  Quantity included
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    {...form.register(`components.${index}.quantity`, { valueAsNumber: true })}
                  />
                </label>
                <Button type="button" variant="outline" onClick={() => components.remove(index)}>
                  Remove component
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              disabled={components.fields.length >= 50 || options.isPending || options.isError}
              onClick={() => components.append({ menuItemId: '', quantity: 1 })}
            >
              Add component
            </Button>
            {options.isError && (
              <p role="alert">Unable to load menu components. Close and try again.</p>
            )}
            {errors.components && (
              <p role="alert">Choose each component once and enter a positive quantity.</p>
            )}
          </fieldset>
          {errors.root && <p role="alert">{errors.root.message}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={isPending} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !form.formState.isDirty}>
              {isPending ? 'Saving…' : 'Save choices'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
