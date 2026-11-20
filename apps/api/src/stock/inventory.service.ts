import { createHash, randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AdjustInventoryStock,
  CreateInventoryItem,
  CreateInventoryPurchase,
  CreateInventoryReceipt,
  CreateInventorySupplier,
  InventoryBatch,
  InventoryBatchQuery,
  InventoryCsvImportResult,
  InventoryCsvItem,
  InventoryItem,
  InventoryItemFilter,
  InventoryItemQuery,
  InventoryMovement,
  InventoryMovementQuery,
  InventoryOptions,
  InventoryPurchase,
  InventoryPurchaseQuery,
  InventoryReceipt,
  InventoryReceiptQuery,
  InventorySupplier,
  InventorySupplierQuery,
  LogInventoryWaste,
  OpeningInventoryStock,
  UpdateInventoryItem,
  UpdateInventoryPurchaseStatus,
  UpdateInventorySupplier,
} from '@rms/api-contract';
import { inventorySupplyMeasures } from '@rms/api-contract';
import { Prisma, type StockBatch, type StockItem } from '@rms/db';
import { buildPageMeta, type Paginated } from '@rms/shared';

import type { Actor } from '../common/auth/authenticated-request';
import { lockRestaurantInventory } from '../common/database/inventory-lock';
import { mapDatabaseError } from '../common/filters/http-exception.filter';
import {
  type InventoryPurchaseRecord,
  InventoryRepository,
  InventoryWriteContext,
} from './inventory.repository';
import { inventoryCsvItems, inventoryCsvString } from './inventory-csv';
import {
  toInventoryBatch,
  toInventoryItem,
  toInventoryMovement,
  toInventoryPurchase,
  toInventoryReceipt,
  toInventorySupplier,
} from './inventory-mappers';
import {
  inventoryStockQuantity,
  inventoryStockUnitCost,
  inventorySupplyTerms,
  matchesInventorySupply,
  resolveInventorySupply,
} from './inventory-supply';

type Page = { page: number; pageSize: number };
type Inbound = {
  quantity: Prisma.Decimal;
  unitCost: Prisma.Decimal;
  kind: 'OPENING' | 'ADJUSTMENT' | 'RECEIPT';
  reason: string;
  batchNumber: string;
  expiryDate?: Date;
  receiptLineId?: string;
  receiptId?: string;
};
const Decimal = Prisma.Decimal.clone({ precision: 50 });
const ZERO = new Decimal(0);
const MAX_STOCK = new Decimal('999999999.999');

function paginate<T, U>(
  [rows, total]: [T[], number],
  query: Page,
  map: (row: T) => U,
): Paginated<U> {
  return { data: rows.map(map), meta: buildPageMeta(query.page, query.pageSize, total) };
}

function localDay(timezone: string): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value;
  return new Date(`${part('year')}-${part('month')}-${part('day')}T00:00:00.000Z`);
}

@Injectable()
export class InventoryService {
  constructor(private readonly repository: InventoryRepository) {}

  async options(actor: Actor): Promise<InventoryOptions> {
    const [stock, suppliers] = await this.repository.options(actor.restaurantId);
    return {
      items: stock.flatMap(({ openedAt, baseUnit, ...item }) =>
        baseUnit ? [{ ...item, baseUnit, opened: openedAt !== null }] : [],
      ),
      suppliers,
    };
  }

  async items(actor: Actor, query: InventoryItemQuery): Promise<Paginated<InventoryItem>> {
    return paginate(await this.repository.items(actor.restaurantId, query), query, toInventoryItem);
  }

  async batches(actor: Actor, query: InventoryBatchQuery): Promise<Paginated<InventoryBatch>> {
    const { timezone } = await this.repository.timezone(actor.restaurantId);
    const cutoff = localDay(timezone);
    return paginate(
      await this.repository.batches(actor.restaurantId, query, cutoff),
      query,
      (row) => toInventoryBatch(row, cutoff),
    );
  }

  async movements(
    actor: Actor,
    query: InventoryMovementQuery,
  ): Promise<Paginated<InventoryMovement>> {
    if (
      query.stockItemId &&
      !(await this.repository.scopedItemId(actor.restaurantId, query.stockItemId))
    ) {
      throw new NotFoundException('Ingredient not found');
    }
    return paginate(
      await this.repository.movements(actor.restaurantId, query),
      query,
      toInventoryMovement,
    );
  }

