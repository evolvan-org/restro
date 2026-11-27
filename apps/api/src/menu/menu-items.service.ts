import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type CreateMenuItemRequest,
  type MenuCustomizations,
  menuCustomizationsSchema,
  type MenuItem,
  type MenuItemHistoryQuery,
  type MenuItemHistoryResponse,
  type MenuItemListQuery,
  menuItemRevisionSchema,
  type MenuItemSearchQuery,
  type MenuItemSearchResponse,
  type UpdateMenuItemAvailabilityRequest,
  type UpdateMenuItemClassificationRequest,
  type UpdateMenuItemPriceRequest,
  type UpdateMenuItemRequest,
} from '@rms/api-contract';
import { buildPageMeta } from '@rms/shared';

import type { Actor } from '../common/auth/authenticated-request';
import { toMenuItem } from './menu-items.mapper';
import {
  InactiveRecipeIngredientError,
  IncompatibleRecipeUnitError,
  MenuItemsRepository,
} from './menu-items.repository';

const NAME_IN_USE_MESSAGE = 'A menu item with this name already exists in the category';

@Injectable()
export class MenuItemsService {
  constructor(private readonly repository: MenuItemsRepository) {}

  async list(actor: Actor, query: MenuItemListQuery): Promise<MenuItem[]> {
    const items = await this.repository.findAll(
      actor.restaurantId,
      query.activeOnly,
      query.categoryId,
      query.itemType,
    );
    return items.map(toMenuItem);
  }

  async configure(actor: Actor, id: string, config: MenuCustomizations): Promise<MenuItem> {
    return this.repository.withLockedCustomizations(
      actor.restaurantId,
      id,
      actor.userId,
      async ({ current, findItem, save }) => {
        if (!current?.isActive) throw new NotFoundException('Menu item not found');
        const visit = async (itemId: string, path: ReadonlySet<string>): Promise<void> => {
          if (path.has(itemId)) throw new BadRequestException('A combo cannot contain a cycle');
          if (path.size >= 20) throw new BadRequestException('Combo nesting exceeds 20 levels');
          const item = await findItem(itemId);
          if (!item?.isActive) throw new NotFoundException('Combo component not found');
          const next = new Set([...path, itemId]);
          for (const component of menuCustomizationsSchema.parse(item.customizations).components) {
            await visit(component.menuItemId, next);
          }
        };
        for (const component of config.components) {
          await visit(component.menuItemId, new Set([id]));
        }
        return toMenuItem(await save(config));
      },
    );
  }

  async search(actor: Actor, query: MenuItemSearchQuery): Promise<MenuItemSearchResponse> {
    const { page, pageSize, q, categoryId, itemType, isAvailable, activeOnly } = query;
    const { items, total } = await this.repository.findSearchPage(actor.restaurantId, {
      q,
      categoryId,
      itemType,
      isAvailable,
      activeOnly,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { data: items.map(toMenuItem), meta: buildPageMeta(page, pageSize, total) };
  }

  async create(actor: Actor, input: CreateMenuItemRequest): Promise<MenuItem> {
    const { restaurantId } = actor;
    await this.assertCategoryExists(restaurantId, input.categoryId);
    await this.assertNameAvailable(restaurantId, input.categoryId, input.name);

    const { recipe, ...fields } = input;
    const created = await this.repository
      .create(restaurantId, fields, recipe, actor.userId)
      .catch(translateRecipeError);
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

    const { recipe, ...fields } = input;
    const updated = await this.repository
      .update(restaurantId, id, fields, recipe, actor.userId)
      .catch(translateRecipeError);
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

  async updatePrice(
    actor: Actor,
    id: string,
    input: UpdateMenuItemPriceRequest,
  ): Promise<MenuItem> {
    const updated = await this.repository.updatePrice(
      actor.restaurantId,
      id,
      input.price,
      actor.userId,
    );
    if (!updated) throw new NotFoundException('Menu item not found');
    return toMenuItem(updated);
  }

  async history(
    actor: Actor,
    id: string,
    query: MenuItemHistoryQuery,
  ): Promise<MenuItemHistoryResponse> {
    if (!(await this.repository.findById(actor.restaurantId, id))) {
      throw new NotFoundException('Menu item not found');
    }
    const { items, total } = await this.repository.history(
      actor.restaurantId,
      id,
      (query.page - 1) * query.pageSize,
      query.pageSize,
    );
    return {
      data: items.map((record) =>
        menuItemRevisionSchema.parse({ ...record, createdAt: record.createdAt.toISOString() }),
      ),
      meta: buildPageMeta(query.page, query.pageSize, total),
    };
  }

  async updateClassification(
    actor: Actor,
    id: string,
    input: UpdateMenuItemClassificationRequest,
  ): Promise<MenuItem> {
    const existing = await this.repository.findById(actor.restaurantId, id);
    // Inactive items are read-only until reactivated.
    if (!existing?.isActive) throw new NotFoundException('Menu item not found');
    const category = await this.repository.findCategory(actor.restaurantId, existing.categoryId);
    if (!category) throw new NotFoundException('Menu category not found');
    if (input.itemType !== category.categoryType) {
      throw new BadRequestException('Item classification must match its category classification');
    }
    const updated = await this.repository.updateClassification(
      actor.restaurantId,
      id,
      input.itemType,
    );
    if (!updated) {
      if (!(await this.repository.findById(actor.restaurantId, id))) {
        throw new NotFoundException('Menu item not found');
      }
      throw new ConflictException(
        'The item or category changed. Refresh before updating classification.',
      );
    }
    return toMenuItem(updated);
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
}

function translateRecipeError(error: unknown): never {
  if (error instanceof InactiveRecipeIngredientError) {
    throw new BadRequestException('Recipe contains an ingredient that is not in the stock list');
  }
  if (error instanceof IncompatibleRecipeUnitError) {
    throw new BadRequestException(
      "A recipe unit doesn't measure the same quantity as its ingredient's base unit",
    );
  }
  throw error;
}
