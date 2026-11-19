'use client';

import {
  createInventoryPurchaseSchema,
  createInventoryReceiptSchema,
  type InventoryPackageSize,
  inventoryPackageUnits,
  type InventoryPurchase,
  type InventoryReceipt,
  inventorySupplyMeasures,
  type InventorySupplyUnit,
  isInventoryPackageUnit,
  type Unit,
} from '@rms/api-contract';
import { Plus, Trash2 } from 'lucide-react';
import type { ReactElement } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { getApiErrorMessage } from '@/lib/api-error';
import {
  useInventoryCommand,
  useInventoryOptions,
  useInventoryReceipts,
} from '@/services/api/requests/inventory';

import {
  type Choice,
  InventoryDialog,
  InventoryInput,
  InventorySelect,
  InventorySubmit,
  localDate,
  unitLabel,
  validateForm,
  withUnit,
} from './form-controls';

type LineDraft = {
  stockItemId: string;
  purchaseOrderLineId: string;
  quantity: string;
  unitCost: string;
  unit: InventorySupplyUnit | '';
  packageSize: { quantity: string; unit: Unit | '' };
  batchNumber: string;
  expiryDate: string;
};
type DocumentDraft = {
  idempotencyKey: string;
  supplierId: string;
  notes: string;
  expectedDate: string;
  lines: LineDraft[];
};

const emptyLine = (): LineDraft => ({
  stockItemId: '',
  purchaseOrderLineId: '',
  quantity: '',
  unitCost: '',
  unit: '',
  packageSize: { quantity: '', unit: '' },
  batchNumber: '',
  expiryDate: '',
});
const blankItem: Choice = { value: '', label: 'Choose an ingredient' };
type Close = { onClose: () => void };

const supplierUnitNames: Record<InventorySupplyUnit, string> = {
  G: 'Grams (g)',
  KG: 'Kilograms (kg)',
  ML: 'Millilitres (mL)',
  L: 'Litres (L)',
  UNIT: 'Individual units',
  PACK: 'Pack',
  BOX: 'Box',
  BAG: 'Bag',
};

function unitOptions(baseUnit?: keyof typeof inventorySupplyMeasures | null): Choice[] {
  return (Object.keys(inventorySupplyMeasures) as Unit[])
    .filter((unit) => inventorySupplyMeasures[unit].baseUnit === baseUnit)
    .map((unit) => ({ value: unit, label: supplierUnitNames[unit] }));
}

function priceUnit(unit: InventorySupplyUnit): string {
  if (unit === 'UNIT' || isInventoryPackageUnit(unit)) return unit.toLowerCase();
  return unitLabel[unit];
}

function packageDescription(
  unit: InventorySupplyUnit | null,
  size: InventoryPackageSize | null,
): string | null {
  return unit && size ? `${withUnit(size.quantity, size.unit)} per ${priceUnit(unit)}` : null;
}

function supplyDraft(
  line: LineDraft,
): Pick<LineDraft, 'unit'> & { packageSize?: LineDraft['packageSize'] } {
  return {
    unit: line.unit,
    packageSize: isInventoryPackageUnit(line.unit) ? line.packageSize : undefined,
  };
}