  async suppliers(
    actor: Actor,
    query: InventorySupplierQuery,
  ): Promise<Paginated<InventorySupplier>> {
    return paginate(
      await this.repository.suppliers(actor.restaurantId, query),
      query,
      toInventorySupplier,
    );
  }

  async purchases(
    actor: Actor,
    query: InventoryPurchaseQuery,
  ): Promise<Paginated<InventoryPurchase>> {
    return paginate(
      await this.repository.purchases(actor.restaurantId, query),
      query,
      toInventoryPurchase,
    );
  }

  async receipts(actor: Actor, query: InventoryReceiptQuery): Promise<Paginated<InventoryReceipt>> {
    if (
      query.purchaseOrderId &&
      !(await this.repository.scopedPurchaseId(actor.restaurantId, query.purchaseOrderId))
    ) {
      throw new NotFoundException('Purchase order not found');
    }
    return paginate(
      await this.repository.receipts(actor.restaurantId, query),
      query,
      toInventoryReceipt,
    );
  }

  async exportCsv(actor: Actor, filters: InventoryItemFilter): Promise<string> {
    const items = await this.repository.exportItems(actor.restaurantId, filters);
    return inventoryCsvString(items.map(toInventoryItem));
  }

  importCsv(actor: Actor, file: Buffer): Promise<InventoryCsvImportResult> {
    const rows = inventoryCsvItems(file);
    return this.repository.withWrite(actor.restaurantId, async (inventory) => {
      let created = 0;
      let updated = 0;
      let opened = 0;
      for (const { line, item, opening } of rows) {
        try {
          const result = await this.importItem(inventory, item);
          if (opening) {
            await this.recordOpening(inventory, actor.userId, result.item, opening);
            opened += 1;
          }
          if (result.created) created += 1;
          else updated += 1;
        } catch (error) {
          // Prefix client-attributable failures (validation or a DB constraint) with the row, so
          // the user can find which of up to 200 lines to fix.
          const mapped =
            error instanceof HttpException
              ? { status: error.getStatus(), message: error.message }
              : mapDatabaseError(error);
          if (mapped && mapped.status < 500) {
            throw new HttpException(`CSV line ${line}: ${mapped.message}`, mapped.status, {
              cause: error,
            });
          }
          throw error;
        }
      }
      return { created, updated, opened };
    });
  }

  private async importItem(
    inventory: InventoryWriteContext,
    { id, name, sku, baseUnit, reorderLevel }: InventoryCsvItem,
  ): Promise<{ item: StockItem; created: boolean }> {
    if (!id) {
      if (!baseUnit) throw new BadRequestException('A new ingredient needs a base unit');
      const item = await this.insertItem(inventory, {
        name,
        sku: sku ?? '',
        baseUnit,
        reorderLevel,
      });
      return { item, created: true };
    }
    const existing = await this.requireItem(inventory, id);
    const item = await this.saveItem(inventory, existing, {
      name,
      sku: sku ?? existing.sku ?? '',
      baseUnit: baseUnit ?? existing.baseUnit,
      reorderLevel,
      isActive: existing.isActive,
    });
    return { item, created: false };
  }

  /**
   * Creates new ingredients, each with optional opening stock, inside the caller's transaction
   * (guided onboarding writes everything in one). Takes the same inventory lock as every other
   * stock write, so the usual name, unit and balance rules apply unchanged.
   */
  async createItemsInTransaction(
    tx: Prisma.TransactionClient,
    restaurantId: string,
    actorId: string,
    rows: readonly { item: CreateInventoryItem; opening?: OpeningInventoryStock }[],
  ): Promise<{ created: number; opened: number }> {
    await lockRestaurantInventory(tx, restaurantId);
    const inventory = new InventoryWriteContext(tx, restaurantId);
    let opened = 0;
    for (const { item, opening } of rows) {
      const created = await this.insertItem(inventory, item);
      if (opening) {
        await this.recordOpening(inventory, actorId, created, opening);
        opened += 1;
      }
    }
    return { created: rows.length, opened };
  }

