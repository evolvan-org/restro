import type {
  InventoryBatch,
  InventoryItem,
  InventoryMovement,
  InventoryPurchase,
  InventoryReceipt,
  InventorySupplier,
} from '@rms/api-contract';
import type { InventorySupplier as SupplierRecord, StockItem } from '@rms/db';

import type {
  InventoryBatchRecord,
  InventoryMovementRecord,
  InventoryPurchaseRecord,
  InventoryReceiptRecord,
} from './inventory.repository';
import { inventorySupplyTerms } from './inventory-supply';

const dateOnly = (date: Date | null): string | null => date?.toISOString().slice(0, 10) ?? null;

export function toInventoryItem(row: StockItem): InventoryItem {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    baseUnit: row.baseUnit,
    reorderLevel: row.reorderLevel.toFixed(),
    currentStock: row.currentStock.toFixed(),
    averageUnitCost: row.averageUnitCost?.toFixed() ?? null,
    openedAt: row.openedAt?.toISOString() ?? null,
    isActive: row.isActive,
    lowStock: row.isActive && row.openedAt !== null && row.currentStock.lte(row.reorderLevel),
  };
}

export function toInventoryBatch(row: InventoryBatchRecord, cutoff: Date): InventoryBatch {
  return {
    id: row.id,
    stockItem: row.stockItem,
    batchNumber: row.batchNumber,
    quantityReceived: row.quantityReceived.toFixed(),
    quantityRemaining: row.quantityRemaining.toFixed(),
    unitCost: row.unitCost.toFixed(),
    expiryDate: dateOnly(row.expiryDate),
    receivedAt: row.receivedAt.toISOString(),
    expired: row.expiryDate !== null && row.expiryDate < cutoff,
  };
}

export function toInventoryMovement(row: InventoryMovementRecord): InventoryMovement {
  return {
    id: row.id,
    stockItem: row.stockItem,
    batchNumber: row.batch?.batchNumber ?? null,
    kind: row.kind,
    quantity: row.quantity.toFixed(),
    unitCost: row.unitCost?.toFixed() ?? null,
    reason: row.reason,
    actorName: row.actor.name,
    receiptId: row.receiptId,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toInventorySupplier(row: SupplierRecord): InventorySupplier {
  const { id, name, contactName, email, phone, address, gstin, isActive } = row;
  return { id, name, contactName, email, phone, address, gstin, isActive };
}

export function toInventoryPurchase(row: InventoryPurchaseRecord): InventoryPurchase {
  return {
    id: row.id,
    number: row.number,
    supplier: row.supplier,
    status: row.status,
    expectedDate: dateOnly(row.expectedDate),
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    lines: row.lines.map((line) => ({
      id: line.id,
      stockItem: line.stockItem,
      quantity: line.quantity.toFixed(),
      quantityReceived: line.quantityReceived.toFixed(),
      quantityRemaining: line.quantity.minus(line.quantityReceived).toFixed(),
      unitCost: line.unitCost.toFixed(),
      ...inventorySupplyTerms(line),
    })),
  };
}

export function toInventoryReceipt(row: InventoryReceiptRecord): InventoryReceipt {
  return {
    id: row.id,
    number: row.number,
    supplier: row.supplier,
    purchaseOrder: row.purchaseOrder,
    notes: row.notes,
    supplierInvoiceNumber: row.supplierInvoiceNumber,
    supplierInvoiceDate: dateOnly(row.supplierInvoiceDate),
    invoiceTotal: row.invoiceTotal?.toFixed(2) ?? null,
    createdAt: row.createdAt.toISOString(),
    lines: row.lines.map((line) => ({
      id: line.id,
      stockItem: line.stockItem,
      purchaseOrderLineId: line.purchaseOrderLineId,
      quantity: line.quantity.toFixed(),
      unitCost: line.unitCost.toFixed(),
      ...inventorySupplyTerms(line),
      batchNumber: line.batchNumber,
      expiryDate: dateOnly(line.expiryDate),
    })),
  };
}
