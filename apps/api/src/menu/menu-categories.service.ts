import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateMenuCategoryRequest,
  MenuCategory,
  MenuCategoryListQuery,
  ReorderMenuCategoriesRequest,
  UpdateMenuCategoryRequest,
} from '@rms/api-contract';

import type { Actor } from '../common/auth/authenticated-request';
import { MenuCategoriesRepository, type MenuCategoryRecord } from './menu-categories.repository';

const NAME_IN_USE_MESSAGE = 'A menu category with this name already exists';

@Injectable()
export class MenuCategoriesService {
  constructor(private readonly repository: MenuCategoriesRepository) {}

  async list(actor: Actor, query: MenuCategoryListQuery): Promise<MenuCategory[]> {
    const categories = await this.repository.findAll(actor.restaurantId, query.activeOnly);
    return categories.map(toMenuCategory);
  }

  async create(actor: Actor, input: CreateMenuCategoryRequest): Promise<MenuCategory> {
    await this.assertNameAvailable(actor.restaurantId, input.name);
    const sortOrder = input.sortOrder ?? (await this.repository.nextSortOrder(actor.restaurantId));
    const created = await this.repository.create(actor.restaurantId, {
      name: input.name,
      categoryType: input.categoryType,
      sortOrder,
    });
    return toMenuCategory(created);
  }

  async update(
    actor: Actor,
    categoryId: string,
    input: UpdateMenuCategoryRequest,
  ): Promise<MenuCategory> {
    const existing = await this.assertExists(actor.restaurantId, categoryId);
    if (input.name !== undefined && input.name !== existing.name) {
      await this.assertNameAvailable(actor.restaurantId, input.name, categoryId);
    }

    const updated = await this.repository.update(actor.restaurantId, categoryId, input);
    if (!updated) throw new NotFoundException('Menu category not found');
    return toMenuCategory(updated);
  }

  async reorder(actor: Actor, input: ReorderMenuCategoriesRequest): Promise<MenuCategory[]> {
    const existingIds = await this.repository.findIds(actor.restaurantId);
    if (
      existingIds.length !== input.orderedIds.length ||
      existingIds.some((id) => !input.orderedIds.includes(id))
    ) {
      throw new BadRequestException(
        'The category list has changed. Refresh the page before reordering.',
      );
    }

    await this.repository.reorder(actor.restaurantId, input.orderedIds);
    const categories = await this.repository.findAll(actor.restaurantId, false);
    return categories.map(toMenuCategory);
  }

  private async assertExists(
    restaurantId: string,
    categoryId: string,
  ): Promise<MenuCategoryRecord> {
    const category = await this.repository.findById(restaurantId, categoryId);
    if (!category) throw new NotFoundException('Menu category not found');
    return category;
  }

  private async assertNameAvailable(
    restaurantId: string,
    name: string,
    excludeCategoryId?: string,
  ): Promise<void> {
    if (await this.repository.isNameTaken(restaurantId, name, excludeCategoryId)) {
      throw new ConflictException(NAME_IN_USE_MESSAGE);
    }
  }
}

function toMenuCategory(record: MenuCategoryRecord): MenuCategory {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