  createItem(actor: Actor, input: CreateInventoryItem): Promise<InventoryItem> {
    return this.repository.withWrite(actor.restaurantId, async (inventory) =>
      toInventoryItem(await this.insertItem(inventory, input)),
    );
  }

  private async insertItem(
    inventory: InventoryWriteContext,
    input: CreateInventoryItem,
  ): Promise<StockItem> {
    if (await inventory.itemByName(input.name))
      throw new ConflictException('Ingredient name is already in use');
    return inventory.createItem({ ...input, sku: input.sku || null });
  }

  updateItem(actor: Actor, id: string, input: UpdateInventoryItem): Promise<InventoryItem> {
    return this.repository.withWrite(actor.restaurantId, async (inventory) => {
      const item = await this.requireItem(inventory, id);
      return toInventoryItem(await this.saveItem(inventory, item, input));
    });
  }

  private async saveItem(
    inventory: InventoryWriteContext,
    item: StockItem,
    input: Omit<UpdateInventoryItem, 'baseUnit'> & { baseUnit: StockItem['baseUnit'] },
  ): Promise<StockItem> {
    const duplicate = await inventory.itemByName(input.name);
    if (duplicate && duplicate.id !== item.id)
      throw new ConflictException('Ingredient name is already in use');
    if (item.baseUnit && input.baseUnit !== item.baseUnit) {
      throw new ConflictException('The base unit cannot change after an ingredient is configured');
    }
    const recipes = await inventory.recipeUnits(item.id);
    if (
      input.baseUnit &&
      recipes.some(({ unit }) => inventorySupplyMeasures[unit].baseUnit !== input.baseUnit)
    ) {
      throw new ConflictException('This base unit is incompatible with an existing recipe');
    }
    if (!input.isActive && item.isActive) {
      if (
        !item.currentStock.isZero() ||
        recipes.length ||
        (await inventory.openPurchasesForItem(item.id))
      ) {
        throw new ConflictException(
          'An ingredient with stock, recipe references, or open purchase orders cannot be archived',
        );
      }
    }
    return inventory.updateItem(item.id, { ...input, sku: input.sku || null });
  }

  openStock(actor: Actor, id: string, input: OpeningInventoryStock): Promise<InventoryItem> {
    return this.repository.withWrite(actor.restaurantId, async (inventory) => {
      const item = await this.requireItem(inventory, id);
      return toInventoryItem(await this.recordOpening(inventory, actor.userId, item, input));
    });
  }

  private async recordOpening(
    inventory: InventoryWriteContext,
    actorId: string,
    item: StockItem,
    input: OpeningInventoryStock,
  ): Promise<StockItem> {
    if (!item.isActive || !item.baseUnit)
      throw new ConflictException('Configure an active ingredient before opening stock');
    if (item.openedAt) throw new ConflictException('Opening stock has already been recorded');
    await this.addStock(inventory, actorId, item, {
      quantity: new Decimal(input.quantity),
      unitCost: new Decimal(input.unitCost),
      kind: 'OPENING',
      reason: input.reason,
      batchNumber: `OPEN-${randomUUID()}`,
    });
    return inventory.updateItem(item.id, { openedAt: new Date() });
  }

  adjust(actor: Actor, id: string, input: AdjustInventoryStock): Promise<InventoryItem> {
    return this.repository.withWrite(actor.restaurantId, async (inventory) => {
      const item = await this.requireReadyItem(inventory, id);
      const quantity = new Decimal(input.quantity);
      if (quantity.gt(0)) {
        const unitCost =
          input.unitCost === undefined ? item.averageUnitCost : new Decimal(input.unitCost);
        if (unitCost === null)
          throw new BadRequestException('Enter a unit cost when there is no average cost');
        return toInventoryItem(
          await this.addStock(inventory, actor.userId, item, {
            quantity,
            unitCost,
            kind: 'ADJUSTMENT',
            reason: input.reason,
            batchNumber: `ADJ-${randomUUID()}`,
          }),
        );
      }
      if (input.unitCost !== undefined)
        throw new BadRequestException('Negative adjustments use batch costs');
      return toInventoryItem(
        await this.removeStock(
          inventory,
          actor.userId,
          item,
          quantity.abs(),
          input.reason,
          'ADJUSTMENT',
        ),
      );
    });
  }

