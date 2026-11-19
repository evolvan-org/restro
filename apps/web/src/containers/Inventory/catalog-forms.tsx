'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type AdjustInventoryStock,
  adjustInventoryStockSchema,
  type InventoryBatch,
  type InventoryItem,
  type InventorySupplier,
  type LogInventoryWaste,
  logInventoryWasteSchema,
  type OpeningInventoryStock,
  openingStockSchema,
  type UpdateInventoryItem,
  updateInventoryItemSchema,
  type UpdateInventorySupplier,
  updateInventorySupplierSchema,
} from '@rms/api-contract';
import type { ReactElement } from 'react';
import { type DefaultValues, useForm, useWatch } from 'react-hook-form';

import { useInventoryCommand } from '@/services/api/requests/inventory';

import {
  InventoryDialog,
  InventoryInput,
  InventorySelect,
  InventorySubmit,
  unitLabel,
  withUnit,
} from './form-controls';

type Close = { onClose: () => void };
const baseUnits = [
  { value: '', label: 'Choose a base unit' },
  { value: 'G', label: 'Grams (g)' },
  { value: 'ML', label: 'Millilitres (mL)' },
  { value: 'UNIT', label: 'Units' },
];

function itemDefaults(item?: InventoryItem): DefaultValues<UpdateInventoryItem> {
  return {
    name: item?.name ?? '',
    sku: item?.sku ?? '',
    baseUnit: item?.baseUnit ?? undefined,
    reorderLevel: item?.reorderLevel ?? '0',
    isActive: item?.isActive ?? true,
  };
}

export function ItemForm({ item, onClose }: Close & { item?: InventoryItem }): ReactElement {
  const { mutateAsync: saveItem, isPending, isSuccess } = useInventoryCommand();
  const form = useForm<UpdateInventoryItem>({
    resolver: zodResolver(updateInventoryItemSchema),
    defaultValues: itemDefaults(item),
  });
  const { errors } = form.formState;

  return (
    <InventoryDialog
      title={item ? 'Edit ingredient' : 'New ingredient'}
      {...{ onClose, isPending, isSuccess }}
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={form.handleSubmit(async ({ isActive, ...input }) => {
          try {
            await saveItem(
              item
                ? { type: 'updateItem', id: item.id, input: { ...input, isActive } }
                : { type: 'createItem', input },
            );
          } catch {
            // The request hook displays the error and the form retains its values.
          }
        })}
      >
        <InventoryInput
          label="Ingredient name"
          error={errors.name?.message}
          {...form.register('name')}
        />
        <InventoryInput
          label="SKU (optional)"
          error={errors.sku?.message}
          {...form.register('sku')}
        />
        {item?.baseUnit ? (
          <>
            <input type="hidden" {...form.register('baseUnit')} />
            <InventoryInput label="Base unit" value={unitLabel[item.baseUnit]} readOnly />
          </>
        ) : (
          <InventorySelect
            label="Base unit"
            options={baseUnits}
            error={errors.baseUnit?.message}
            {...form.register('baseUnit')}
          />
        )}
        <InventoryInput
          label="Reorder level in base units"
          inputMode="decimal"
          error={errors.reorderLevel?.message}
          {...form.register('reorderLevel')}
        />
        {item && (
          <label className="flex min-h-9 items-center gap-2 text-sm">
            <input type="checkbox" {...form.register('isActive')} />
            Active ingredient
          </label>
        )}
        <InventorySubmit pending={isPending} onClose={onClose} />
      </form>
    </InventoryDialog>
  );
}

function supplierDefaults(supplier?: InventorySupplier): UpdateInventorySupplier {
  return {
    name: supplier?.name ?? '',
    contactName: supplier?.contactName ?? '',
    email: supplier?.email ?? '',
    phone: supplier?.phone ?? '',
    address: supplier?.address ?? '',
    isActive: supplier?.isActive ?? true,
  };
}

export function SupplierForm({
  supplier,
  onClose,
}: Close & { supplier?: InventorySupplier }): ReactElement {
  const { mutateAsync: saveSupplier, isPending, isSuccess } = useInventoryCommand();
  const form = useForm<UpdateInventorySupplier>({
    resolver: zodResolver(updateInventorySupplierSchema),
    defaultValues: supplierDefaults(supplier),
  });
  const { errors } = form.formState;

  return (
    <InventoryDialog
      title={supplier ? 'Edit supplier' : 'New supplier'}
      {...{ onClose, isPending, isSuccess }}
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={form.handleSubmit(async ({ isActive, ...input }) => {
          try {
            await saveSupplier(
              supplier
                ? { type: 'updateSupplier', id: supplier.id, input: { ...input, isActive } }
                : { type: 'createSupplier', input },
            );
          } catch {
            // The request hook displays the error and the form retains its values.
          }
        })}
      >
        <InventoryInput
          label="Supplier name"
          error={errors.name?.message}
          {...form.register('name')}
        />
        <InventoryInput
          label="Contact name"
          error={errors.contactName?.message}
          {...form.register('contactName')}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <InventoryInput
            label="Email"
            type="email"
            error={errors.email?.message}
            {...form.register('email')}
          />
          <InventoryInput
            label="Phone"
            type="tel"
            error={errors.phone?.message}
            {...form.register('phone')}
          />
        </div>
        <InventoryInput
          label="Address"
          error={errors.address?.message}
          {...form.register('address')}
        />
        {supplier && (
          <label className="flex min-h-9 items-center gap-2 text-sm">
            <input type="checkbox" {...form.register('isActive')} />
            Active supplier
          </label>
        )}
        <InventorySubmit pending={isPending} onClose={onClose} />
      </form>
    </InventoryDialog>
  );
}

