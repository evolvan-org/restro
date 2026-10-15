import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateMenuItemRequest,
  MenuItem,
  MenuItemListQuery,
  RecipeRow,
  UpdateMenuItemAvailabilityRequest,
  UpdateMenuItemRequest,
} from '@rms/api-contract';

import type { Actor } from '../common/auth/authenticated-request';
import { StockItemsRepository } from '../stock/stock-items.repository';
import { type MenuItemRecord, MenuItemsRepository } from './menu-items.repository';

const NAME_IN_USE_MESSAGE = 'A menu item with this name already exists in the category';

// TODO(orders-epic): deduct stock on order confirmation (recipe quantity × ordered quantity).
// Creating or editing an item only writes the recipe link; it never reads or mutates stock levels.
@Injectable()
export class MenuItemsService {
  constructor(
    private readonly repository: MenuItemsRepository,
    private readonly stockItems: StockItemsRepository,
  ) {}

  async list(actor: Actor, query: MenuItemListQuery): Promise<MenuItem[]> {
    const items = await this.repository.findAll(actor.restaurantId, query.categoryId);
    return items.map(toMenuItem);
  }

  async create(actor: Actor, input: CreateMenuItemRequest): Promise<MenuItem> {
    const { restaurantId } = actor;
    await this.assertCategoryExists(restaurantId, input.categoryId);
    await this.assertNameAvailable(restaurantId, input.categoryId, input.name);
    await this.assertRecipeStockItemsExist(restaurantId, input.recipe);

    const { recipe, ...fields } = input;
    const created = await this.repository.create(restaurantId, fields, recipe);
    return toMenuItem(created);
  }

  async update(actor: Actor, id: string, input: UpdateMenuItemRequest): Promise<MenuItem> {
    const { restaurantId } = actor;
    const existing = await this.repository.findById(restaurantId, id);
    if (!existing) throw new NotFoundException('Menu item not found');

    const categoryId = input.categoryId ?? existing.categoryId;
    const name = input.name ?? existing.name;
    if (input.categoryId !== undefined && input.categoryId !== existing.categoryId) {
      await this.assertCategoryExists(restaurantId, input.categoryId);
    }
    if (categoryId !== existing.categoryId || name.toLowerCase() !== existing.name.toLowerCase()) {
      await this.assertNameAvailable(restaurantId, categoryId, name, id);
    }
    if (input.recipe) await this.assertRecipeStockItemsExist(restaurantId, input.recipe);

    const { recipe, ...fields } = input;
    const updated = await this.repository.update(restaurantId, id, fields, recipe);
    if (!updated) throw new NotFoundException('Menu item not found');
    return toMenuItem(updated);
  }

  async updateAvailability(
    actor: Actor,
    id: string,
    input: UpdateMenuItemAvailabilityRequest,
  ): Promise<MenuItem> {
    const updated = await this.repository.updateAvailability(
      actor.restaurantId,
      id,
      input.isAvailable,
    );
    if (!updated) throw new NotFoundException('Menu item not found');
    return toMenuItem(updated);
  }

  async remove(actor: Actor, id: string): Promise<void> {
    const deleted = await this.repository.softDelete(actor.restaurantId, id);
    if (!deleted) throw new NotFoundException('Menu item not found');
  }

  private async assertCategoryExists(restaurantId: string, categoryId: string): Promise<void> {
    if (!(await this.repository.categoryExists(restaurantId, categoryId))) {
      throw new NotFoundException('Menu category not found');
    }
  }

  private async assertNameAvailable(
    restaurantId: string,
    categoryId: string,
    name: string,
    excludeItemId?: string,
  ): Promise<void> {
    if (await this.repository.isNameTaken(restaurantId, categoryId, name, excludeItemId)) {
      throw new ConflictException(NAME_IN_USE_MESSAGE);
    }
  }

  /** Ingredients come only from the restaurant's seeded master; anything else is rejected. */
  private async assertRecipeStockItemsExist(
    restaurantId: string,
    recipe: RecipeRow[],
  ): Promise<void> {
    const wanted = [...new Set(recipe.map((row) => row.stockItemId))];
    const found = new Set(await this.stockItems.findActiveIds(restaurantId, wanted));
    if (wanted.some((id) => !found.has(id))) {
      throw new BadRequestException('Recipe contains an ingredient that is not in the stock list');
    }
  }
}

function toMenuItem(record: MenuItemRecord): MenuItem {
  const { recipeItems, price, createdAt, updatedAt, ...rest } = record;
  return {
    ...rest,
    price: price.toFixed(2),
    recipe: recipeItems.map((row) => ({
      stockItem: row.stockItem,
      quantity: row.quantity.toFixed(3),
      unit: row.unit,
    })),
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
}
