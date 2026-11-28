import { createHash } from 'node:crypto';

import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  type AddOrderItemRequest,
  inventorySupplyMeasures,
  MAX_MENU_ITEM_PRICE,
  menuCustomizationsSchema,
  type OrderSelectionSnapshot,
} from '@rms/api-contract';
import { Prisma } from '@rms/db';

import type { NewOrderLine, OrderingMenuRecord } from './orders.repository';

const MAX_QUANTITY = 2147483647;

function multiplyQuantity(left: number, right: number): number {
  if (right > Math.floor(MAX_QUANTITY / left)) {
    throw new BadRequestException('Combo quantity exceeds the supported maximum');
  }
  return left * right;
}

export const recipeObservationSelect = {
  id: true,
  recipeRequired: true,
  recipeItems: {
    where: { isActive: true },
    select: {
      quantity: true,
      unit: true,
      stockItem: { select: { id: true, name: true, baseUnit: true, averageUnitCost: true } },
    },
    orderBy: { stockItemId: 'asc' },
  },
} satisfies Prisma.MenuItemSelect;

/** All cost facts are observed at ordering time; unknown cost is retained as null. */
export function recipeObservation(
  item: Prisma.MenuItemGetPayload<{ select: typeof recipeObservationSelect }>,
) {
  let known = item.recipeItems.length > 0;
  let cost = new Prisma.Decimal(0);
  const ingredients = item.recipeItems.map((line) => {
    const measure = inventorySupplyMeasures[line.unit];
    const average = line.stockItem.averageUnitCost;
    const compatible = measure.baseUnit === line.stockItem.baseUnit;
    const amount =
      average !== null && compatible ? line.quantity.mul(measure.factor).mul(average) : null;
    if (amount === null) known = false;
    else cost = cost.plus(amount);
    return {
      stockItemId: line.stockItem.id,
      name: line.stockItem.name,
      quantity: line.quantity.toFixed(3),
      unit: line.unit,
      averageBaseUnitCost: average?.toFixed(8) ?? null,
      cost: amount?.toFixed(8) ?? null,
    };
  });
  return {
    menuItemId: item.id,
    recipeRequired: item.recipeRequired,
    ingredients,
    cost: known ? cost.toFixed(8) : null,
  };
}

export async function buildOrderLine(
  menuItem: OrderingMenuRecord,
  input: AddOrderItemRequest,
  findItem: (id: string) => Promise<OrderingMenuRecord | null>,
): Promise<NewOrderLine> {
  const config = menuCustomizationsSchema.parse(menuItem.customizations);
  const variant = input.variantId
    ? config.variants.find((candidate) => candidate.id === input.variantId)
    : null;
  if (input.variantId && !variant)
    throw new BadRequestException('The selected size is unavailable');
  const ids = input.modifierIds ?? [];
  if (new Set(ids).size !== ids.length)
    throw new BadRequestException('Select each option only once');
  const selected = new Set(ids);
  const modifiers = config.groups.flatMap((group) => {
    const choices = group.modifiers.filter((option) => selected.has(option.id));
    if (choices.length < group.minSelect || choices.length > group.maxSelect) {
      throw new BadRequestException(
        `Choose ${group.minSelect} to ${group.maxSelect} options for ${group.name}`,
      );
    }
    return choices;
  });
  if (modifiers.length !== selected.size) {
    throw new BadRequestException('One or more options do not belong to this menu item');
  }
  const price = modifiers.reduce(
    (total, option) => total.plus(option.priceAdjustment),
    new Prisma.Decimal(variant?.price ?? menuItem.price),
  );
  if (price.isNegative() || price.greaterThan(MAX_MENU_ITEM_PRICE)) {
    throw new BadRequestException(
      `The selected item price must be between 0 and ${MAX_MENU_ITEM_PRICE}`,
    );
  }

  const components: OrderSelectionSnapshot['components'] = [];
  const recipes: Prisma.InputJsonObject[] = [];
  let visited = 0;
  const expand = async (id: string, quantity: number, path: ReadonlySet<string>): Promise<void> => {
    if (++visited > 1000 || path.size >= 20 || path.has(id)) {
      throw new BadRequestException('Combo configuration is cyclic or too large');
    }
    const component = await findItem(id);
    if (!component) throw new NotFoundException('Combo component not found');
    if (!component.isAvailable) throw new BadRequestException(`${component.name} is unavailable`);
    const children = menuCustomizationsSchema.parse(component.customizations).components;
    if (children.length > 0) {
      const next = new Set([...path, id]);
      for (const child of children) {
        await expand(child.menuItemId, multiplyQuantity(quantity, child.quantity), next);
      }
    } else {
      multiplyQuantity(quantity, input.quantity);
      components.push({
        menuItemId: component.id,
        name: component.name,
        itemType: component.itemType,
        quantity,
      });
      recipes.push({ ...recipeObservation(component), quantity });
    }
  };
  for (const component of config.components) {
    await expand(component.menuItemId, component.quantity, new Set([menuItem.id]));
  }

  const selectionSnapshot: OrderSelectionSnapshot = {
    version: 1,
    basePrice: menuItem.price.toFixed(2),
    unitPrice: price.toFixed(2),
    variant: variant ?? null,
    modifiers,
    components,
  };
  const recipeSnapshot: Prisma.InputJsonObject = {
    version: 1,
    menu: recipeObservation(menuItem),
    components: recipes,
    // A priced size or substitution does not establish its ingredient quantities.
    customizationCostKnown: !variant && modifiers.length === 0,
  };
  const names = [
    menuItem.name,
    ...(variant ? [variant.name] : []),
    ...modifiers.map((option) => option.name),
  ];
  return {
    menuItemId: menuItem.id,
    quantity: input.quantity,
    specialInstructions: input.specialInstructions?.trim() || null,
    unitPrice: price,
    nameSnapshot: names.join(' · '),
    itemTypeSnapshot: menuItem.itemType,
    selectionSnapshot,
    recipeSnapshot,
    configurationKey: createHash('sha256')
      .update(JSON.stringify({ selectionSnapshot, recipeSnapshot, names }))
      .digest('hex'),
  };
}
