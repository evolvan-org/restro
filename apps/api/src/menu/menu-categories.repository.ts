import { Injectable } from '@nestjs/common';
import type { CategoryType } from '@rms/api-contract';
import { Prisma } from '@rms/db';

import { PrismaService } from '../common/database/prisma.service';

const menuCategorySelect = {
  id: true,
  name: true,
  categoryType: true,
  sortOrder: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.MenuCategorySelect;

export type MenuCategoryRecord = Prisma.MenuCategoryGetPayload<{
  select: typeof menuCategorySelect;
}>;

export type MenuCategoryChanges = {
  name?: string;
  categoryType?: CategoryType;
  sortOrder?: number;
  isActive?: boolean;
};

export type NewMenuCategory = {
  name: string;
  categoryType: CategoryType;
  sortOrder: number;
};

@Injectable()
export class MenuCategoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(restaurantId: string, activeOnly: boolean): Promise<MenuCategoryRecord[]> {
    return this.prisma.menuCategory.findMany({
      where: { restaurantId, ...(activeOnly && { isActive: true }) },
      select: menuCategorySelect,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  findById(restaurantId: string, categoryId: string): Promise<MenuCategoryRecord | null> {
    return this.prisma.menuCategory.findFirst({
      where: { id: categoryId, restaurantId },
      select: menuCategorySelect,
    });
  }

  async findIds(restaurantId: string): Promise<string[]> {
    const categories = await this.prisma.menuCategory.findMany({
      where: { restaurantId },
      select: { id: true },
    });
    return categories.map(({ id }) => id);
  }

  async isNameTaken(
    restaurantId: string,
    name: string,
    excludeCategoryId?: string,
  ): Promise<boolean> {
    const existing = await this.prisma.menuCategory.findFirst({
      where: {
        restaurantId,
        name: { equals: name, mode: 'insensitive' },
        ...(excludeCategoryId && { id: { not: excludeCategoryId } }),
      },
      select: { id: true },
    });
    return existing !== null;
  }

  async nextSortOrder(restaurantId: string): Promise<number> {
    const result = await this.prisma.menuCategory.aggregate({
      where: { restaurantId },
      _max: { sortOrder: true },
    });
    return (result._max.sortOrder ?? -1) + 1;
  }

  create(restaurantId: string, category: NewMenuCategory): Promise<MenuCategoryRecord> {
    return this.prisma.menuCategory.create({
      data: { restaurantId, ...category },
      select: menuCategorySelect,
    });
  }

  async update(
    restaurantId: string,
    categoryId: string,
    changes: MenuCategoryChanges,
  ): Promise<MenuCategoryRecord | null> {
    const { count } = await this.prisma.menuCategory.updateMany({
      where: { id: categoryId, restaurantId },
      data: changes,
    });
    return count === 0 ? null : this.findById(restaurantId, categoryId);
  }

  /** Writes every sortOrder in one transaction so readers never see a half-applied order. */
  async reorder(restaurantId: string, orderedIds: string[]): Promise<void> {
    await this.prisma.$transaction(
      orderedIds.map((id, sortOrder) =>
        this.prisma.menuCategory.updateMany({
          where: { id, restaurantId },
          data: { sortOrder },
        }),
      ),
    );
  }
}
