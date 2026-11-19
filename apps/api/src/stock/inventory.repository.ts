import { Injectable } from '@nestjs/common';
import type {
  InventoryBatchQuery,
  InventoryItemFilter,
  InventoryItemQuery,
  InventoryMovementQuery,
  InventoryPurchaseQuery,
  InventoryReceiptQuery,
  InventorySupplierQuery,
} from '@rms/api-contract';
import { Prisma } from '@rms/db';

import { lockRestaurantInventory } from '../common/database/inventory-lock';
import { PrismaService } from '../common/database/prisma.service';

type Page = { page: number; pageSize: number };
const paging = ({ page, pageSize }: Page) => ({ skip: (page - 1) * pageSize, take: pageSize });

const stockIdentity = { id: true, name: true, baseUnit: true } as const;
const supplierIdentity = { id: true, name: true } as const;
const batchInclude = { stockItem: { select: stockIdentity } } as const;
const movementInclude = {
  stockItem: { select: stockIdentity },
  actor: { select: { name: true } },
  batch: { select: { batchNumber: true } },
} as const;
const purchaseInclude = {
  supplier: { select: supplierIdentity },
  lines: {
    include: { stockItem: { select: stockIdentity } },
    orderBy: [{ stockItem: { name: 'asc' } }, { id: 'asc' }],
  },
} satisfies Prisma.InventoryPurchaseOrderInclude;
const receiptInclude = {
  supplier: { select: supplierIdentity },
  purchaseOrder: { select: { id: true, number: true } },
  lines: {
    include: { stockItem: { select: stockIdentity } },
    orderBy: [{ stockItem: { name: 'asc' } }, { id: 'asc' }],
  },
} satisfies Prisma.InventoryReceiptInclude;

export type InventoryBatchRecord = Prisma.StockBatchGetPayload<{ include: typeof batchInclude }>;
export type InventoryMovementRecord = Prisma.StockMovementGetPayload<{
  include: typeof movementInclude;
}>;
export type InventoryPurchaseRecord = Prisma.InventoryPurchaseOrderGetPayload<{
  include: typeof purchaseInclude;
}>;
export type InventoryReceiptRecord = Prisma.InventoryReceiptGetPayload<{
  include: typeof receiptInclude;
}>;

