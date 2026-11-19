import type { MenuItem, ServingType } from '@prisma/client';

import { MENU } from './catalog';
import type { Tx } from './support';

/** Units a recipe line may use for each ingredient base unit (mirrors inventorySupplyMeasures). */
const UNIT_FAMILY = { G: 'G', KG: 'G', ML: 'ML', L: 'ML', UNIT: 'UNIT' } as const;

export type SeededMenuItem = Pick<MenuItem, 'id' | 'name' | 'price' | 'itemType'> & {
  weight: number;
  orderable: boolean;
};

/**
 * Upserts categories (matched by name) and items (matched by name within the
 * restaurant). Items that already exist keep their price and availability so a
 * re-run never overwrites edits made in the app; only missing recipe lines are added.
 */
export async function seedMenu(
  tx: Tx,
  restaurantId: string,
  stockIds: ReadonlyMap<string, { id: string; baseUnit: string | null }>,
): Promise<{ items: SeededMenuItem[]; recipeLines: number; skipped: string[] }> {
  const items: SeededMenuItem[] = [];
  const skipped: string[] = [];
  let recipeLines = 0;

  for (const [sortOrder, category] of MENU.entries()) {
    const categoryId = await upsertCategory(
      tx,
      restaurantId,
      category.name,
      category.type,
      sortOrder,
    );

    for (const seed of category.items) {
      const existing = await tx.menuItem.findFirst({
        where: { restaurantId, name: { equals: seed.name, mode: 'insensitive' } },
      });
      const item =
        existing ??
        (await tx.menuItem.create({
          data: {
            restaurantId,
            categoryId,
            name: seed.name,
            description: seed.description,
            price: seed.price,
            itemType: category.type,
            isAvailable: seed.isAvailable ?? true,
            isActive: seed.isActive ?? true,
          },
        }));
      items.push({
        id: item.id,
        name: item.name,
        price: item.price,
        itemType: item.itemType,
        weight: seed.weight ?? 1,
        orderable: item.isActive && item.isAvailable,
      });

      for (const [stockName, quantity, unit] of seed.recipe) {
        const stock = stockIds.get(stockName);
        if (!stock || stock.baseUnit !== UNIT_FAMILY[unit]) {
          skipped.push(`${seed.name} → ${stockName}`);
          continue;
        }
        const created = await tx.recipeItem.createMany({
          data: [{ menuItemId: item.id, stockItemId: stock.id, quantity, unit }],
          skipDuplicates: true,
        });
        recipeLines += created.count;
      }
    }
  }

  return { items, recipeLines, skipped };
}

async function upsertCategory(
  tx: Tx,
  restaurantId: string,
  name: string,
  categoryType: ServingType,
  sortOrder: number,
): Promise<string> {
  const existing = await tx.menuCategory.findFirst({
    where: { restaurantId, name: { equals: name, mode: 'insensitive' } },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await tx.menuCategory.create({
    data: { restaurantId, name, categoryType, sortOrder },
    select: { id: true },
  });
  return created.id;
}