  waste(actor: Actor, id: string, input: LogInventoryWaste): Promise<InventoryItem> {
    return this.repository.withWrite(actor.restaurantId, async (inventory) => {
      const batch = await inventory.batch(id);
      if (!batch) throw new NotFoundException('Stock batch not found');
      const item = await this.requireReadyItem(inventory, batch.stockItemId);
      return toInventoryItem(
        await this.removeStock(
          inventory,
          actor.userId,
          item,
          new Decimal(input.quantity),
          input.reason,
          'WASTE',
          batch,
        ),
      );
    });
  }

  createSupplier(actor: Actor, input: CreateInventorySupplier): Promise<InventorySupplier> {
    return this.repository.withWrite(actor.restaurantId, async (inventory) => {
      if (await inventory.supplierByName(input.name))
        throw new ConflictException('Supplier name is already in use');
      return toInventorySupplier(await inventory.createSupplier(input));
    });
  }

  updateSupplier(
    actor: Actor,
    id: string,
    input: UpdateInventorySupplier,
  ): Promise<InventorySupplier> {
    return this.repository.withWrite(actor.restaurantId, async (inventory) => {
      const supplier = await this.requireSupplier(inventory, id);
      const duplicate = await inventory.supplierByName(input.name);
      if (duplicate && duplicate.id !== id)
        throw new ConflictException('Supplier name is already in use');
      if (!input.isActive && supplier.isActive && (await inventory.openPurchasesForSupplier(id))) {
        throw new ConflictException('A supplier with open purchase orders cannot be archived');
      }
      return toInventorySupplier(await inventory.updateSupplier(id, input));
    });
  }

  createPurchase(actor: Actor, input: CreateInventoryPurchase): Promise<InventoryPurchase> {
    return this.repository.withWrite(actor.restaurantId, async (inventory) => {
      const supplier = await this.requireSupplier(inventory, input.supplierId);
      if (!supplier.isActive) throw new ConflictException('Select an active supplier');
      const lines: Prisma.InventoryPurchaseOrderLineUncheckedCreateWithoutPurchaseOrderInput[] = [];
      for (const line of input.lines) {
        const item = await this.requireItem(inventory, line.stockItemId);
        if (!item.isActive || !item.baseUnit)
          throw new ConflictException('Select active ingredients with a configured base unit');
        const { factor, ...terms } = resolveInventorySupply(item.baseUnit, line);
        inventoryStockQuantity(line.quantity, factor);
        inventoryStockUnitCost(line.unitCost, factor);
        lines.push({
          stockItemId: item.id,
          quantity: line.quantity,
          unitCost: line.unitCost,
          ...terms,
        });
      }
      const last = await inventory.latestPurchaseNumber();
      return toInventoryPurchase(
        await inventory.createPurchase({
          supplierId: supplier.id,
          actorId: actor.userId,
          number: (last?.number ?? 0) + 1,
          expectedDate: input.expectedDate ? new Date(input.expectedDate) : undefined,
          notes: input.notes,
          lines: { create: lines },
        }),
      );
    });
  }

  updatePurchase(
    actor: Actor,
    id: string,
    input: UpdateInventoryPurchaseStatus,
  ): Promise<InventoryPurchase> {
    return this.repository.withWrite(actor.restaurantId, async (inventory) => {
      const purchase = await this.requirePurchase(inventory, id);
      if (purchase.status === input.status) return toInventoryPurchase(purchase);
      const allowed =
        purchase.status === 'DRAFT' || (purchase.status === 'SENT' && input.status === 'CANCELLED');
      if (!allowed) throw new ConflictException('This purchase order status change is unavailable');
      return toInventoryPurchase(await inventory.setPurchaseStatus(id, input.status));
    });
  }

