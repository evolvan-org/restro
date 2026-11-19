import { z } from 'zod';

import { paginatedResponseSchema, paginationQuerySchema } from './common';
import { unitSchema } from './stock-items';

const id = z.string().uuid();
const timestamp = z.string().datetime();
const quantity = z.string().regex(/^\d{1,9}(?:\.\d{1,3})?$/, 'Enter up to 3 decimal places');
const positive = quantity.refine(
  (value) => Number(value) > 0,
  'Quantity must be greater than zero',
);
const signedQuantity = z
  .string()
  .regex(/^-?\d{1,9}(?:\.\d{1,3})?$/, 'Enter up to 3 decimal places');
const cost = z.string().regex(/^\d{1,10}(?:\.\d{1,8})?$/, 'Enter up to 8 decimal places');
const reason = z.string().trim().min(1, 'Enter a reason').max(500);
const notes = z.string().trim().max(500);
const decimal = z.string();
const dateOnly = z.string().date();

export const inventoryBaseUnitSchema = z.enum(['G', 'ML', 'UNIT']);
export const inventoryItemFilterSchema = z.object({
  q: z.string().trim().max(150).optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED', 'LOW_STOCK']).default('ACTIVE'),
});
export const inventoryItemQuerySchema = paginationQuerySchema.merge(inventoryItemFilterSchema);
export const inventoryListQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(150).optional(),
});
export const inventoryBatchQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['ON_HAND', 'EXPIRED', 'ALL']).default('ON_HAND'),
});
export const inventoryMovementQuerySchema = paginationQuerySchema.extend({
  stockItemId: id.optional(),
  kind: z.enum(['OPENING', 'ADJUSTMENT', 'RECEIPT', 'WASTE']).optional(),
});

const itemFields = {
  name: z.string().trim().min(1, 'Enter an ingredient name').max(150),
  sku: z.string().trim().max(60),
  baseUnit: inventoryBaseUnitSchema,
  reorderLevel: quantity,
};
export const createInventoryItemSchema = z.object(itemFields).strict();
export const updateInventoryItemSchema = z
  .object({
    ...itemFields,
    isActive: z.boolean(),
  })
  .strict();

export const inventoryItemSchema = z.object({
  id,
  name: z.string(),
  sku: z.string().nullable(),
  baseUnit: inventoryBaseUnitSchema.nullable(),
  reorderLevel: decimal,
  currentStock: decimal,
  averageUnitCost: decimal.nullable(),
  openedAt: timestamp.nullable(),
  isActive: z.boolean(),
  lowStock: z.boolean(),
});
export const inventoryItemsSchema = paginatedResponseSchema(inventoryItemSchema);

export const INVENTORY_CSV_MAX_BYTES = 256 * 1024;
export const INVENTORY_CSV_MAX_ROWS = 200;
export const inventoryCsvItemSchema = createInventoryItemSchema.extend({
  id: id.optional(),
  sku: itemFields.sku.optional(),
  baseUnit: itemFields.baseUnit.optional(),
});
export const inventoryCsvImportResultSchema = z.object({
  created: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  opened: z.number().int().nonnegative(),
});

export const openingStockSchema = z
  .object({
    quantity,
    unitCost: cost,
    reason,
  })
  .strict();
export const adjustInventoryStockSchema = z
  .object({
    quantity: signedQuantity.refine((value) => Number(value) !== 0, 'Enter a non-zero quantity'),
    unitCost: cost.optional(),
    reason,
  })
  .strict();
export const logInventoryWasteSchema = z.object({ quantity: positive, reason }).strict();

const stockIdentity = z.object({
  id,
  name: z.string(),
  baseUnit: inventoryBaseUnitSchema.nullable(),
});
export const inventoryBatchSchema = z.object({
  id,
  stockItem: stockIdentity,
  batchNumber: z.string(),
  quantityReceived: decimal,
  quantityRemaining: decimal,
  unitCost: decimal,
  expiryDate: dateOnly.nullable(),
  receivedAt: timestamp,
  expired: z.boolean(),
});
export const inventoryBatchesSchema = paginatedResponseSchema(inventoryBatchSchema);
export const inventoryMovementSchema = z.object({
  id,
  stockItem: stockIdentity,
  batchNumber: z.string().nullable(),
  kind: z.enum(['OPENING', 'ADJUSTMENT', 'RECEIPT', 'WASTE']),
  quantity: decimal,
  unitCost: decimal.nullable(),
  reason: z.string(),
  actorName: z.string(),
  receiptId: id.nullable(),
  createdAt: timestamp,
});
export const inventoryMovementsSchema = paginatedResponseSchema(inventoryMovementSchema);

