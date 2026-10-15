import { Injectable } from '@nestjs/common';
import type { CategoryType, RecipeRow } from '@rms/api-contract';
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
  isActive: true,
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
  isActive?: boolean;
};

export type MenuItemPageFilters = {
  activeOnly: boolean;
  categoryId?: string;
  skip: number;
  take: number;
};

@Injectable()
export class MenuItemsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findPage(
    restaurantId: string,
    filters: MenuItemPageFilters,
  ): Promise<{ items: MenuItemRecord[]; total: number }> {
    const where: Prisma.MenuItemWhereInput = {
      restaurantId,
      ...(filters.activeOnly && { isActive: true }),
      ...(filters.categoryId && { categoryId: filters.categoryId }),
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
        where: { id, restaurantId },
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
}
