import {
  type AdjustInventoryStock,
  type CreateInventoryItem,
  type CreateInventoryPurchase,
  type CreateInventoryReceipt,
  type CreateInventorySupplier,
  inventoryBatchesSchema,
  type InventoryBatchQuery,
  inventoryCsvImportResultSchema,
  type InventoryItemFilter,
  type InventoryItemQuery,
  inventoryItemSchema,
  inventoryItemsSchema,
  type InventoryMovementQuery,
  inventoryMovementsSchema,
  inventoryOptionsSchema,
  type InventoryPurchaseQuery,
  inventoryPurchaseSchema,
  inventoryPurchasesSchema,
  type InventoryReceiptQuery,
  inventoryReceiptSchema,
  inventoryReceiptsSchema,
  type InventorySupplierQuery,
  inventorySupplierSchema,
  inventorySuppliersSchema,
  type LogInventoryWaste,
  type OpeningInventoryStock,
  type UpdateInventoryItem,
  type UpdateInventoryPurchaseStatus,
  type UpdateInventorySupplier,
} from '@rms/api-contract';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { ZodType } from 'zod';

import useShowApiError from '@/hooks/api/useShowApiError';
import { api } from '@/lib/api';
import { downloadBlob } from '@/lib/download-blob';

import { MenuItemQueryKey } from '../types/MenuItemQueryKey';

const inventoryKey = ['inventory'] as const;

function useInventoryQuery<T>(path: string, schema: ZodType<T>, params?: object, enabled = true) {
  return useQuery({
    queryKey: [...inventoryKey, path, params],
    queryFn: async ({ signal }) =>
      schema.parse((await api.get(`/inventory/${path}`, { params, signal })).data),
    enabled,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export function useInventoryItems(query: InventoryItemQuery) {
  return useInventoryQuery('items', inventoryItemsSchema, query);
}

export function useInventoryBatches(query: InventoryBatchQuery) {
  return useInventoryQuery('batches', inventoryBatchesSchema, query);
}

export function useInventoryMovements(query: InventoryMovementQuery) {
  return useInventoryQuery('movements', inventoryMovementsSchema, query);
}

export function useInventorySuppliers(query: InventorySupplierQuery) {
  return useInventoryQuery('suppliers', inventorySuppliersSchema, query);
}

export function useInventoryPurchases(query: InventoryPurchaseQuery) {
  return useInventoryQuery('purchase-orders', inventoryPurchasesSchema, query);
}

export function useInventoryReceipts(query: InventoryReceiptQuery) {
  return useInventoryQuery('goods-receipts', inventoryReceiptsSchema, query);
}

export function useInventoryOptions(enabled: boolean) {
  return useInventoryQuery('options', inventoryOptionsSchema, undefined, enabled);
}

type InventoryCommand =
  | { type: 'createItem'; input: CreateInventoryItem }
  | { type: 'updateItem'; id: string; input: UpdateInventoryItem }
  | { type: 'openStock'; id: string; input: OpeningInventoryStock }
  | { type: 'adjustStock'; id: string; input: AdjustInventoryStock }
  | { type: 'waste'; id: string; input: LogInventoryWaste }
  | { type: 'createSupplier'; input: CreateInventorySupplier }
  | { type: 'updateSupplier'; id: string; input: UpdateInventorySupplier }
  | { type: 'createPurchase'; input: CreateInventoryPurchase }
  | { type: 'purchaseStatus'; id: string; input: UpdateInventoryPurchaseStatus }
  | { type: 'receive'; input: CreateInventoryReceipt };

async function sendInventoryCommand(command: InventoryCommand) {
  switch (command.type) {
    case 'createItem':
      return inventoryItemSchema.parse((await api.post('/inventory/items', command.input)).data);
    case 'updateItem':
      return inventoryItemSchema.parse(
        (await api.patch(`/inventory/items/${command.id}`, command.input)).data,
      );
    case 'openStock':
      return inventoryItemSchema.parse(
        (await api.post(`/inventory/items/${command.id}/opening`, command.input)).data,
      );
    case 'adjustStock':
      return inventoryItemSchema.parse(
        (await api.post(`/inventory/items/${command.id}/adjustments`, command.input)).data,
      );
    case 'waste':
      return inventoryItemSchema.parse(
        (await api.post(`/inventory/batches/${command.id}/waste`, command.input)).data,
      );
    case 'createSupplier':
      return inventorySupplierSchema.parse(
        (await api.post('/inventory/suppliers', command.input)).data,
      );
    case 'updateSupplier':
      return inventorySupplierSchema.parse(
        (await api.patch(`/inventory/suppliers/${command.id}`, command.input)).data,
      );
    case 'createPurchase':
      return inventoryPurchaseSchema.parse(
        (await api.post('/inventory/purchase-orders', command.input)).data,
      );
    case 'purchaseStatus':
      return inventoryPurchaseSchema.parse(
        (await api.patch(`/inventory/purchase-orders/${command.id}/status`, command.input)).data,
      );
    case 'receive':
      return inventoryReceiptSchema.parse(
        (await api.post('/inventory/goods-receipts', command.input)).data,
      );
  }
}

export function useInventoryCommand() {
  const client = useQueryClient();
  const showApiError = useShowApiError('Unable to save this inventory change.');
  return useMutation({
    mutationFn: sendInventoryCommand,
    onError: showApiError,
    onSuccess: async (_, command) => {
      await client.invalidateQueries({ queryKey: inventoryKey });
      if (command.type === 'createItem' || command.type === 'updateItem') {
        await client.invalidateQueries({ queryKey: [MenuItemQueryKey.StockItems] });
      }
    },
  });
}

export function useExportInventoryCsv() {
  const showApiError = useShowApiError('Unable to export inventory.');
  return useMutation({
    mutationFn: async (filters: InventoryItemFilter) => {
      const response = await api.get<Blob>('/inventory/items/export', {
        params: filters,
        responseType: 'blob',
      });
      downloadBlob(response.data, 'inventory.csv');
    },
    onError: showApiError,
  });
}

export function useImportInventoryCsv() {
  const client = useQueryClient();
  const showApiError = useShowApiError('Unable to import inventory.');
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      const response = await api.post('/inventory/items/import', form);
      return inventoryCsvImportResultSchema.parse(response.data);
    },
    onError: showApiError,
    onSuccess: async ({ created, updated, opened }) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: inventoryKey }),
        client.invalidateQueries({ queryKey: [MenuItemQueryKey.StockItems] }),
      ]);
      toast.success('Inventory imported', {
        description: `${created} added · ${updated} updated · ${opened} opening counts recorded`,
      });
    },
  });
}
