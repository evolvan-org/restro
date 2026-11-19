/**
 * Ingredient master, suppliers and a few weeks of inventory activity: opening
 * counts, purchase orders in every status, goods receipts (against a PO and
 * direct), waste and stock-count adjustments.
 *
 * The ledger math mirrors apps/api InventoryService (batch per inbound movement,
 * weighted average cost, FIFO removal by receivedAt, supplier-unit → base-unit
 * conversion) so seeded balances reconcile exactly with what the app would write.
 */
import { createHash, randomUUID } from 'node:crypto';

import type {
  InventoryPurchaseStatus,
  InventorySupplyUnit,
  StockBatch,
  StockItem,
  StockMovementKind,
  Unit,
} from '@prisma/client';

import { STOCK_ITEMS, SUPPLIERS, type SupplierKey } from './catalog';
import { Decimal, type DecimalValue, localDate, localTime, type Tx } from './support';

const SUPPLY_FACTOR: Record<Unit, { base: string; factor: number }> = {
  G: { base: 'G', factor: 1 },
  KG: { base: 'G', factor: 1000 },
  ML: { base: 'ML', factor: 1 },
  L: { base: 'ML', factor: 1000 },
  UNIT: { base: 'UNIT', factor: 1 },
};

type SupplyLine = {
  item: string;
  /** Quantity in the supplier unit (packages for PACK/BOX/BAG). */
  quantity: string;
  /** Price per supplier unit. */
  unitCost: string;
  unit: InventorySupplyUnit;
  packageSize?: { quantity: string; unit: Unit };
};

export type StockCatalog = Map<string, StockItem>;

export async function seedStockItems(tx: Tx, restaurantId: string): Promise<StockCatalog> {
  const catalog: StockCatalog = new Map();
  for (const seed of STOCK_ITEMS) {
    const existing = await tx.stockItem.findUnique({
      where: { restaurantId_name: { restaurantId, name: seed.name } },
    });
    let item: StockItem;
    if (!existing) {
      item = await tx.stockItem.create({
        data: {
          restaurantId,
          name: seed.name,
          sku: seed.sku,
          baseUnit: seed.baseUnit,
          reorderLevel: seed.reorderLevel,
        },
      });
    } else if (!existing.baseUnit) {
      // Baseline rows from seed:stock have no unit yet; configure them.
      item = await tx.stockItem.update({
        where: { id: existing.id },
        data: {
          sku: existing.sku ?? seed.sku,
          baseUnit: seed.baseUnit,
          reorderLevel: seed.reorderLevel,
        },
      });
    } else {
      // Already configured in the app: the base unit is immutable, keep it.
      item = existing;
    }
    catalog.set(seed.name, item);
  }
  return catalog;
}

export async function seedSuppliers(
  tx: Tx,
  restaurantId: string,
): Promise<Map<SupplierKey | 'archived', string>> {
  await tx.inventorySupplier.createMany({
    data: SUPPLIERS.map(({ key: _key, ...supplier }) => ({ restaurantId, ...supplier })),
    skipDuplicates: true,
  });
  const ids = new Map<SupplierKey | 'archived', string>();
  for (const supplier of SUPPLIERS) {
    const row = await tx.inventorySupplier.findUniqueOrThrow({
      where: { restaurantId_name: { restaurantId, name: supplier.name } },
      select: { id: true },
    });
    ids.set(supplier.key, row.id);
  }
  return ids;
}

/** In-memory view of the stock ledger, written through to the database. */
class StockLedger {
  constructor(
    private readonly tx: Tx,
    private readonly restaurantId: string,
    private readonly catalog: StockCatalog,
  ) {}

  /** The item if it exists, is active, and its base unit matches the seed's expectation. */
  ready(name: string, opened = true): StockItem | undefined {
    const item = this.catalog.get(name);
    const seed = STOCK_ITEMS.find((entry) => entry.name === name);
    if (!item || !seed || !item.isActive || item.baseUnit !== seed.baseUnit) return undefined;
    if (opened && !item.openedAt) return undefined;
    return item;
  }

