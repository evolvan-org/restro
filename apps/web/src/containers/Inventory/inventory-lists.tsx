'use client';

import type {
  InventoryBatch,
  InventoryBatchQuery,
  InventoryItem,
  InventoryItemQuery,
  InventoryMovement,
  InventoryMovementQuery,
  InventoryPurchase,
  InventoryPurchaseQuery,
  InventoryReceipt,
  InventorySupplier,
  InventorySupplierQuery,
} from '@rms/api-contract';
import type { Paginated } from '@rms/shared';
import type { UseQueryResult } from '@tanstack/react-query';
import { Download, Plus, Upload } from 'lucide-react';
import { type ReactElement, type ReactNode, useCallback, useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getApiErrorMessage } from '@/lib/api-error';
import {
  useExportInventoryCsv,
  useInventoryBatches,
  useInventoryItems,
  useInventoryMovements,
  useInventoryPurchases,
  useInventoryReceipts,
  useInventorySuppliers,
} from '@/services/api/requests/inventory';

import { AdjustmentForm, ItemForm, OpeningForm, SupplierForm, WasteForm } from './catalog-forms';
import CsvImportForm from './csv-import-form';
import { InventoryInput, InventorySelect, localDate, unitLabel, withUnit } from './form-controls';
import { DocumentForm, PurchaseDetails, ReceiptDetails } from './purchase-forms';

const PAGE_SIZE = 20;

function useListFilters<Status extends string>(initial: Status) {
  const form = useForm({ defaultValues: { page: 1, q: '', status: String(initial), search: '' } });
  const { control, register, setValue, getValues } = form;
  const [page, status, q] = useWatch({ control, name: ['page', 'status', 'q'] });
  const setPage = useCallback((value: number) => setValue('page', value), [setValue]);
  return {
    page,
    status: status as Status,
    q,
    setPage,
    search: register('search'),
    select: register('status', { onChange: () => setValue('page', 1) }),
    applySearch: form.handleSubmit(() => {
      setValue('q', getValues('search').trim());
      setPage(1);
    }),
  };
}

