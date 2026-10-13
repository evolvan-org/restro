import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { CreateMenuItemRequest } from '@rms/api-contract';
import { Prisma } from '@rms/db';

import type { Actor } from '../common/auth/authenticated-request';
import type { StockItemsRepository } from '../stock/stock-items.repository';
import type { MenuItemRecord, MenuItemsRepository } from './menu-items.repository';
import { MenuItemsService } from './menu-items.service';

const actor = { restaurantId: 'r1' } as Actor;
const CATEGORY = '11111111-1111-4111-8111-111111111111';
const FLOUR = '22222222-2222-4222-8222-222222222222';
const CHEESE = '33333333-3333-4333-8333-333333333333';

const input: CreateMenuItemRequest = {
  categoryId: CATEGORY,
  name: 'Margherita',
  price: 9.5,
  itemType: 'FOOD',
  isAvailable: true,
  recipe: [
    { stockItemId: FLOUR, quantity: '0.250', unit: 'KG' },
    { stockItemId: CHEESE, quantity: '80', unit: 'G' },
  ],
};

const record: MenuItemRecord = {
  id: 'i1',
  categoryId: CATEGORY,
  name: 'Margherita',
  description: null,
  price: new Prisma.Decimal(9.5),
  itemType: 'FOOD',
  isAvailable: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  recipeItems: [
    {
      quantity: new Prisma.Decimal('0.25'),
      unit: 'KG',
      stockItem: { id: FLOUR, name: 'Flour' },
    },
  ],
};

function setup(): {
  service: MenuItemsService;
  repo: jest.Mocked<MenuItemsRepository>;
  stock: jest.Mocked<StockItemsRepository>;
} {
  const repo = {
    findAll: jest.fn(),
    findById: jest.fn(),
    categoryExists: jest.fn().mockResolvedValue(true),
    isNameTaken: jest.fn().mockResolvedValue(false),
    create: jest.fn().mockResolvedValue(record),
    update: jest.fn().mockResolvedValue(record),
    softDelete: jest.fn(),
  } as unknown as jest.Mocked<MenuItemsRepository>;
  const stock = {
    findActiveIds: jest.fn().mockResolvedValue([FLOUR, CHEESE]),
  } as unknown as jest.Mocked<StockItemsRepository>;
  return { service: new MenuItemsService(repo, stock), repo, stock };
}

describe('MenuItemsService', () => {
  it('creates an item and returns decimals as strings', async () => {
    const { service, repo } = setup();
    const result = await service.create(actor, input);
    expect(repo.create).toHaveBeenCalledWith(
      'r1',
      expect.objectContaining({ name: 'Margherita', categoryId: CATEGORY }),
      input.recipe,
    );
    expect(result.price).toBe('9.50');
    expect(result.recipe[0]).toEqual({
      stockItem: { id: FLOUR, name: 'Flour' },
      quantity: '0.250',
      unit: 'KG',
    });
  });

  it('rejects an unknown category with 404', async () => {
    const { service, repo } = setup();
    repo.categoryExists.mockResolvedValue(false);
    await expect(service.create(actor, input)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a duplicate name in the category with 409', async () => {
    const { service, repo } = setup();
    repo.isNameTaken.mockResolvedValue(true);
    await expect(service.create(actor, input)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a stockItemId outside the master with 400', async () => {
    const { service, stock, repo } = setup();
    stock.findActiveIds.mockResolvedValue([FLOUR]);
    await expect(service.create(actor, input)).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('replaces the recipe on update and skips the name check when the name is unchanged', async () => {
    const { service, repo } = setup();
    repo.findById.mockResolvedValue(record);
    await service.update(actor, 'i1', { recipe: [input.recipe[0]!] });
    expect(repo.isNameTaken).not.toHaveBeenCalled();
    expect(repo.update).toHaveBeenCalledWith('r1', 'i1', {}, [input.recipe[0]]);
  });

  it('404s when updating or deleting a missing item', async () => {
    const { service, repo } = setup();
    repo.findById.mockResolvedValue(null);
    repo.softDelete.mockResolvedValue(false);
    await expect(service.update(actor, 'x', { name: 'A' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.remove(actor, 'x')).rejects.toBeInstanceOf(NotFoundException);
  });
});