  async add(
    item: StockItem,
    input: {
      quantity: DecimalValue;
      unitCost: DecimalValue;
      kind: Exclude<StockMovementKind, 'WASTE'>;
      reason: string;
      batchNumber: string;
      actorId: string;
      at: Date;
      expiryDate?: Date;
      receiptLineId?: string;
      receiptId?: string;
    },
  ): Promise<StockBatch> {
    const balance = input.quantity.plus(item.currentStock);
    const unitCost = input.unitCost.toDecimalPlaces(8, Decimal.ROUND_HALF_UP);
    const batch = await this.tx.stockBatch.create({
      data: {
        restaurantId: this.restaurantId,
        stockItemId: item.id,
        quantityReceived: input.quantity,
        quantityRemaining: input.quantity,
        unitCost,
        batchNumber: input.batchNumber,
        expiryDate: input.expiryDate,
        receiptLineId: input.receiptLineId,
        receivedAt: input.at,
      },
    });
    await this.tx.stockMovement.create({
      data: {
        restaurantId: this.restaurantId,
        stockItemId: item.id,
        batchId: batch.id,
        receiptId: input.receiptId,
        actorId: input.actorId,
        kind: input.kind,
        quantity: input.quantity,
        unitCost,
        reason: input.reason,
        createdAt: input.at,
      },
    });
    const averageUnitCost = new Decimal(item.currentStock)
      .mul(item.averageUnitCost ?? 0)
      .plus(input.quantity.mul(input.unitCost))
      .div(balance)
      .toDecimalPlaces(8, Decimal.ROUND_HALF_UP);
    this.save(
      await this.tx.stockItem.update({
        where: { id: item.id },
        data: { currentStock: balance, averageUnitCost },
      }),
    );
    return batch;
  }

  async remove(
    item: StockItem,
    input: {
      quantity: DecimalValue;
      kind: 'ADJUSTMENT' | 'WASTE';
      reason: string;
      actorId: string;
      at: Date;
      batchId?: string;
    },
  ): Promise<void> {
    const batches = await this.tx.stockBatch.findMany({
      where: {
        restaurantId: this.restaurantId,
        stockItemId: item.id,
        quantityRemaining: { gt: 0 },
        ...(input.batchId ? { id: input.batchId } : {}),
      },
      orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
    });
    let remaining = input.quantity;
    for (const lot of batches) {
      if (remaining.isZero()) break;
      const used = Decimal.min(remaining, lot.quantityRemaining);
      await this.tx.stockBatch.update({
        where: { id: lot.id },
        data: { quantityRemaining: new Decimal(lot.quantityRemaining).minus(used) },
      });
      await this.tx.stockMovement.create({
        data: {
          restaurantId: this.restaurantId,
          stockItemId: item.id,
          batchId: lot.id,
          actorId: input.actorId,
          kind: input.kind,
          quantity: used.negated(),
          unitCost: lot.unitCost,
          reason: input.reason,
          createdAt: input.at,
        },
      });
      remaining = remaining.minus(used);
    }
    if (!remaining.isZero()) throw new Error(`Not enough ${item.name} on hand to remove`);
    this.save(
      await this.tx.stockItem.update({
        where: { id: item.id },
        data: { currentStock: new Decimal(item.currentStock).minus(input.quantity) },
      }),
    );
  }

  async open(item: StockItem, quantity: number, unitCost: string, actorId: string, at: Date) {
    await this.add(item, {
      quantity: new Decimal(quantity),
      unitCost: new Decimal(unitCost),
      kind: 'OPENING',
      reason: 'Opening stock count',
      batchNumber: `OPEN-${randomUUID()}`,
      actorId,
      at,
    });
    this.save(await this.tx.stockItem.update({ where: { id: item.id }, data: { openedAt: at } }));
  }

  private save(item: StockItem): void {
    this.catalog.set(item.name, item);
  }
}

function supplyTerms(line: SupplyLine) {
  const standard = line.packageSize?.unit ?? (line.unit as Unit);
  const { factor } = SUPPLY_FACTOR[standard];
  return {
    factor: new Decimal(line.packageSize?.quantity ?? 1).times(factor),
    packageQuantity: line.packageSize?.quantity ?? null,
    packageUnit: line.packageSize?.unit ?? null,
  };
}

export type InventoryActivitySummary = {
  opened: number;
  purchaseOrders: number;
  receipts: number;
  skippedHistory: boolean;
};

/**
 * Records opening stock for every seeded ingredient that hasn't been opened, then
 * — only when the restaurant has no purchasing history yet — adds purchase orders,
 * goods receipts, waste and adjustments spread over the last two weeks.
 */