  receive(actor: Actor, input: CreateInventoryReceipt): Promise<InventoryReceipt> {
    const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    return this.repository.withWrite(actor.restaurantId, async (inventory) => {
      const previous = await inventory.receiptForKey(input.idempotencyKey);
      if (previous) {
        if (previous.requestHash !== requestHash) {
          throw new ConflictException('This receipt key was already used with different details');
        }
        return toInventoryReceipt(previous);
      }
      const supplier = await this.requireSupplier(inventory, input.supplierId);
      if (!supplier.isActive) throw new ConflictException('Select an active supplier');
      const po = input.purchaseOrderId
        ? await this.requirePurchase(inventory, input.purchaseOrderId)
        : null;
      const items = new Map<string, StockItem>();
      for (const id of new Set(input.lines.map(({ stockItemId }) => stockItemId))) {
        items.set(id, await this.requireReadyItem(inventory, id));
      }
      const orderLines = new Map(po?.lines.map((line) => [line.id, line]));
      const totals = this.receivedTotals(input, po, orderLines);
      const last = await inventory.latestReceiptNumber();
      const number = (last?.number ?? 0) + 1;
      const lines = input.lines.map((line, index) => {
        const item = items.get(line.stockItemId);
        if (!item) throw new NotFoundException('Ingredient not found');
        const orderLine = line.purchaseOrderLineId
          ? orderLines.get(line.purchaseOrderLineId)
          : undefined;
        const { unit, packageQuantity, packageUnit } = resolveInventorySupply(
          item.baseUnit,
          orderLine ? inventorySupplyTerms(orderLine) : line,
        );
        return {
          stockItemId: line.stockItemId,
          purchaseOrderLineId: line.purchaseOrderLineId,
          quantity: line.quantity,
          unitCost: line.unitCost,
          batchNumber: line.batchNumber || `GRN-${number}-${index + 1}`,
          expiryDate: line.expiryDate ? new Date(line.expiryDate) : undefined,
          unit,
          packageQuantity,
          packageUnit,
        };
      });
      const receipt = await inventory.createReceipt({
        actorId: actor.userId,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        number,
        supplierId: supplier.id,
        purchaseOrderId: po?.id,
        notes: input.notes,
        lines: { create: lines },
      });
      for (const line of receipt.lines) {
        const item = await this.requireReadyItem(inventory, line.stockItem.id);
        const { factor } = resolveInventorySupply(item.baseUnit, inventorySupplyTerms(line));
        await this.addStock(inventory, actor.userId, item, {
          quantity: inventoryStockQuantity(line.quantity, factor),
          unitCost: inventoryStockUnitCost(line.unitCost, factor),
          kind: 'RECEIPT',
          reason: `Goods receipt GRN-${number}`,
          batchNumber: line.batchNumber,
          expiryDate: line.expiryDate ?? undefined,
          receiptLineId: line.id,
          receiptId: receipt.id,
        });
      }
      if (po) {
        for (const [lineId, quantity] of totals)
          await inventory.setReceivedQuantity(po.id, lineId, quantity);
        const complete = po.lines.every((line) =>
          (totals.get(line.id) ?? line.quantityReceived).eq(line.quantity),
        );
        await inventory.setPurchaseStatus(po.id, complete ? 'RECEIVED' : 'PARTIALLY_RECEIVED');
      }
      return toInventoryReceipt(receipt);
    });
  }

  private receivedTotals(
    input: CreateInventoryReceipt,
    po: InventoryPurchaseRecord | null,
    linesById: ReadonlyMap<string, InventoryPurchaseRecord['lines'][number]>,
  ): Map<string, Prisma.Decimal> {
    const totals = new Map<string, Prisma.Decimal>();
    if (!po) return totals;
    if (po.supplier.id !== input.supplierId)
      throw new BadRequestException('The supplier must match the purchase order');
    if (po.status !== 'SENT' && po.status !== 'PARTIALLY_RECEIVED') {
      throw new ConflictException('Receive against a sent or partially received purchase order');
    }
    for (const receiptLine of input.lines) {
      const line =
        receiptLine.purchaseOrderLineId && linesById.get(receiptLine.purchaseOrderLineId);
      if (!line) throw new NotFoundException('Receipt line is outside this purchase order');
      if (line.stockItem.id !== receiptLine.stockItemId) {
        throw new BadRequestException('Receipt ingredient must match the purchase order line');
      }
      if (!matchesInventorySupply(receiptLine, inventorySupplyTerms(line))) {
        throw new BadRequestException(
          'Use the supplier unit and package size from the purchase order line',
        );
      }
      const quantity = new Decimal(totals.get(line.id) ?? line.quantityReceived).plus(
        receiptLine.quantity,
      );
      if (quantity.gt(line.quantity))
        throw new ConflictException('Receipt exceeds the remaining purchase order quantity');
      totals.set(line.id, quantity);
    }
    return totals;
  }

