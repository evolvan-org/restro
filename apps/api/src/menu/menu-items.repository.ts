import { Injectable } from '@nestjs/common';
import type { CategoryType, RecipeRow, ServingType } from '@rms/api-contract';
import { Prisma } from '@rms/db';

import { PrismaService } from '../common/database/prisma.service';

const menuItemSelect = {
  id: true,
  categoryId: true,
  name: true,
  description: true,
  price: true,
  itemType: true,
  isAvailable: true,
  createdAt: true,
  updatedAt: true,
  recipeItems: {
    select: {
      quantity: true,
      unit: true,
      stockItem: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.MenuItemSelect;

export type MenuItemRecord = Prisma.MenuItemGetPayload<{ select: typeof menuItemSelect }>;

export type NewMenuItem = {
  categoryId: string;
  name: string;
  description?: string;
  price: number;
  itemType: CategoryType;
  isAvailable: boolean;
};

export type MenuItemChanges = Partial<Omit<NewMenuItem, 'description'>> & {
  description?: string | null;
};

@Injectable()
export class MenuItemsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(
    restaurantId: string,
    categoryId?: string,
    itemType?: ServingType,
  ): Promise<MenuItemRecord[]> {
    return this.prisma.menuItem.findMany({
      where: {
        restaurantId,
        isActive: true,
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
      isActive: true,
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
      where: { id, restaurantId, isActive: true },
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
        isActive: true,
        name: { equals: name, mode: 'insensitive' },
        ...(excludeItemId && { id: { not: excludeItemId } }),
      },
      select: { id: true },
    });
    return existing !== null;
  }

  /** Creates the item and its recipe in one transaction so a half-written recipe never persists. */
  create(restaurantId: string, item: NewMenuItem, recipe: RecipeRow[]): Promise<MenuItemRecord> {
    return this.prisma.menuItem.create({
      data: { restaurantId, ...item, recipeItems: { create: recipe } },
      select: menuItemSelect,
    });
  }

  /** Updates fields and (when given) replaces the whole recipe atomically. */
  async update(
    restaurantId: string,
    id: string,
    changes: MenuItemChanges,
    recipe?: RecipeRow[],
  ): Promise<MenuItemRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.menuItem.updateMany({
        where: { id, restaurantId, isActive: true },
        // updatedAt keeps `data` non-empty for recipe-only edits (an empty update matches nothing).
        data: { ...changes, updatedAt: new Date() },
      });
      if (count === 0) return null;

      if (recipe) {
        await tx.recipeItem.deleteMany({ where: { menuItemId: id } });
        await tx.recipeItem.createMany({
          data: recipe.map((row) => ({ menuItemId: id, ...row })),
        });
      }

      return tx.menuItem.findFirst({ where: { id, restaurantId }, select: menuItemSelect });
    });
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
  ): Promise<MenuItemRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.menuItem.updateMany({
        where: { id, restaurantId, isActive: true },
        data: { price: new Prisma.Decimal(price) },
      });
      if (count === 0) return null;

      return tx.menuItem.findFirst({
        where: { id, restaurantId, isActive: true },
        select: menuItemSelect,
      });
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

  /** Soft delete; recipe rows are removed with it so the deactivated item holds no stock links. */
  async softDelete(restaurantId: string, id: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.menuItem.updateMany({
        where: { id, restaurantId, isActive: true },
        data: { isActive: false },
      });
      if (count === 0) return false;
      await tx.recipeItem.deleteMany({ where: { menuItemId: id } });
      return true;
    });
  }
}