function InventoryTable<T>({
  query,
  columns,
  render,
  empty,
  caption,
  setPage,
}: {
  query: UseQueryResult<Paginated<T>>;
  columns: string[];
  render: (row: T) => ReactElement;
  empty: string;
  caption: string;
  setPage: (page: number) => void;
}): ReactElement {
  const meta = query.data?.meta;
  useEffect(() => {
    if (meta && meta.page > Math.max(1, meta.totalPages)) setPage(Math.max(1, meta.totalPages));
  }, [meta, setPage]);

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {query.isPending && (
        <p role="status" className="p-6 text-sm text-muted-foreground">
          Loading {caption.toLowerCase()}…
        </p>
      )}
      {query.isError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 p-5 text-sm">
          <span>{getApiErrorMessage(query.error, `Unable to load ${caption.toLowerCase()}.`)}</span>
          <Button
            variant="outline"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            Retry
          </Button>
        </div>
      )}
      {query.data && !query.isError && (
        <>
          <Table aria-label={caption}>
            <TableHeader className="bg-muted/50">
              <TableRow>
                {columns.map((column) => (
                  <TableHead key={column} scope="col" className="px-4">
                    {column}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.data.map(render)}
              {query.data.data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={columns.length} className="p-6 text-sm text-muted-foreground">
                    {empty}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {meta && meta.total > PAGE_SIZE && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t p-3 text-sm">
              <span className="text-muted-foreground">
                Page {meta.page} of {meta.totalPages} · {meta.total} records
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={meta.page <= 1 || query.isFetching}
                  onClick={() => setPage(meta.page - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={meta.page >= meta.totalPages || query.isFetching}
                  onClick={() => setPage(meta.page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Badge({
  children,
  attention = false,
}: {
  children: ReactNode;
  attention?: boolean;
}): ReactElement {
  return (
    <span
      className={
        attention
          ? 'inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200'
          : 'inline-block rounded-full bg-muted px-2 py-0.5 text-xs font-medium'
      }
    >
      {children}
    </span>
  );
}

type ItemDialog =
  { type: 'create' | 'import' } | { type: 'edit' | 'open' | 'adjust'; item: InventoryItem };

export function ItemList({
  onHistory,
}: {
  onHistory: (item: InventoryItem) => void;
}): ReactElement {
  const filters = useListFilters<InventoryItemQuery['status']>('ACTIVE');
  const { mutateAsync: exportCsv, isPending: exporting } = useExportInventoryCsv();
  const query = useInventoryItems({
    page: filters.page,
    pageSize: PAGE_SIZE,
    q: filters.q,
    status: filters.status,
  });
  const [dialog, setDialog] = useState<ItemDialog>();
  const close = useCallback(() => setDialog(undefined), []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form className="flex flex-wrap items-end gap-2" onSubmit={filters.applySearch}>
          <InventoryInput
            label="Find ingredient"
            placeholder="Name or SKU"
            maxLength={150}
            {...filters.search}
          />
          <InventorySelect
            label="Show"
            options={[
              { value: 'ACTIVE', label: 'Active ingredients' },
              { value: 'LOW_STOCK', label: 'Low stock' },
              { value: 'ARCHIVED', label: 'Archived ingredients' },
            ]}
            {...filters.select}
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setDialog({ type: 'import' })}>
            <Upload /> Import CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={exporting}
            title="Export ingredients matching the current search and filter"
            onClick={async () => {
              try {
                await exportCsv({ q: filters.q, status: filters.status });
              } catch {
                // The request hook displays the error.
              }
            }}
          >
            <Download /> {exporting ? 'Exporting…' : 'Export CSV'}
          </Button>
          <Button onClick={() => setDialog({ type: 'create' })}>
            <Plus /> New ingredient
          </Button>
        </div>
      </div>
      <InventoryTable
        query={query}
        setPage={filters.setPage}
        caption="Ingredients"
        empty="No ingredients found."
        columns={[
          'Ingredient',
          'On hand',
          'Reorder level',
          'Average unit cost',
          'Status',
          'Actions',
        ]}
        render={(item) => (
          <TableRow key={item.id}>
            <TableCell className="px-4 font-medium">
              {item.name}
              {item.sku && (
                <div className="text-xs font-normal text-muted-foreground">{item.sku}</div>
              )}
            </TableCell>
            <TableCell className="px-4 tabular-nums">
              {item.openedAt ? withUnit(item.currentStock, item.baseUnit) : '—'}
            </TableCell>
            <TableCell className="px-4 tabular-nums">
              {item.baseUnit ? withUnit(item.reorderLevel, item.baseUnit) : '—'}
            </TableCell>
            <TableCell className="px-4 tabular-nums">{item.averageUnitCost ?? '—'}</TableCell>
            <TableCell className="px-4">
              <Badge attention={!item.openedAt || item.lowStock}>
                {!item.isActive
                  ? 'Archived'
                  : !item.baseUnit
                    ? 'Needs setup'
                    : !item.openedAt
                      ? 'Opening count due'
                      : item.lowStock
                        ? 'Low stock'
                        : 'In stock'}
              </Badge>
            </TableCell>
            <TableCell className="px-4">
              <div className="flex flex-wrap gap-1">
                <Button variant="ghost" size="sm" onClick={() => setDialog({ type: 'edit', item })}>
                  {item.baseUnit ? 'Edit' : 'Configure'}
                </Button>
                {item.isActive && item.baseUnit && !item.openedAt && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDialog({ type: 'open', item })}
                  >
                    Record count
                  </Button>
                )}
                {item.isActive && item.openedAt && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDialog({ type: 'adjust', item })}
                  >
                    Adjust
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => onHistory(item)}>
                  History
                </Button>
              </div>
            </TableCell>
          </TableRow>
        )}
      />
      {dialog?.type === 'create' && <ItemForm onClose={close} />}
      {dialog?.type === 'import' && <CsvImportForm onClose={close} />}
      {dialog?.type === 'edit' && <ItemForm item={dialog.item} onClose={close} />}
      {dialog?.type === 'open' && <OpeningForm item={dialog.item} onClose={close} />}
      {dialog?.type === 'adjust' && <AdjustmentForm item={dialog.item} onClose={close} />}
    </div>
  );
}

export function BatchList(): ReactElement {
  const filters = useListFilters<InventoryBatchQuery['status']>('ON_HAND');
  const query = useInventoryBatches({
    page: filters.page,
    pageSize: PAGE_SIZE,
    status: filters.status,
  });
  const [batch, setBatch] = useState<InventoryBatch>();
  const close = useCallback(() => setBatch(undefined), []);

  return (
    <div className="space-y-4">
      <div className="w-fit">
        <InventorySelect
          label="Show"
          options={[
            { value: 'ON_HAND', label: 'On hand' },
            { value: 'EXPIRED', label: 'Expired stock' },
            { value: 'ALL', label: 'All batches' },
          ]}
          {...filters.select}
        />
      </div>
      <InventoryTable
        query={query}
        setPage={filters.setPage}
        caption="Stock batches"
        empty="No batches found."
        columns={[
          'Ingredient',
          'Batch',
          'Received',
          'Remaining',
          'Unit cost',
          'Expiry date',
          'Actions',
        ]}
        render={(lot) => (
          <TableRow key={lot.id}>
            <TableCell className="px-4 font-medium">{lot.stockItem.name}</TableCell>
            <TableCell className="px-4 whitespace-normal break-all">{lot.batchNumber}</TableCell>
            <TableCell className="px-4 tabular-nums">
              {withUnit(lot.quantityReceived, lot.stockItem.baseUnit)}
            </TableCell>
            <TableCell className="px-4 tabular-nums">
              {withUnit(lot.quantityRemaining, lot.stockItem.baseUnit)}
            </TableCell>
            <TableCell className="px-4 tabular-nums">{lot.unitCost}</TableCell>
            <TableCell className="px-4">
              {lot.expiryDate ?? '—'} {lot.expired && <Badge attention>Expired</Badge>}
            </TableCell>
            <TableCell className="px-4">
              {Number(lot.quantityRemaining) > 0 && (
                <Button size="sm" variant="outline" onClick={() => setBatch(lot)}>
                  Record waste
                </Button>
              )}
            </TableCell>
          </TableRow>
        )}
      />
      {batch && <WasteForm batch={batch} onClose={close} />}
    </div>
  );
}

const movementLabels: Record<InventoryMovement['kind'], string> = {
  OPENING: 'Opening count',
  ADJUSTMENT: 'Adjustment',
  RECEIPT: 'Receipt',
  WASTE: 'Waste',
  USAGE: 'Recipe usage',
};

export function MovementList({
  item,
  onClear,
}: {
  item?: InventoryItem;
  onClear: () => void;
}): ReactElement {
  const filters = useListFilters<NonNullable<InventoryMovementQuery['kind']> | ''>('');
  const query = useInventoryMovements({
    page: filters.page,
    pageSize: PAGE_SIZE,
    kind: filters.status || undefined,
    stockItemId: item?.id,
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <InventorySelect
          label="Movement type"
          options={[
            { value: '', label: 'All movements' },
            ...Object.entries(movementLabels).map(([value, label]) => ({ value, label })),
          ]}
          {...filters.select}
        />
        {item && (
          <Button
            variant="outline"
            onClick={() => {
              filters.setPage(1);
              onClear();
            }}
          >
            Clear ingredient filter: {item.name}
          </Button>
        )}
      </div>
      <InventoryTable
        query={query}
        setPage={filters.setPage}
        caption="Movement history"
        empty="No stock movements found."
        columns={[
          'When',
          'Ingredient',
          'Type',
          'Change',
          'Unit cost',
          'Batch',
          'Reason',
          'Recorded by',
        ]}
        render={(movement) => (
          <TableRow key={movement.id}>
            <TableCell className="px-4">{localDate(movement.createdAt)}</TableCell>
            <TableCell className="px-4 font-medium">{movement.stockItem.name}</TableCell>
            <TableCell className="px-4">
              <Badge>{movementLabels[movement.kind]}</Badge>
            </TableCell>
            <TableCell className="px-4 tabular-nums">
              {Number(movement.quantity) > 0 && '+'}
              {withUnit(movement.quantity, movement.stockItem.baseUnit)}
            </TableCell>
            <TableCell className="px-4 tabular-nums">{movement.unitCost ?? '—'}</TableCell>
            <TableCell className="px-4 whitespace-normal break-all">
              {movement.batchNumber ?? '—'}
            </TableCell>
            <TableCell className="max-w-64 px-4 whitespace-normal break-words">
              {movement.reason}
            </TableCell>
            <TableCell className="px-4">{movement.actorName}</TableCell>
          </TableRow>
        )}
      />
    </div>
  );
}

export function SupplierList(): ReactElement {
  const filters = useListFilters<InventorySupplierQuery['status']>('ACTIVE');
  const query = useInventorySuppliers({
    page: filters.page,
    pageSize: PAGE_SIZE,
    q: filters.q,
    status: filters.status,
  });
  const [dialog, setDialog] = useState<{ supplier?: InventorySupplier }>();
  const close = useCallback(() => setDialog(undefined), []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form className="flex flex-wrap items-end gap-2" onSubmit={filters.applySearch}>
          <InventoryInput
            label="Find supplier"
            placeholder="Supplier name"
            maxLength={150}
            {...filters.search}
          />
          <InventorySelect
            label="Show"
            options={[
              { value: 'ACTIVE', label: 'Active suppliers' },
              { value: 'ARCHIVED', label: 'Archived suppliers' },
            ]}
            {...filters.select}
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <Button onClick={() => setDialog({})}>
          <Plus /> New supplier
        </Button>
      </div>
      <InventoryTable
        query={query}
        setPage={filters.setPage}
        caption="Suppliers"
        empty="No suppliers found."
        columns={['Supplier', 'Contact', 'Email', 'Phone', 'Status', 'Actions']}
        render={(supplier) => (
          <TableRow key={supplier.id}>
            <TableCell className="px-4 font-medium">{supplier.name}</TableCell>
            <TableCell className="px-4">{supplier.contactName || '—'}</TableCell>
            <TableCell className="px-4">{supplier.email || '—'}</TableCell>
            <TableCell className="px-4">{supplier.phone || '—'}</TableCell>
            <TableCell className="px-4">
              <Badge>{supplier.isActive ? 'Active' : 'Archived'}</Badge>
            </TableCell>
            <TableCell className="px-4">
              <Button variant="ghost" size="sm" onClick={() => setDialog({ supplier })}>
                Edit
              </Button>
            </TableCell>
          </TableRow>
        )}
      />
      {dialog && <SupplierForm supplier={dialog.supplier} onClose={close} />}
    </div>
  );
}

const purchaseLabels: Record<InventoryPurchase['status'], string> = {
  DRAFT: 'Draft',
  SENT: 'Sent',
  PARTIALLY_RECEIVED: 'Partially received',
  RECEIVED: 'Received',
  CANCELLED: 'Cancelled',
};
type PurchaseDialog =
  { type: 'create' } | { type: 'details' | 'receive'; purchase: InventoryPurchase };

export function PurchaseList(): ReactElement {
  const filters = useListFilters<NonNullable<InventoryPurchaseQuery['status']> | ''>('');
  const query = useInventoryPurchases({
    page: filters.page,
    pageSize: PAGE_SIZE,
    status: filters.status || undefined,
  });
  const [dialog, setDialog] = useState<PurchaseDialog>();
  const close = useCallback(() => setDialog(undefined), []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-fit">
          <InventorySelect
            label="Status"
            options={[
              { value: '', label: 'All orders' },
              ...Object.entries(purchaseLabels).map(([value, label]) => ({ value, label })),
            ]}
            {...filters.select}
          />
        </div>
        <Button onClick={() => setDialog({ type: 'create' })}>
          <Plus /> New purchase order
        </Button>
      </div>
      <InventoryTable
        query={query}
        setPage={filters.setPage}
        caption="Purchase orders"
        empty="No purchase orders found."
        columns={['Order', 'Supplier', 'Status', 'Expected delivery', 'Created', 'Actions']}
        render={(purchase) => (
          <TableRow key={purchase.id}>
            <TableCell className="px-4 font-medium">PO-{purchase.number}</TableCell>
            <TableCell className="px-4">{purchase.supplier.name}</TableCell>
            <TableCell className="px-4">
              <Badge>{purchaseLabels[purchase.status]}</Badge>
            </TableCell>
            <TableCell className="px-4">{purchase.expectedDate ?? '—'}</TableCell>
            <TableCell className="px-4">{localDate(purchase.createdAt)}</TableCell>
            <TableCell className="px-4">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDialog({ type: 'details', purchase })}
              >
                View order
              </Button>
            </TableCell>
          </TableRow>
        )}
      />
      {dialog?.type === 'create' && <DocumentForm mode="purchase" onClose={close} />}
      {dialog?.type === 'details' && (
        <PurchaseDetails
          purchase={dialog.purchase}
          onClose={close}
          onReceive={() => setDialog({ type: 'receive', purchase: dialog.purchase })}
        />
      )}
      {dialog?.type === 'receive' && (
        <DocumentForm mode="receipt" purchase={dialog.purchase} onClose={close} />
      )}
    </div>
  );
}

export function ReceiptList(): ReactElement {
  const filters = useListFilters('');
  const query = useInventoryReceipts({ page: filters.page, pageSize: PAGE_SIZE });
  const [dialog, setDialog] = useState<{ receipt?: InventoryReceipt }>();
  const close = useCallback(() => setDialog(undefined), []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end">
        <Button onClick={() => setDialog({})}>
          <Plus /> Record direct receipt
        </Button>
      </div>
      <InventoryTable
        query={query}
        setPage={filters.setPage}
        caption="Goods receipts"
        empty="No goods receipts found."
        columns={['Receipt', 'Supplier', 'Purchase order', 'Received', 'Actions']}
        render={(receipt) => (
          <TableRow key={receipt.id}>
            <TableCell className="px-4 font-medium">GRN-{receipt.number}</TableCell>
            <TableCell className="px-4">{receipt.supplier.name}</TableCell>
            <TableCell className="px-4">
              {receipt.purchaseOrder ? `PO-${receipt.purchaseOrder.number}` : 'Direct'}
            </TableCell>
            <TableCell className="px-4">{localDate(receipt.createdAt)}</TableCell>
            <TableCell className="px-4">
              <Button size="sm" variant="outline" onClick={() => setDialog({ receipt })}>
                View receipt
              </Button>
            </TableCell>
          </TableRow>
        )}
      />
      {dialog?.receipt && <ReceiptDetails receipt={dialog.receipt} onClose={close} />}
      {dialog && !dialog.receipt && <DocumentForm mode="receipt" onClose={close} />}
    </div>
  );
}