  private async addStock(
    inventory: InventoryWriteContext,
    actorId: string,
    item: StockItem,
    input: Inbound,
  ): Promise<StockItem> {
    const quantity = new Decimal(input.quantity);
    const balance = quantity.plus(item.currentStock);
    if (balance.gt(MAX_STOCK))
      throw new ConflictException('The resulting stock balance exceeds the supported range');
    const unitCost = input.unitCost.toDecimalPlaces(8, Decimal.ROUND_HALF_UP);
    const batch = quantity.gt(0)
      ? await inventory.createBatch({
          stockItemId: item.id,
          quantityReceived: quantity,
          quantityRemaining: quantity,
          unitCost,
          batchNumber: input.batchNumber,
          expiryDate: input.expiryDate,
          receiptLineId: input.receiptLineId,
        })
      : null;
    await inventory.addMovement({
      actorId,
      stockItemId: item.id,
      batchId: batch?.id,
      receiptId: input.receiptId,
      quantity,
      unitCost,
      kind: input.kind,
      reason: input.reason,
    });
    const averageUnitCost = balance.isZero()
      ? item.averageUnitCost
      : new Decimal(item.currentStock)
          .mul(item.averageUnitCost ?? ZERO)
          .plus(quantity.mul(input.unitCost))
          .div(balance)
          .toDecimalPlaces(8, Decimal.ROUND_HALF_UP);
    return inventory.updateItem(item.id, { currentStock: balance, averageUnitCost });
  }

  private async removeStock(
    inventory: InventoryWriteContext,
    actorId: string,
    item: StockItem,
    quantity: Prisma.Decimal,
    reason: string,
    kind: 'ADJUSTMENT' | 'WASTE',
    batch?: StockBatch,
  ): Promise<StockItem> {
    if (quantity.gt(item.currentStock) || (batch && quantity.gt(batch.quantityRemaining))) {
      throw new ConflictException('Quantity exceeds the stock available');
    }
    const batches = batch ? [batch] : await inventory.onHandBatches(item.id);
    let remaining = quantity;
    for (const lot of batches) {
      if (remaining.isZero()) break;
      const used = Decimal.min(remaining, lot.quantityRemaining);
      await inventory.updateBatch(lot.id, new Decimal(lot.quantityRemaining).minus(used));
      await inventory.addMovement({
        actorId,
        stockItemId: item.id,
        batchId: lot.id,
        kind,
        reason,
        quantity: used.negated(),
        unitCost: lot.unitCost,
      });
      remaining = remaining.minus(used);
    }
    if (!remaining.isZero())
      throw new ConflictException('Batch quantities do not reconcile with the stock balance');
    return inventory.updateItem(item.id, {
      currentStock: new Decimal(item.currentStock).minus(quantity),
    });
  }

  private async requireItem(inventory: InventoryWriteContext, id: string): Promise<StockItem> {
    const item = await inventory.item(id);
    if (!item) throw new NotFoundException('Ingredient not found');
    return item;
  }

  private async requireReadyItem(inventory: InventoryWriteContext, id: string): Promise<StockItem> {
    const item = await this.requireItem(inventory, id);
    if (!item.isActive || !item.baseUnit || !item.openedAt) {
      throw new ConflictException(
        `Record opening stock for active ingredient “${item.name}” first`,
      );
    }
    return item;
  }

  private async requirePurchase(
    inventory: InventoryWriteContext,
    id: string,
  ): Promise<InventoryPurchaseRecord> {
    const order = await inventory.purchase(id);
    if (!order) throw new NotFoundException('Purchase order not found');
    return order;
  }

  private async requireSupplier(inventory: InventoryWriteContext, id: string) {
    const supplier = await inventory.supplier(id);
    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
  }
}
