import { menuCustomizationsSchema, type MenuItem } from '@rms/api-contract';

import type { MenuItemRecord } from './menu-items.repository';

/** Serialises the same item shape for current responses and immutable revision snapshots. */
export function toMenuItem(record: MenuItemRecord): MenuItem {
  const { recipeItems, price, customizations, createdAt, updatedAt, ...rest } = record;
  return {
    ...rest,
    price: price.toFixed(2),
    customizations: menuCustomizationsSchema.parse(customizations),
    recipe: recipeItems.map((row) => ({
      stockItem: row.stockItem,
      quantity: row.quantity.toFixed(3),
      unit: row.unit,
    })),
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
}