@Injectable()
export class InventoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  withWrite<T>(
    restaurantId: string,
    fn: (context: InventoryWriteContext) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        await lockRestaurantInventory(tx, restaurantId);
        return fn(new InventoryWriteContext(tx, restaurantId));
      },
      { timeout: 15_000 },
    );
  }

  timezone(restaurantId: string): Promise<{ timezone: string }> {
    return this.prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: { timezone: true },
    });
  }

  options(restaurantId: string) {
    return this.prisma.$transaction([
      this.prisma.stockItem.findMany({
        where: { restaurantId, isActive: true, baseUnit: { not: null } },
        select: { ...stockIdentity, openedAt: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.inventorySupplier.findMany({
        where: { restaurantId, isActive: true },
        select: supplierIdentity,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
    ]);
  }

  private itemFilters(
    restaurantId: string,
    { q, status }: InventoryItemFilter,
  ): Prisma.StockItemWhereInput {
    return {
      restaurantId,
      isActive: status !== 'ARCHIVED',
      ...(q && {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { sku: { contains: q, mode: 'insensitive' } },
        ],
      }),
      ...(status === 'LOW_STOCK' && {
        openedAt: { not: null },
        currentStock: { lte: this.prisma.stockItem.fields.reorderLevel },
      }),
    };
  }

  exportItems(restaurantId: string, filters: InventoryItemFilter) {
    return this.prisma.stockItem.findMany({
      where: this.itemFilters(restaurantId, filters),
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  items(restaurantId: string, query: InventoryItemQuery) {
    const where = this.itemFilters(restaurantId, query);
    return this.prisma.$transaction(
      [
        this.prisma.stockItem.findMany({
          where,
          ...paging(query),
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
        }),
        this.prisma.stockItem.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  batches(restaurantId: string, query: InventoryBatchQuery, expiryCutoff: Date) {
    const where: Prisma.StockBatchWhereInput = {
      restaurantId,
      ...(query.status !== 'ALL' && { quantityRemaining: { gt: 0 } }),
      ...(query.status === 'EXPIRED' && { expiryDate: { lt: expiryCutoff } }),
    };
    return this.prisma.$transaction(
      [
        this.prisma.stockBatch.findMany({
          where,
          ...paging(query),
          include: batchInclude,
          orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
        }),
        this.prisma.stockBatch.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  scopedItemId(restaurantId: string, id: string): Promise<{ id: string } | null> {
    return this.prisma.stockItem.findUnique({ where: { id, restaurantId }, select: { id: true } });
  }

  movements(restaurantId: string, query: InventoryMovementQuery) {
    const where = { restaurantId, stockItemId: query.stockItemId, kind: query.kind };
    return this.prisma.$transaction(
      [
        this.prisma.stockMovement.findMany({
          where,
          ...paging(query),
          include: movementInclude,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
        this.prisma.stockMovement.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  suppliers(restaurantId: string, query: InventorySupplierQuery) {
    const where: Prisma.InventorySupplierWhereInput = {
      restaurantId,
      isActive: query.status === 'ACTIVE',
      ...(query.q && { name: { contains: query.q, mode: 'insensitive' } }),
    };
    return this.prisma.$transaction(
      [
        this.prisma.inventorySupplier.findMany({
          where,
          ...paging(query),
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
        }),
        this.prisma.inventorySupplier.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  purchases(restaurantId: string, query: InventoryPurchaseQuery) {
    const where = { restaurantId, status: query.status };
    return this.prisma.$transaction(
      [
        this.prisma.inventoryPurchaseOrder.findMany({
          where,
          ...paging(query),
          include: purchaseInclude,
          orderBy: { number: 'desc' },
        }),
        this.prisma.inventoryPurchaseOrder.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  scopedPurchaseId(restaurantId: string, id: string): Promise<{ id: string } | null> {
    return this.prisma.inventoryPurchaseOrder.findUnique({
      where: { id, restaurantId },
      select: { id: true },
    });
  }

  receipts(restaurantId: string, query: InventoryReceiptQuery) {
    const where = { restaurantId, purchaseOrderId: query.purchaseOrderId };
    return this.prisma.$transaction(
      [
        this.prisma.inventoryReceipt.findMany({
          where,
          ...paging(query),
          include: receiptInclude,
          orderBy: { number: query.purchaseOrderId ? 'asc' : 'desc' },
        }),
        this.prisma.inventoryReceipt.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}

/** Bound once to the tenant and transaction so service operations share the same lock and connection. */
export class InventoryWriteContext {
  constructor(
    private readonly tx: Prisma.TransactionClient,
    private readonly restaurantId: string,
  ) {}

  item(id: string) {
    return this.tx.stockItem.findUnique({ where: { id, restaurantId: this.restaurantId } });
  }

  itemByName(name: string) {
    return this.tx.stockItem.findFirst({
      where: { restaurantId: this.restaurantId, name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
  }

  createItem(data: Omit<Prisma.StockItemUncheckedCreateInput, 'restaurantId'>) {
    return this.tx.stockItem.create({ data: { ...data, restaurantId: this.restaurantId } });
  }

  updateItem(id: string, data: Prisma.StockItemUpdateInput) {
    return this.tx.stockItem.update({ where: { id, restaurantId: this.restaurantId }, data });
  }

  recipeUnits(stockItemId: string) {
    return this.tx.recipeItem.findMany({
      where: { stockItemId, menuItem: { restaurantId: this.restaurantId } },
      select: { unit: true },
      distinct: ['unit'],
    });
  }

  openPurchasesForItem(stockItemId: string) {
    return this.tx.inventoryPurchaseOrderLine.count({
      where: {
        stockItemId,
        purchaseOrder: {
          restaurantId: this.restaurantId,
          status: { in: ['DRAFT', 'SENT', 'PARTIALLY_RECEIVED'] },
        },
      },
    });
  }

  batch(id: string) {
    return this.tx.stockBatch.findUnique({ where: { id, restaurantId: this.restaurantId } });
  }

  onHandBatches(stockItemId: string) {
    return this.tx.stockBatch.findMany({
      where: { restaurantId: this.restaurantId, stockItemId, quantityRemaining: { gt: 0 } },
      orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
    });
  }

  createBatch(data: Omit<Prisma.StockBatchUncheckedCreateInput, 'restaurantId'>) {
    return this.tx.stockBatch.create({ data: { ...data, restaurantId: this.restaurantId } });
  }

  updateBatch(id: string, remaining: Prisma.Decimal) {
    return this.tx.stockBatch.update({
      where: { id, restaurantId: this.restaurantId },
      data: { quantityRemaining: remaining },
    });
  }

  addMovement(data: Omit<Prisma.StockMovementUncheckedCreateInput, 'restaurantId'>) {
    return this.tx.stockMovement.create({ data: { ...data, restaurantId: this.restaurantId } });
  }

  supplier(id: string) {
    return this.tx.inventorySupplier.findUnique({ where: { id, restaurantId: this.restaurantId } });
  }

  supplierByName(name: string) {
    return this.tx.inventorySupplier.findFirst({
      where: { restaurantId: this.restaurantId, name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
  }

  createSupplier(data: Omit<Prisma.InventorySupplierUncheckedCreateInput, 'restaurantId'>) {
    return this.tx.inventorySupplier.create({ data: { ...data, restaurantId: this.restaurantId } });
  }

  updateSupplier(id: string, data: Prisma.InventorySupplierUpdateInput) {
    return this.tx.inventorySupplier.update({
      where: { id, restaurantId: this.restaurantId },
      data,
    });
  }

  openPurchasesForSupplier(supplierId: string) {
    return this.tx.inventoryPurchaseOrder.count({
      where: {
        restaurantId: this.restaurantId,
        supplierId,
        status: { in: ['DRAFT', 'SENT', 'PARTIALLY_RECEIVED'] },
      },
    });
  }

  purchase(id: string): Promise<InventoryPurchaseRecord | null> {
    return this.tx.inventoryPurchaseOrder.findUnique({
      where: { id, restaurantId: this.restaurantId },
      include: purchaseInclude,
    });
  }

  latestPurchaseNumber(): Promise<{ number: number } | null> {
    return this.tx.inventoryPurchaseOrder.findFirst({
      where: { restaurantId: this.restaurantId },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
  }

  createPurchase(data: Omit<Prisma.InventoryPurchaseOrderUncheckedCreateInput, 'restaurantId'>) {
    return this.tx.inventoryPurchaseOrder.create({
      data: { ...data, restaurantId: this.restaurantId },
      include: purchaseInclude,
    });
  }

  setPurchaseStatus(id: string, status: InventoryPurchaseRecord['status']) {
    return this.tx.inventoryPurchaseOrder.update({
      where: { id, restaurantId: this.restaurantId },
      data: { status },
      include: purchaseInclude,
    });
  }

  setReceivedQuantity(purchaseOrderId: string, id: string, quantityReceived: Prisma.Decimal) {
    return this.tx.inventoryPurchaseOrderLine.update({
      where: { id, purchaseOrderId, purchaseOrder: { restaurantId: this.restaurantId } },
      data: { quantityReceived },
    });
  }

  receiptForKey(idempotencyKey: string): Promise<InventoryReceiptRecord | null> {
    return this.tx.inventoryReceipt.findUnique({
      where: { restaurantId_idempotencyKey: { restaurantId: this.restaurantId, idempotencyKey } },
      include: receiptInclude,
    });
  }

  latestReceiptNumber(): Promise<{ number: number } | null> {
    return this.tx.inventoryReceipt.findFirst({
      where: { restaurantId: this.restaurantId },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
  }

  createReceipt(data: Omit<Prisma.InventoryReceiptUncheckedCreateInput, 'restaurantId'>) {
    return this.tx.inventoryReceipt.create({
      data: { ...data, restaurantId: this.restaurantId },
      include: receiptInclude,
    });
  }
}