export function OpeningForm({ item, onClose }: Close & { item: InventoryItem }): ReactElement {
  const { mutateAsync: openStock, isPending, isSuccess } = useInventoryCommand();
  const form = useForm<OpeningInventoryStock>({
    resolver: zodResolver(openingStockSchema),
    defaultValues: { quantity: '', unitCost: '', reason: '' },
  });
  const { errors } = form.formState;

  return (
    <InventoryDialog
      title="Record opening stock"
      description={`${item.name} · Use an approved physical count. Enter zero for a confirmed empty count.`}
      {...{ onClose, isPending, isSuccess }}
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={form.handleSubmit(async (input) => {
          try {
            await openStock({ type: 'openStock', id: item.id, input });
          } catch {
            /* Handled by the request hook. */
          }
        })}
      >
        <InventoryInput
          label={`Quantity (${item.baseUnit ? unitLabel[item.baseUnit] : ''})`}
          inputMode="decimal"
          error={errors.quantity?.message}
          {...form.register('quantity')}
        />
        <InventoryInput
          label="Cost per base unit"
          inputMode="decimal"
          error={errors.unitCost?.message}
          {...form.register('unitCost')}
        />
        <InventoryInput
          label="Reason or count reference"
          error={errors.reason?.message}
          {...form.register('reason')}
        />
        <InventorySubmit pending={isPending} label="Record count" onClose={onClose} />
      </form>
    </InventoryDialog>
  );
}

export function AdjustmentForm({ item, onClose }: Close & { item: InventoryItem }): ReactElement {
  const { mutateAsync: adjustStock, isPending, isSuccess } = useInventoryCommand();
  const form = useForm<AdjustInventoryStock>({
    resolver: zodResolver(adjustInventoryStockSchema),
    defaultValues: { quantity: '', reason: '' },
    shouldUnregister: true,
  });
  const quantity = useWatch({ control: form.control, name: 'quantity' });
  const { errors } = form.formState;

  return (
    <InventoryDialog
      title="Adjust stock"
      description={`${item.name} · ${withUnit(item.currentStock, item.baseUnit)} on hand`}
      {...{ onClose, isPending, isSuccess }}
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={form.handleSubmit(async (input) => {
          try {
            await adjustStock({ type: 'adjustStock', id: item.id, input });
          } catch {
            /* Handled by the request hook. */
          }
        })}
      >
        <InventoryInput
          label="Change in base units (negative to remove)"
          inputMode="text"
          error={errors.quantity?.message}
          {...form.register('quantity')}
        />
        {Number(quantity) > 0 && (
          <InventoryInput
            label={
              item.averageUnitCost === null ? 'Cost per base unit' : 'Cost per base unit (optional)'
            }
            placeholder={item.averageUnitCost ?? undefined}
            inputMode="decimal"
            error={errors.unitCost?.message}
            {...form.register('unitCost', {
              setValueAs: (value) => (value === '' ? undefined : value),
            })}
          />
        )}
        <InventoryInput
          label="Reason"
          error={errors.reason?.message}
          {...form.register('reason')}
        />
        <InventorySubmit pending={isPending} label="Post adjustment" onClose={onClose} />
      </form>
    </InventoryDialog>
  );
}

export function WasteForm({ batch, onClose }: Close & { batch: InventoryBatch }): ReactElement {
  const { mutateAsync: recordWaste, isPending, isSuccess } = useInventoryCommand();
  const form = useForm<LogInventoryWaste>({
    resolver: zodResolver(logInventoryWasteSchema),
    defaultValues: { quantity: '', reason: '' },
  });
  const { errors } = form.formState;

  return (
    <InventoryDialog
      title="Record waste"
      description={`${batch.stockItem.name} · Batch ${batch.batchNumber} · ${withUnit(batch.quantityRemaining, batch.stockItem.baseUnit)} remaining`}
      {...{ onClose, isPending, isSuccess }}
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={form.handleSubmit(async (input) => {
          try {
            await recordWaste({ type: 'waste', id: batch.id, input });
          } catch {
            /* Handled by the request hook. */
          }
        })}
      >
        <InventoryInput
          label="Quantity in base units"
          inputMode="decimal"
          error={errors.quantity?.message}
          {...form.register('quantity')}
        />
        <InventoryInput
          label="Reason"
          error={errors.reason?.message}
          {...form.register('reason')}
        />
        <InventorySubmit pending={isPending} label="Record waste" onClose={onClose} />
      </form>
    </InventoryDialog>
  );
}