const supplierFields = {
  name: z.string().trim().min(1, 'Enter a supplier name').max(150),
  contactName: z.string().trim().max(150),
  email: z.union([z.string().trim().max(255).email(), z.literal('')]),
  phone: z.string().trim().max(30),
  address: z.string().trim().max(500),
};
export const createInventorySupplierSchema = z.object(supplierFields).strict();
export const updateInventorySupplierSchema = z
  .object({
    ...supplierFields,
    isActive: z.boolean(),
  })
  .strict();
export const inventorySupplierSchema = z.object({
  id,
  ...supplierFields,
  isActive: z.boolean(),
});
export const inventoryOptionsSchema = z.object({
  items: z.array(
    z.object({
      id,
      name: z.string(),
      baseUnit: inventoryBaseUnitSchema,
      opened: z.boolean(),
    }),
  ),
  suppliers: z.array(z.object({ id, name: z.string() })),
});
export const inventorySupplierQuerySchema = inventoryListQuerySchema.extend({
  status: z.enum(['ACTIVE', 'ARCHIVED']).default('ACTIVE'),
});
export const inventorySuppliersSchema = paginatedResponseSchema(inventorySupplierSchema);

export const inventoryPackageUnits = ['PACK', 'BOX', 'BAG'] as const;
export const inventorySupplyUnitSchema = z.enum([...unitSchema.options, ...inventoryPackageUnits], {
  errorMap: () => ({ message: 'Select a supplier unit' }),
});
export const inventorySupplyMeasures = {
  G: { baseUnit: 'G', factor: 1 },
  KG: { baseUnit: 'G', factor: 1000 },
  ML: { baseUnit: 'ML', factor: 1 },
  L: { baseUnit: 'ML', factor: 1000 },
  UNIT: { baseUnit: 'UNIT', factor: 1 },
} as const;

export function isInventoryPackageUnit(
  unit: string | undefined | null,
): unit is (typeof inventoryPackageUnits)[number] {
  return unit === 'PACK' || unit === 'BOX' || unit === 'BAG';
}

const inventoryPackageSizeSchema = z
  .object({
    quantity: positive,
    unit: unitSchema,
  })
  .strict();

export const inventoryPurchaseStatusSchema = z.enum([
  'DRAFT',
  'SENT',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED',
]);
const supplyLineSchema = z
  .object({
    stockItemId: id,
    quantity: positive,
    unitCost: cost,
    unit: inventorySupplyUnitSchema
      .optional()
      .describe('Supplier unit. Defaults to the PO line unit or the ingredient base unit.'),
    packageSize: inventoryPackageSizeSchema.optional(),
  })
  .strict();

function checkPackageSize(line: z.infer<typeof supplyLineSchema>, context: z.RefinementCtx): void {
  const packaged = isInventoryPackageUnit(line.unit);
  if (packaged === Boolean(line.packageSize)) return;
  context.addIssue({
    code: 'custom',
    path: ['packageSize'],
    message: packaged
      ? 'Enter the quantity and unit in one package'
      : 'Choose a package unit to set package contents',
  });
}

const purchaseLineSchema = supplyLineSchema.superRefine(checkPackageSize);
const supplyLineResponseFields = {
  unit: inventorySupplyUnitSchema.nullable(),
  packageSize: inventoryPackageSizeSchema.nullable(),
};
export const createInventoryPurchaseSchema = z
  .object({
    supplierId: id,
    expectedDate: dateOnly.optional(),
    notes,
    lines: z.array(purchaseLineSchema).min(1).max(50),
  })
  .strict()
  .refine(
    ({ lines }) => new Set(lines.map(({ stockItemId }) => stockItemId)).size === lines.length,
    {
      message: 'Each ingredient can appear once on a purchase order',
      path: ['lines'],
    },
  );
export const updateInventoryPurchaseStatusSchema = z
  .object({
    status: z.enum(['SENT', 'CANCELLED']),
  })
  .strict();
const supplierIdentity = z.object({ id, name: z.string() });
export const inventoryPurchaseSchema = z.object({
  id,
  number: z.number().int().positive(),
  supplier: supplierIdentity,
  status: inventoryPurchaseStatusSchema,
  expectedDate: dateOnly.nullable(),
  notes: z.string(),
  createdAt: timestamp,
  lines: z.array(
    z.object({
      id,
      stockItem: stockIdentity,
      quantity: decimal,
      quantityReceived: decimal,
      quantityRemaining: decimal,
      unitCost: decimal,
      ...supplyLineResponseFields,
    }),
  ),
});
export const inventoryPurchasesSchema = paginatedResponseSchema(inventoryPurchaseSchema);
export const inventoryPurchaseQuerySchema = paginationQuerySchema.extend({
  status: inventoryPurchaseStatusSchema.optional(),
});