export async function seedInventoryActivity(
  tx: Tx,
  restaurantId: string,
  catalog: StockCatalog,
  suppliers: ReadonlyMap<SupplierKey | 'archived', string>,
  actors: { owner: string; manager: string },
): Promise<InventoryActivitySummary> {
  const ledger = new StockLedger(tx, restaurantId, catalog);
  const openedAt = localTime(-35, 9, 30);
  let opened = 0;
  for (const seed of STOCK_ITEMS) {
    const item = ledger.ready(seed.name, false);
    if (!item || item.openedAt) continue;
    await ledger.open(item, seed.opening, seed.unitCost, actors.owner, openedAt);
    opened += 1;
  }

  const [purchaseCount, receiptCount] = await Promise.all([
    tx.inventoryPurchaseOrder.count({ where: { restaurantId } }),
    tx.inventoryReceipt.count({ where: { restaurantId } }),
  ]);
  if (purchaseCount > 0 || receiptCount > 0) {
    return { opened, purchaseOrders: 0, receipts: 0, skippedHistory: true };
  }

  const supplierId = (key: SupplierKey): string => {
    const id = suppliers.get(key);
    if (!id) throw new Error(`Supplier ${key} was not seeded`);
    return id;
  };
  let poNumber = 0;
  let grnNumber = 0;

  const createPurchase = async (input: {
    supplier: SupplierKey;
    status: InventoryPurchaseStatus;
    createdAt: Date;
    expectedDate?: Date;
    notes?: string;
    lines: SupplyLine[];
  }) => {
    poNumber += 1;
    const lines = input.lines.flatMap((line) => {
      const item = ledger.ready(line.item, false);
      if (!item) return [];
      const { packageQuantity, packageUnit } = supplyTerms(line);
      return [
        {
          stockItemId: item.id,
          quantity: line.quantity,
          unitCost: line.unitCost,
          unit: line.unit,
          packageQuantity,
          packageUnit,
        },
      ];
    });
    return tx.inventoryPurchaseOrder.create({
      data: {
        restaurantId,
        supplierId: supplierId(input.supplier),
        actorId: actors.manager,
        number: poNumber,
        status: input.status,
        expectedDate: input.expectedDate,
        notes: input.notes ?? '',
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
        lines: { create: lines },
      },
      include: { lines: true },
    });
  };

  /** Receives lines (optionally against a PO) and books each one into stock as a new batch. */
  const receive = async (input: {
    supplier: SupplierKey;
    /** Restaurant-local day offset and time the delivery arrived. */
    day: number;
    hour: number;
    purchaseOrder?: Awaited<ReturnType<typeof createPurchase>>;
    notes?: string;
    lines: (SupplyLine & { batchNumber?: string; expiryInDays?: number })[];
  }) => {
    grnNumber += 1;
    const number = grnNumber;
    const at = localTime(input.day, input.hour);
    const receipt = await tx.inventoryReceipt.create({
      data: {
        restaurantId,
        supplierId: supplierId(input.supplier),
        purchaseOrderId: input.purchaseOrder?.id,
        actorId: actors.manager,
        number,
        idempotencyKey: randomUUID(),
        requestHash: createHash('sha256').update(JSON.stringify(input.lines)).digest('hex'),
        notes: input.notes ?? '',
        createdAt: at,
      },
    });
    const batches = new Map<string, StockBatch>();
    for (const [index, line] of input.lines.entries()) {
      const item = ledger.ready(line.item);
      if (!item) continue;
      const orderLine = input.purchaseOrder?.lines.find((entry) => entry.stockItemId === item.id);
      const { factor, packageQuantity, packageUnit } = supplyTerms(line);
      const batchNumber = line.batchNumber ?? `GRN-${number}-${index + 1}`;
      const expiryDate =
        line.expiryInDays === undefined ? undefined : localDate(input.day + line.expiryInDays);
      const receiptLine = await tx.inventoryReceiptLine.create({
        data: {
          receiptId: receipt.id,
          stockItemId: item.id,
          purchaseOrderLineId: orderLine?.id,
          quantity: line.quantity,
          unitCost: line.unitCost,
          unit: line.unit,
          packageQuantity,
          packageUnit,
          batchNumber,
          expiryDate,
        },
      });
      if (orderLine) {
        await tx.inventoryPurchaseOrderLine.update({
          where: { id: orderLine.id },
          data: { quantityReceived: new Decimal(orderLine.quantityReceived).plus(line.quantity) },
        });
      }
      batches.set(
        line.item,
        await ledger.add(item, {
          quantity: factor.times(line.quantity),
          unitCost: new Decimal(line.unitCost).div(factor),
          kind: 'RECEIPT',
          reason: `Goods receipt GRN-${number}`,
          batchNumber,
          expiryDate,
          receiptLineId: receiptLine.id,
          receiptId: receipt.id,
          actorId: actors.manager,
          at,
        }),
      );
    }
    if (input.purchaseOrder) {
      const lines = await tx.inventoryPurchaseOrderLine.findMany({
        where: { purchaseOrderId: input.purchaseOrder.id },
      });
      const complete = lines.every((line) => line.quantityReceived.eq(line.quantity));
      await tx.inventoryPurchaseOrder.update({
        where: { id: input.purchaseOrder.id },
        data: { status: complete ? 'RECEIVED' : 'PARTIALLY_RECEIVED', updatedAt: at },
      });
    }
    return batches;
  };

  const removeStock = async (
    name: string,
    quantity: number,
    kind: 'ADJUSTMENT' | 'WASTE',
    reason: string,
    at: Date,
    batch?: StockBatch,
  ) => {
    const item = ledger.ready(name);
    if (!item) return;
    await ledger.remove(item, {
      quantity: new Decimal(quantity),
      kind,
      reason,
      actorId: actors.manager,
      at,
      batchId: batch?.id,
    });
  };

  // Day -14: weekly produce order, received in full two days later.
  const produce = await createPurchase({
    supplier: 'produce',
    status: 'SENT',
    createdAt: localTime(-14, 10),
    expectedDate: localDate(-12),
    notes: 'Weekly vegetables',
    lines: [
      { item: 'Onion', quantity: '20', unitCost: '36', unit: 'KG' },
      { item: 'Tomato', quantity: '15', unitCost: '42', unit: 'KG' },
      { item: 'Potato', quantity: '20', unitCost: '28', unit: 'KG' },
      { item: 'Spinach', quantity: '5', unitCost: '55', unit: 'KG' },
      {
        item: 'Mushroom',
        quantity: '2',
        unitCost: '460',
        unit: 'BOX',
        packageSize: { quantity: '2', unit: 'KG' },
      },
      {
        item: 'Lemon',
        quantity: '2',
        unitCost: '540',
        unit: 'BAG',
        packageSize: { quantity: '100', unit: 'UNIT' },
      },
    ],
  });
  const produceBatches = await receive({
    supplier: 'produce',
    purchaseOrder: produce,
    day: -12,
    hour: 8,
    lines: [
      { item: 'Onion', quantity: '20', unitCost: '36', unit: 'KG', expiryInDays: 21 },
      { item: 'Tomato', quantity: '15', unitCost: '42', unit: 'KG', expiryInDays: 7 },
      { item: 'Potato', quantity: '20', unitCost: '28', unit: 'KG', expiryInDays: 30 },
      { item: 'Spinach', quantity: '5', unitCost: '55', unit: 'KG', expiryInDays: 4 },
      {
        item: 'Mushroom',
        quantity: '2',
        unitCost: '460',
        unit: 'BOX',
        packageSize: { quantity: '2', unit: 'KG' },
        expiryInDays: 5,
      },
      {
        item: 'Lemon',
        quantity: '2',
        unitCost: '540',
        unit: 'BAG',
        packageSize: { quantity: '100', unit: 'UNIT' },
        expiryInDays: 14,
      },
    ],
  });

  // Day -10: staples order cancelled after a price revision.
  await createPurchase({
    supplier: 'staples',
    status: 'CANCELLED',
    createdAt: localTime(-10, 11),
    expectedDate: localDate(-8),
    notes: 'Cancelled: supplier revised rice pricing',
    lines: [
      {
        item: 'Rice',
        quantity: '2',
        unitCost: '2150',
        unit: 'BAG',
        packageSize: { quantity: '25', unit: 'KG' },
      },
      {
        item: 'Refined Flour',
        quantity: '1',
        unitCost: '1100',
        unit: 'BAG',
        packageSize: { quantity: '25', unit: 'KG' },
      },
    ],
  });

  // Day -7: found extra sugar during a dry-store audit.
  const sugar = ledger.ready('Sugar');
  if (sugar?.averageUnitCost) {
    await ledger.add(sugar, {
      quantity: new Decimal(2000),
      unitCost: sugar.averageUnitCost,
      kind: 'ADJUSTMENT',
      reason: 'Dry-store audit: two unrecorded 1 kg packs found',
      batchNumber: `ADJ-${randomUUID()}`,
      actorId: actors.manager,
      at: localTime(-7, 16),
    });
  }

  // Day -6: dairy order; mozzarella is short-shipped so the PO stays partially received.
  const dairy = await createPurchase({
    supplier: 'dairy',
    status: 'SENT',
    createdAt: localTime(-6, 9),
    expectedDate: localDate(-5),
    lines: [
      { item: 'Milk', quantity: '20', unitCost: '56', unit: 'L' },
      { item: 'Paneer', quantity: '5', unitCost: '360', unit: 'KG' },
      { item: 'Cream', quantity: '5', unitCost: '210', unit: 'L' },
      {
        item: 'Mozzarella Cheese',
        quantity: '3',
        unitCost: '1080',
        unit: 'BAG',
        packageSize: { quantity: '2', unit: 'KG' },
      },
      {
        item: 'Egg',
        quantity: '4',
        unitCost: '195',
        unit: 'PACK',
        packageSize: { quantity: '30', unit: 'UNIT' },
      },
    ],
  });
  const dairyBatches = await receive({
    supplier: 'dairy',
    purchaseOrder: dairy,
    day: -5,
    hour: 8,
    notes: 'Mozzarella short by two bags; balance promised next week',
    lines: [
      { item: 'Milk', quantity: '20', unitCost: '56', unit: 'L', expiryInDays: 2 },
      { item: 'Paneer', quantity: '5', unitCost: '360', unit: 'KG', expiryInDays: 7 },
      { item: 'Cream', quantity: '5', unitCost: '210', unit: 'L', expiryInDays: 6 },
      {
        item: 'Mozzarella Cheese',
        quantity: '1',
        unitCost: '1080',
        unit: 'BAG',
        packageSize: { quantity: '2', unit: 'KG' },
        expiryInDays: 20,
      },
      {
        item: 'Egg',
        quantity: '4',
        unitCost: '195',
        unit: 'PACK',
        packageSize: { quantity: '30', unit: 'UNIT' },
        expiryInDays: 14,
      },
    ],
  });

  // Day -4: a fridge fault spoils part of the milk delivery.
  await removeStock(
    'Milk',
    2000,
    'WASTE',
    'Spoiled: walk-in fridge temperature fault',
    localTime(-4, 22),
    dairyBatches.get('Milk'),
  );

  // Day -3: direct bar delivery without a purchase order.
  await receive({
    supplier: 'bar',
    day: -3,
    hour: 15,
    notes: 'Weekend top-up delivered without PO',
    lines: [
      {
        item: 'Beer',
        quantity: '4',
        unitCost: '1080',
        unit: 'BOX',
        packageSize: { quantity: '12', unit: 'UNIT' },
        batchNumber: 'SL-2611-0412',
        expiryInDays: 180,
      },
      {
        item: 'Soda',
        quantity: '2',
        unitCost: '432',
        unit: 'PACK',
        packageSize: { quantity: '24', unit: 'UNIT' },
        batchNumber: 'SL-2611-0413',
        expiryInDays: 270,
      },
      {
        item: 'Whisky',
        quantity: '1',
        unitCost: '11700',
        unit: 'BOX',
        packageSize: { quantity: '4.5', unit: 'L' },
        batchNumber: 'SL-2611-0414',
      },
    ],
  });

  // Day -2: wilted spinach and a broken whisky bottle.
  await removeStock(
    'Spinach',
    800,
    'WASTE',
    'Wilted before use',
    localTime(-2, 23),
    produceBatches.get('Spinach'),
  );
  await removeStock('Whisky', 750, 'WASTE', 'Bottle dropped behind the bar', localTime(-2, 21, 30));

  // Day -1: monthly count finds rice short; meat order sent for tomorrow.
  await removeStock('Rice', 1500, 'ADJUSTMENT', 'Monthly stock count variance', localTime(-1, 23));
  await createPurchase({
    supplier: 'meat',
    status: 'SENT',
    createdAt: localTime(-1, 17),
    expectedDate: localDate(1),
    notes: 'Deliver before 9 AM',
    lines: [
      { item: 'Chicken', quantity: '15', unitCost: '250', unit: 'KG' },
      { item: 'Prawns', quantity: '5', unitCost: '820', unit: 'KG' },
      { item: 'Mutton', quantity: '5', unitCost: '700', unit: 'KG' },
    ],
  });

  // Today: bar restock still being drafted.
  await createPurchase({
    supplier: 'bar',
    status: 'DRAFT',
    createdAt: localTime(0, 11),
    expectedDate: localDate(3),
    notes: 'Gin is below par; confirm tonic pricing before sending',
    lines: [
      {
        item: 'Gin',
        quantity: '2',
        unitCost: '9600',
        unit: 'BOX',
        packageSize: { quantity: '4.5', unit: 'L' },
      },
      {
        item: 'Tonic Water',
        quantity: '2',
        unitCost: '1000',
        unit: 'PACK',
        packageSize: { quantity: '24', unit: 'UNIT' },
      },
    ],
  });

  return { opened, purchaseOrders: poNumber, receipts: grnNumber, skippedHistory: false };
}