export function DocumentForm({
  mode,
  purchase,
  onClose,
}: Close & { mode: 'purchase' | 'receipt'; purchase?: InventoryPurchase }): ReactElement {
  const { mutateAsync: saveDocument, isPending, isSuccess } = useInventoryCommand();
  const options = useInventoryOptions(!purchase);
  const form = useForm<DocumentDraft>({
    defaultValues: {
      idempotencyKey: globalThis.crypto.randomUUID(),
      supplierId: purchase?.supplier.id ?? '',
      expectedDate: '',
      notes: '',
      lines: [emptyLine()],
    },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'lines' });
  const lines = useWatch({ control: form.control, name: 'lines' });
  const { errors } = form.formState;
  const isReceipt = mode === 'receipt';
  const poLines = purchase?.lines.filter(({ quantityRemaining }) => Number(quantityRemaining) > 0);
  const optionsData = options.data;
  const itemOptions = optionsData?.items.filter(({ opened }) => !isReceipt || opened) ?? [];
  const supplierOptions = optionsData?.suppliers ?? [];
  const lineOptions = [
    blankItem,
    ...(poLines
      ? poLines.map(({ id, stockItem, quantityRemaining, unit }) => ({
          value: id,
          label: `${stockItem.name} · ${withUnit(quantityRemaining, unit)} left`,
        }))
      : itemOptions.map(({ id, name }) => ({
          value: id,
          label: name,
        }))),
  ];

  async function submit(draft: DocumentDraft): Promise<void> {
    try {
      if (isReceipt) {
        const input = validateForm(
          createInventoryReceiptSchema,
          {
            idempotencyKey: draft.idempotencyKey,
            supplierId: draft.supplierId,
            purchaseOrderId: purchase?.id,
            notes: draft.notes,
            lines: draft.lines.map((line) => ({
              stockItemId: line.stockItemId,
              purchaseOrderLineId: line.purchaseOrderLineId || undefined,
              quantity: line.quantity,
              unitCost: line.unitCost,
              batchNumber: line.batchNumber,
              expiryDate: line.expiryDate || undefined,
              ...(!purchase && supplyDraft(line)),
            })),
          },
          form.setError,
        );
        if (input) await saveDocument({ type: 'receive', input });
      } else {
        const input = validateForm(
          createInventoryPurchaseSchema,
          {
            supplierId: draft.supplierId,
            expectedDate: draft.expectedDate || undefined,
            notes: draft.notes,
            lines: draft.lines.map((line) => ({
              stockItemId: line.stockItemId,
              quantity: line.quantity,
              unitCost: line.unitCost,
              ...supplyDraft(line),
            })),
          },
          form.setError,
        );
        if (input) await saveDocument({ type: 'createPurchase', input });
      }
    } catch {
      // The request hook displays the error and the form retains its values.
    }
  }

  const available = Boolean(
    purchase ? poLines?.length : optionsData && supplierOptions.length && itemOptions.length,
  );

  function resetSupplyAmounts(index: number): void {
    form.setValue(`lines.${index}.quantity`, '');
    form.setValue(`lines.${index}.unitCost`, '');
    form.setValue(`lines.${index}.packageSize`, { quantity: '', unit: '' });
  }

  return (
    <InventoryDialog
      title={
        isReceipt
          ? purchase
            ? `Receive PO-${purchase.number}`
            : 'Record direct receipt'
          : 'New purchase order'
      }
      description={
        purchase
          ? `Supplier: ${purchase.supplier.name}. Enter only the quantities delivered.`
          : undefined
      }
      {...{ onClose, isPending, isSuccess }}
    >
      {!purchase && options.isPending && <p role="status">Loading suppliers and ingredients…</p>}
      {!purchase && options.isError && (
        <div className="flex items-center gap-3" role="alert">
          <p>Unable to load suppliers and ingredients.</p>
          <Button variant="outline" onClick={() => void options.refetch()}>
            Retry
          </Button>
        </div>
      )}
      {!purchase && optionsData && !available && (
        <p className="text-sm text-muted-foreground">
          {isReceipt
            ? 'Add an active supplier and record opening stock for at least one ingredient.'
            : 'Add an active supplier and configure a base unit for at least one ingredient.'}
        </p>
      )}
      {available && (
        <form noValidate className="space-y-4" onSubmit={form.handleSubmit(submit)}>
          {purchase ? (
            <input type="hidden" {...form.register('supplierId')} />
          ) : (
            <InventorySelect
              label="Supplier"
              options={[
                { value: '', label: 'Choose a supplier' },
                ...supplierOptions.map(({ id, name }) => ({ value: id, label: name })),
              ]}
              error={errors.supplierId?.message}
              {...form.register('supplierId')}
            />
          )}
          {!isReceipt && (
            <InventoryInput
              label="Expected delivery (optional)"
              type="date"
              error={errors.expectedDate?.message}
              {...form.register('expectedDate')}
            />
          )}
          <InventoryInput
            label="Notes (optional)"
            error={errors.notes?.message}
            {...form.register('notes')}
          />
          <div className="space-y-3">
            {fields.map((field, index) => {
              const line = lines[index];
              const error = errors.lines?.[index];
              const selectedOrderLine = poLines?.find(({ id }) => id === line?.purchaseOrderLineId);
              const selectedItem = itemOptions.find(({ id }) => id === line?.stockItemId);
              const lineUnit = purchase ? selectedOrderLine?.unit : line?.unit;
              const unit = lineUnit ? ` (${unitLabel[lineUnit]})` : '';
              const standardOptions = unitOptions(selectedItem?.baseUnit);
              const packageDetails =
                selectedOrderLine &&
                packageDescription(selectedOrderLine.unit, selectedOrderLine.packageSize);
              return (
                <fieldset className="space-y-3 rounded-lg border p-3" key={field.id}>
                  <legend className="px-1 text-xs font-medium text-muted-foreground">
                    Line {index + 1}
                  </legend>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      {purchase ? (
                        <>
                          <input type="hidden" {...form.register(`lines.${index}.stockItemId`)} />
                          <InventorySelect
                            label="Purchase order line"
                            options={lineOptions}
                            error={
                              error?.purchaseOrderLineId?.message ?? error?.stockItemId?.message
                            }
                            {...form.register(`lines.${index}.purchaseOrderLineId`, {
                              onChange: (event) => {
                                const selected = poLines?.find(
                                  ({ id }) => id === event.target.value,
                                );
                                form.setValue(
                                  `lines.${index}.stockItemId`,
                                  selected?.stockItem.id ?? '',
                                );
                                form.setValue(`lines.${index}.quantity`, '');
                                form.setValue(`lines.${index}.unitCost`, selected?.unitCost ?? '');
                              },
                            })}
                          />
                        </>
                      ) : (
                        <InventorySelect
                          label="Ingredient"
                          options={lineOptions}
                          error={error?.stockItemId?.message}
                          {...form.register(`lines.${index}.stockItemId`, {
                            onChange: () => {
                              form.setValue(`lines.${index}.unit`, '');
                              resetSupplyAmounts(index);
                            },
                          })}
                        />
                      )}
                    </div>
                    {fields.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove line ${index + 1}`}
                        className="mt-6"
                        disabled={isPending}
                        onClick={() => remove(index)}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                  {purchase && lineUnit && (
                    <p className="text-sm text-muted-foreground">
                      Supplier unit: {supplierUnitNames[lineUnit]}
                      {packageDetails && ` · ${packageDetails}`}
                    </p>
                  )}
                  {!purchase && (
                    <InventorySelect
                      label="Supplier unit"
                      disabled={!selectedItem}
                      options={[
                        { value: '', label: 'Choose a supplier unit' },
                        ...standardOptions,
                        ...inventoryPackageUnits.map((value) => ({
                          value,
                          label: supplierUnitNames[value],
                        })),
                      ]}
                      error={error?.unit?.message}
                      {...form.register(`lines.${index}.unit`, {
                        onChange: () => resetSupplyAmounts(index),
                      })}
                    />
                  )}
                  {!purchase && lineUnit && isInventoryPackageUnit(lineUnit) && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <InventoryInput
                        label={`Quantity in one ${priceUnit(lineUnit)}`}
                        inputMode="decimal"
                        error={error?.packageSize?.quantity?.message ?? error?.packageSize?.message}
                        {...form.register(`lines.${index}.packageSize.quantity`)}
                      />
                      <InventorySelect
                        label="Package contents unit"
                        options={[
                          { value: '', label: 'Choose a contents unit' },
                          ...standardOptions,
                        ]}
                        error={error?.packageSize?.unit?.message}
                        {...form.register(`lines.${index}.packageSize.unit`)}
                      />
                    </div>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <InventoryInput
                      label={`Quantity${unit}`}
                      inputMode="decimal"
                      disabled={!lineUnit}
                      error={error?.quantity?.message}
                      {...form.register(`lines.${index}.quantity`)}
                    />
                    <InventoryInput
                      label={
                        lineUnit ? `Cost per ${priceUnit(lineUnit)}` : 'Cost per supplier unit'
                      }
                      inputMode="decimal"
                      disabled={!lineUnit}
                      error={error?.unitCost?.message}
                      {...form.register(`lines.${index}.unitCost`)}
                    />
                    {isReceipt && (
                      <>
                        <InventoryInput
                          label="Batch number (optional)"
                          error={error?.batchNumber?.message}
                          {...form.register(`lines.${index}.batchNumber`)}
                        />
                        <InventoryInput
                          label="Expiry date (optional)"
                          type="date"
                          error={error?.expiryDate?.message}
                          {...form.register(`lines.${index}.expiryDate`)}
                        />
                      </>
                    )}
                  </div>
                </fieldset>
              );
            })}
            <FieldError>
              {errors.lines?.message ?? errors.lines?.root?.message ?? errors.root?.message}
            </FieldError>
            <Button
              type="button"
              variant="outline"
              disabled={fields.length >= 50 || isPending}
              onClick={() => append(emptyLine())}
            >
              <Plus /> Add line
            </Button>
          </div>
          <InventorySubmit
            pending={isPending}
            label={isReceipt ? 'Post receipt' : 'Create draft'}
            onClose={onClose}
          />
        </form>
      )}
    </InventoryDialog>
  );
}

export function PurchaseDetails({
  purchase,
  onClose,
  onReceive,
}: Close & { purchase: InventoryPurchase; onReceive: () => void }): ReactElement {
  const { mutateAsync: setStatus, isPending, isSuccess } = useInventoryCommand();
  async function updateStatus(status: 'SENT' | 'CANCELLED'): Promise<void> {
    try {
      await setStatus({ type: 'purchaseStatus', id: purchase.id, input: { status } });
    } catch {
      /* Handled by the request hook. */
    }
  }
  const canReceive = purchase.status === 'SENT' || purchase.status === 'PARTIALLY_RECEIVED';

  return (
    <InventoryDialog
      title={`Purchase order PO-${purchase.number}`}
      description={purchase.supplier.name}
      {...{ onClose, isPending, isSuccess }}
    >
      {purchase.notes && <p className="break-words text-sm">{purchase.notes}</p>}
      <ul className="divide-y rounded-md border">
        {purchase.lines.map((line) => (
          <li className="p-3" key={line.id}>
            <p className="font-medium">{line.stockItem.name}</p>
            <p className="text-sm text-muted-foreground">
              {withUnit(line.quantity, line.unit)} ordered ·{' '}
              {withUnit(line.quantityReceived, line.unit)} received · {line.unitCost} per{' '}
              {line.unit ? priceUnit(line.unit) : 'unit'}
              {line.packageSize && ` · ${packageDescription(line.unit, line.packageSize)}`}
            </p>
          </li>
        ))}
      </ul>
      <PurchaseReceiptHistory purchaseOrderId={purchase.id} />
      <div className="flex flex-wrap justify-end gap-2">
        {(purchase.status === 'DRAFT' || purchase.status === 'SENT') && (
          <Button
            variant="destructive"
            disabled={isPending}
            onClick={() => void updateStatus('CANCELLED')}
          >
            Cancel PO
          </Button>
        )}
        {purchase.status === 'DRAFT' && (
          <Button disabled={isPending} onClick={() => void updateStatus('SENT')}>
            Mark sent
          </Button>
        )}
        {canReceive && (
          <Button disabled={isPending} onClick={onReceive}>
            Receive delivery
          </Button>
        )}
      </div>
    </InventoryDialog>
  );
}

function PurchaseReceiptHistory({ purchaseOrderId }: { purchaseOrderId: string }): ReactElement {
  const { control, setValue } = useForm({ defaultValues: { page: 1 } });
  const page = useWatch({ control, name: 'page' });
  const history = useInventoryReceipts({ page, pageSize: 10, purchaseOrderId });

  return (
    <section className="space-y-3" aria-label="Receipt history">
      <h3 className="font-heading text-sm font-semibold">Receipt history</h3>
      {history.isPending && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading receipts…
        </p>
      )}
      {history.isError && (
        <div className="flex flex-wrap items-center gap-2" role="alert">
          <p className="text-sm">
            {getApiErrorMessage(history.error, 'Unable to load receipt history.')}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={history.isFetching}
            onClick={() => void history.refetch()}
          >
            Retry
          </Button>
        </div>
      )}
      {history.data && !history.isError && (
        <>
          {history.data.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No deliveries received yet.</p>
          ) : (
            <ol className="divide-y rounded-md border">
              {history.data.data.map((receipt) => (
                <li className="space-y-2 p-3" key={receipt.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="font-medium">GRN-{receipt.number}</span>
                    <time className="text-xs text-muted-foreground" dateTime={receipt.createdAt}>
                      {localDate(receipt.createdAt, 'medium')}
                    </time>
                  </div>
                  <ReceiptLines lines={receipt.lines} className="space-y-2" />
                </li>
              ))}
            </ol>
          )}
          {history.data.meta.totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">
                Page {page} of {history.data.meta.totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || history.isFetching}
                  onClick={() => setValue('page', page - 1)}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= history.data.meta.totalPages || history.isFetching}
                  onClick={() => setValue('page', page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function ReceiptLines({
  lines,
  className,
  lineClassName,
}: {
  lines: InventoryReceipt['lines'];
  className: string;
  lineClassName?: string;
}): ReactElement {
  return (
    <ul className={className}>
      {lines.map((line) => (
        <li className={lineClassName} key={line.id}>
          <p className="font-medium">{line.stockItem.name}</p>
          <p className="text-sm text-muted-foreground">
            {withUnit(line.quantity, line.unit)} · {line.unitCost} per{' '}
            {line.unit ? priceUnit(line.unit) : 'unit'}
            {line.packageSize && ` · ${packageDescription(line.unit, line.packageSize)}`}
            {' · '}Batch {line.batchNumber}
            {line.expiryDate && ` · Expires ${line.expiryDate}`}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function ReceiptDetails({
  receipt,
  onClose,
}: Close & { receipt: InventoryReceipt }): ReactElement {
  return (
    <InventoryDialog
      title={`Goods receipt GRN-${receipt.number}`}
      description={`${receipt.supplier.name} · ${receipt.purchaseOrder ? `PO-${receipt.purchaseOrder.number}` : 'Direct receipt'}`}
      onClose={onClose}
    >
      {receipt.notes && <p className="break-words text-sm">{receipt.notes}</p>}
      <ReceiptLines
        lines={receipt.lines}
        className="divide-y rounded-md border"
        lineClassName="p-3"
      />
    </InventoryDialog>
  );
}