const receiptLineSchema = supplyLineSchema
  .extend({
    purchaseOrderLineId: id.optional(),
    batchNumber: z.string().trim().max(80),
    expiryDate: dateOnly.optional(),
  })
  .strict()
  .superRefine(checkPackageSize);
export const createInventoryReceiptSchema = z
  .object({
    idempotencyKey: id,
    supplierId: id,
    purchaseOrderId: id.optional(),
    notes,
    lines: z.array(receiptLineSchema).min(1).max(50),
  })
  .strict()
  .superRefine(({ purchaseOrderId, lines }, context) => {
    lines.forEach(({ purchaseOrderLineId }, index) => {
      if (Boolean(purchaseOrderId) !== Boolean(purchaseOrderLineId)) {
        context.addIssue({
          code: 'custom',
          path: ['lines', index, 'purchaseOrderLineId'],
          message: purchaseOrderId
            ? 'Select a purchase order line'
            : 'A direct receipt cannot reference a purchase order line',
        });
      }
    });
  });
export const inventoryReceiptSchema = z.object({
  id,
  number: z.number().int().positive(),
  supplier: supplierIdentity,
  purchaseOrder: z.object({ id, number: z.number().int().positive() }).nullable(),
  notes: z.string(),
  createdAt: timestamp,
  lines: z.array(
    z.object({
      id,
      stockItem: stockIdentity,
      purchaseOrderLineId: id.nullable(),
      quantity: decimal,
      unitCost: decimal,
      ...supplyLineResponseFields,
      batchNumber: z.string(),
      expiryDate: dateOnly.nullable(),
    }),
  ),
});
export const inventoryReceiptsSchema = paginatedResponseSchema(inventoryReceiptSchema);
export const inventoryReceiptQuerySchema = paginationQuerySchema.extend({
  purchaseOrderId: id.optional(),
});

export type InventorySupplyUnit = z.infer<typeof inventorySupplyUnitSchema>;
export type InventoryPackageSize = z.infer<typeof inventoryPackageSizeSchema>;
export type InventoryOptions = z.infer<typeof inventoryOptionsSchema>;
export type InventoryItem = z.infer<typeof inventoryItemSchema>;
export type InventoryBatch = z.infer<typeof inventoryBatchSchema>;
export type InventoryMovement = z.infer<typeof inventoryMovementSchema>;
export type InventorySupplier = z.infer<typeof inventorySupplierSchema>;
export type InventoryPurchase = z.infer<typeof inventoryPurchaseSchema>;
export type InventoryReceipt = z.infer<typeof inventoryReceiptSchema>;
export type InventoryCsvItem = z.infer<typeof inventoryCsvItemSchema>;
export type InventoryCsvImportResult = z.infer<typeof inventoryCsvImportResultSchema>;
export type InventoryItemFilter = z.infer<typeof inventoryItemFilterSchema>;
export type InventoryItemQuery = z.infer<typeof inventoryItemQuerySchema>;
export type InventoryBatchQuery = z.infer<typeof inventoryBatchQuerySchema>;
export type InventoryMovementQuery = z.infer<typeof inventoryMovementQuerySchema>;
export type InventorySupplierQuery = z.infer<typeof inventorySupplierQuerySchema>;
export type InventoryPurchaseQuery = z.infer<typeof inventoryPurchaseQuerySchema>;
export type InventoryReceiptQuery = z.infer<typeof inventoryReceiptQuerySchema>;
export type CreateInventoryItem = z.infer<typeof createInventoryItemSchema>;
export type UpdateInventoryItem = z.infer<typeof updateInventoryItemSchema>;
export type OpeningInventoryStock = z.infer<typeof openingStockSchema>;
export type AdjustInventoryStock = z.infer<typeof adjustInventoryStockSchema>;
export type LogInventoryWaste = z.infer<typeof logInventoryWasteSchema>;
export type CreateInventorySupplier = z.infer<typeof createInventorySupplierSchema>;
export type UpdateInventorySupplier = z.infer<typeof updateInventorySupplierSchema>;
export type CreateInventoryPurchase = z.infer<typeof createInventoryPurchaseSchema>;
export type UpdateInventoryPurchaseStatus = z.infer<typeof updateInventoryPurchaseStatusSchema>;
export type CreateInventoryReceipt = z.infer<typeof createInventoryReceiptSchema>;
