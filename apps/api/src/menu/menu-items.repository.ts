import { Injectable } from '@nestjs/common';
import {
  type CategoryType,
  inventorySupplyMeasures,
  type MenuCustomizations,
  type MenuHistoryReason,
  type RecipeRow,
  type ServingType,
} from '@rms/api-contract';
import { Prisma } from '@rms/db';

import {
  INVENTORY_LOCK_WAITER_TIMEOUT_MS,
  lockRestaurantInventory,
} from '../common/database/inventory-lock';
import { PrismaService } from '../common/database/prisma.service';
import { StockItemsRepository } from '../stock/stock-items.repository';
import { toMenuItem } from './menu-items.mapper';

const menuItemSelect = {
  id: true,
  categoryId: true,
  name: true,
  description: true,
  price: true,
  itemType: true,
  isAvailable: true,
  isActive: true,
  recipeRequired: true,
  isVeg: true,
  customizations: true,
  createdAt: true,
  updatedAt: true,
  recipeItems: {
    where: { isActive: true },
    select: {
      quantity: true,
      unit: true,
      stockItem: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.MenuItemSelect;

export type MenuItemRecord = Prisma.MenuItemGetPayload<{ select: typeof menuItemSelect }>;

const revisionSelect = {
  id: true,
  menuItemId: true,
  revision: true,
  reason: true,
  snapshot: true,
  createdAt: true,
  recordedBy: { select: { id: true, name: true } },
} satisfies Prisma.MenuItemRevisionSelect;

export type MenuItemRevisionRecord = Prisma.MenuItemRevisionGetPayload<{
  select: typeof revisionSelect;
}>;

/** Recipe writes wait on the restaurant's inventory lock, which a CSV import can hold for seconds. */
const recipeTransactionOptions = { timeout: INVENTORY_LOCK_WAITER_TIMEOUT_MS };

export type NewMenuItem = {
  categoryId: string;
  name: string;
  description?: string;
  price: number;
  itemType: CategoryType;
  isAvailable: boolean;
  recipeRequired: boolean;
  isVeg?: boolean | null;
};

export type MenuItemChanges = Partial<Omit<NewMenuItem, 'description'>> & {
  description?: string | null;
  isActive?: boolean;
};

export class InactiveRecipeIngredientError extends Error {}
export class IncompatibleRecipeUnitError extends Error {}

export type MenuCustomizationContext = {
  current: MenuItemRecord | null;
  findItem: (id: string) => Promise<MenuItemRecord | null>;
  save: (config: MenuCustomizations) => Promise<MenuItemRecord>;
};

@Injectable()
export class MenuItemsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stockItems: StockItemsRepository,
  ) {}

  withLockedCustomizations<T>(
    restaurantId: string,
    id: string,
    recordedByUserId: string,
    action: (context: MenuCustomizationContext) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      // Serialises graph changes, including opposing combo edits, within one restaurant.
      await lockRestaurantInventory(tx, restaurantId);
      const current = await this.lockItem(tx, restaurantId, id);
      return action({
        current,
        findItem: (itemId) =>
          tx.menuItem.findFirst({
            where: { id: itemId, restaurantId },
            select: menuItemSelect,
          }),
        save: async (customizations) => {
          if (!current) throw new Error('Cannot update an unavailable menu item context');
          await this.ensureBaseline(tx, restaurantId, current, recordedByUserId);
          const updated = await tx.menuItem.update({
            where: { id, restaurantId },
            data: { customizations },
            select: menuItemSelect,
          });
          await this.appendRevision(tx, restaurantId, updated, recordedByUserId, 'UPDATED');
          return updated;
        },
      });
    }, recipeTransactionOptions);
  }

  findAll(
    restaurantId: string,
    activeOnly: boolean,
    categoryId?: string,
    itemType?: ServingType,
  ): Promise<MenuItemRecord[]> {
    return this.prisma.menuItem.findMany({
      where: {
        restaurantId,
        ...(activeOnly && { isActive: true }),
        ...(categoryId && { categoryId }),
        ...(itemType && { itemType }),
      },
      select: menuItemSelect,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  /** Case-insensitive, partial match on name/description, combined (AND) with the other filters. */
  async findSearchPage(
    restaurantId: string,
    filters: {
      activeOnly: boolean;
      q?: string;
      categoryId?: string;
      itemType?: ServingType;
      isAvailable?: boolean;
      skip: number;
      take: number;
    },
  ): Promise<{ items: MenuItemRecord[]; total: number }> {
    const where: Prisma.MenuItemWhereInput = {
      restaurantId,
      ...(filters.activeOnly && { isActive: true }),
      ...(filters.categoryId && { categoryId: filters.categoryId }),
      ...(filters.itemType && { itemType: filters.itemType }),
      ...(filters.isAvailable !== undefined && { isAvailable: filters.isAvailable }),
      ...(filters.q && {
        OR: [
          { name: { contains: filters.q, mode: 'insensitive' } },
          { description: { contains: filters.q, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.menuItem.findMany({
        where,
        select: menuItemSelect,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: filters.skip,
        take: filters.take,
      }),
      this.prisma.menuItem.count({ where }),
    ]);

    return { items, total };
  }

  findById(restaurantId: string, id: string): Promise<MenuItemRecord | null> {
    return this.prisma.menuItem.findFirst({
      where: { id, restaurantId },
      select: menuItemSelect,
    });
  }

  findCategory(
    restaurantId: string,
    categoryId: string,
  ): Promise<{ categoryType: ServingType } | null> {
    return this.prisma.menuCategory.findFirst({
      where: { id: categoryId, restaurantId },
      select: { categoryType: true },
    });
  }

  async categoryExists(restaurantId: string, categoryId: string): Promise<boolean> {
    const category = await this.prisma.menuCategory.findFirst({
      where: { id: categoryId, restaurantId },
      select: { id: true },
    });
    return category !== null;
  }

  async isNameTaken(
    restaurantId: string,
    categoryId: string,
    name: string,
    excludeItemId?: string,
  ): Promise<boolean> {
    const existing = await this.prisma.menuItem.findFirst({
      where: {
        restaurantId,
        categoryId,
        name: { equals: name, mode: 'insensitive' },
        ...(excludeItemId && { id: { not: excludeItemId } }),
      },
      select: { id: true },
    });
    return existing !== null;
  }

  /** Creates the item and its recipe in one transaction so a half-written recipe never persists. */
  create(
    restaurantId: string,
    item: NewMenuItem,
    recipe: RecipeRow[],
    recordedByUserId: string,
  ): Promise<MenuItemRecord> {
    return this.prisma.$transaction(async (tx) => {
      await this.requireRecipeIngredients(tx, restaurantId, recipe);
      const created = await tx.menuItem.create({
        data: { restaurantId, ...item, recipeItems: { create: recipe } },
        select: menuItemSelect,
      });
      await this.appendRevision(tx, restaurantId, created, recordedByUserId, 'CREATED');
      return created;
    }, recipeTransactionOptions);
  }

  /** Updates fields and (when given) replaces the whole recipe atomically. */
  async update(
    restaurantId: string,
    id: string,
    changes: MenuItemChanges,
    recipe: RecipeRow[] | undefined,
    recordedByUserId: string,
  ): Promise<MenuItemRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      if (recipe) await this.requireRecipeIngredients(tx, restaurantId, recipe);
      const before = await this.lockItem(tx, restaurantId, id);
      if (!before) return null;
      await this.ensureBaseline(tx, restaurantId, before, recordedByUserId);
      const { count } = await tx.menuItem.updateMany({
        where: { id, restaurantId },
        // updatedAt keeps `data` non-empty for recipe-only edits (an empty update matches nothing).
        data: { ...changes, updatedAt: new Date() },
      });
      if (count === 0) return null;

      if (recipe) {
        await tx.recipeItem.updateMany({
          where: { menuItemId: id, menuItem: { restaurantId } },
          data: { isActive: false },
        });
        for (const { stockItemId, ...row } of recipe) {
          await tx.recipeItem.upsert({
            where: { menuItemId_stockItemId: { menuItemId: id, stockItemId } },
            create: { menuItemId: id, stockItemId, ...row },
            update: { ...row, isActive: true },
          });
        }
      }

      const updated = await tx.menuItem.findFirstOrThrow({
        where: { id, restaurantId },
        select: menuItemSelect,
      });
      await this.appendRevision(tx, restaurantId, updated, recordedByUserId, 'UPDATED');
      return updated;
    }, recipeTransactionOptions);
  }

  private async requireRecipeIngredients(
    tx: Prisma.TransactionClient,
    restaurantId: string,
    recipe: RecipeRow[],
  ): Promise<void> {
    await lockRestaurantInventory(tx, restaurantId);
    const ids = [...new Set(recipe.map(({ stockItemId }) => stockItemId))];
    const active = await this.stockItems.findActiveBaseUnits(restaurantId, ids, tx);
    if (active.length !== ids.length) throw new InactiveRecipeIngredientError();

    // Unconfigured ingredients (no base unit yet) accept any unit; saving a base unit later is
    // rejected if it clashes with existing recipes (InventoryService.saveItem).
    const baseUnits = new Map(active.map(({ id, baseUnit }) => [id, baseUnit]));
    const mismatched = recipe.some(({ stockItemId, unit }) => {
      const baseUnit = baseUnits.get(stockItemId);
      return baseUnit != null && inventorySupplyMeasures[unit].baseUnit !== baseUnit;
    });
    if (mismatched) throw new IncompatibleRecipeUnitError();
  }

  /** Sets the explicit target; repeated requests leave the item and its timestamp unchanged. */
  async updateAvailability(
    restaurantId: string,
    id: string,
    isAvailable: boolean,
  ): Promise<MenuItemRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      await tx.menuItem.updateMany({
        where: { id, restaurantId, isActive: true, isAvailable: { not: isAvailable } },
        data: { isAvailable },
      });

      return tx.menuItem.findFirst({
        where: { id, restaurantId, isActive: true },
        select: menuItemSelect,
      });
    });
  }

  /** Updates only the price, using decimal arithmetic and a tenant-scoped write/read transaction. */
  async updatePrice(
    restaurantId: string,
    id: string,
    price: string,
    recordedByUserId: string,
  ): Promise<MenuItemRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.lockItem(tx, restaurantId, id);
      if (!before?.isActive) return null;
      if (before.price.equals(price)) return before;
      await this.ensureBaseline(tx, restaurantId, before, recordedByUserId);
      const { count } = await tx.menuItem.updateMany({
        where: { id, restaurantId, isActive: true },
        data: { price: new Prisma.Decimal(price) },
      });
      if (count === 0) return null;

      const updated = await tx.menuItem.findFirstOrThrow({
        where: { id, restaurantId, isActive: true },
        select: menuItemSelect,
      });
      await this.appendRevision(tx, restaurantId, updated, recordedByUserId, 'PRICE_CHANGED');
      return updated;
    });
  }

  async history(
    restaurantId: string,
    menuItemId: string,
    skip: number,
    take: number,
  ): Promise<{ items: MenuItemRevisionRecord[]; total: number }> {
    const where = { restaurantId, menuItemId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.menuItemRevision.findMany({
        where,
        select: revisionSelect,
        orderBy: { revision: 'desc' },
        skip,
        take,
      }),
      this.prisma.menuItemRevision.count({ where }),
    ]);
    return { items, total };
  }

  private async lockItem(
    tx: Prisma.TransactionClient,
    restaurantId: string,
    id: string,
  ): Promise<MenuItemRecord | null> {
    await tx.$queryRaw`SELECT id FROM menu_items
      WHERE id = ${id}::uuid AND restaurant_id = ${restaurantId}::uuid FOR UPDATE`;
    return tx.menuItem.findFirst({ where: { id, restaurantId }, select: menuItemSelect });
  }

  private async ensureBaseline(
    tx: Prisma.TransactionClient,
    restaurantId: string,
    item: MenuItemRecord,
    recordedByUserId: string,
  ): Promise<void> {
    const exists = await tx.menuItemRevision.findFirst({
      where: { restaurantId, menuItemId: item.id },
      select: { id: true },
    });
    if (!exists) await this.appendRevision(tx, restaurantId, item, recordedByUserId, 'BASELINE');
  }

  private async appendRevision(
    tx: Prisma.TransactionClient,
    restaurantId: string,
    item: MenuItemRecord,
    recordedByUserId: string,
    reason: MenuHistoryReason,
  ): Promise<void> {
    const previous = await tx.menuItemRevision.findFirst({
      where: { restaurantId, menuItemId: item.id },
      orderBy: { revision: 'desc' },
      select: { revision: true },
    });
    await tx.menuItemRevision.create({
      data: {
        restaurantId,
        menuItemId: item.id,
        recordedByUserId,
        revision: (previous?.revision ?? 0) + 1,
        reason,
        snapshot: toMenuItem(item),
      },
    });
  }

  /** The relation predicate protects the service's expected category type at write time. */
  async updateClassification(
    restaurantId: string,
    id: string,
    itemType: ServingType,
  ): Promise<MenuItemRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.menuItem.updateMany({
        where: {
          id,
          restaurantId,
          isActive: true,
          category: { restaurantId, categoryType: itemType },
        },
        data: { itemType },
      });
      if (count === 0) return null;

      return tx.menuItem.findFirst({
        where: { id, restaurantId, isActive: true },
        select: menuItemSelect,
      });
    });
  }
}
