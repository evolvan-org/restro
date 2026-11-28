import { inventorySupplyMeasures, unitSchema } from '@rms/api-contract';
import { Prisma } from '@rms/db';
import { z } from 'zod';

import { recipeObservation, recipeObservationSelect } from '../orders/order-selections';
import { InventoryWriteContext } from './inventory.repository';

const recipeSchema = z.object({
  menuItemId: z.string().uuid(),
  recipeRequired: z.boolean(),
  ingredients: z.array(
    z.object({
      stockItemId: z.string().uuid(),
      quantity: z.string().regex(/^\d{1,9}(?:\.\d{1,3})?$/),
      unit: unitSchema,
    }),
  ),
});
const snapshotSchema = z.object({
  menu: recipeSchema,
  components: z.array(recipeSchema),
});
const Decimal = Prisma.Decimal;
const MAX_QUANTITY = new Decimal('999999999.999');

/** Runs inside the inventory and ticket locks. A ticket and its stock usage commit together. */
export async function recordTicketStockUsage(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  kotId: string,
  kotNumber: string,
  actorId: string,
): Promise<void> {
  const inventory = new InventoryWriteContext(tx, restaurantId);
  const lines = await tx.kotItem.findMany({
    where: {
      kotId,
      kot: { restaurantId, correctionOf: null },
      voidedAt: null,
      orderItem: { status: 'ACTIVE' },
      stockMovements: { none: { kind: 'USAGE' } },
    },
    select: {
      id: true,
      quantity: true,
      componentMenuItemId: true,
      nameSnapshot: true,
      orderItem: {
        select: { menuItemId: true, recipeSnapshot: true, menuItem: { select: { name: true } } },
      },
    },
    orderBy: { id: 'asc' },
  });

  for (const line of lines) {
    const menuId = line.componentMenuItemId ?? line.orderItem.menuItemId;
    const name = line.nameSnapshot ?? line.orderItem.menuItem.name;
    const snapshot = snapshotSchema.safeParse(line.orderItem.recipeSnapshot);
    let recipe: z.infer<typeof recipeSchema> | undefined;
    if (snapshot.success) {
      recipe = snapshot.data.components.length
        ? snapshot.data.components.find((component) => component.menuItemId === menuId)
        : snapshot.data.menu;
    } else if (line.orderItem.recipeSnapshot === null) {
      // Older live staff and QR tickets lack snapshots. Use the current recipe for these only.
      const menu = await tx.menuItem.findFirst({
        where: { id: menuId, restaurantId },
        select: recipeObservationSelect,
      });
      if (menu) recipe = recipeObservation(menu);
    }
    const issue = await postRecipe(
      inventory,
      { id: line.id, quantity: line.quantity, name },
      recipe,
      kotNumber,
      actorId,
    );
    if (issue)
      await tx.kotItem.update({
        where: { id: line.id },
        data: { stockUsageIssue: issue.slice(0, 500) },
      });
  }
}

async function postRecipe(
  inventory: InventoryWriteContext,
  line: { id: string; quantity: number; name: string },
  recipe: z.infer<typeof recipeSchema> | undefined,
  kotNumber: string,
  actorId: string,
): Promise<string | undefined> {
  if (!recipe?.ingredients.length) {
    return recipe?.recipeRequired === false ? undefined : 'No stock recipe for ' + line.name;
  }
  const requirements = new Map<string, { amount: Prisma.Decimal; baseUnit: string }>();
  for (const ingredient of recipe.ingredients) {
    const { baseUnit, factor } = inventorySupplyMeasures[ingredient.unit];
    const amount = new Decimal(ingredient.quantity).times(factor).times(line.quantity);
    const previous = requirements.get(ingredient.stockItemId);
    if (previous && previous.baseUnit !== baseUnit)
      return 'Inconsistent recipe units for ' + line.name;
    requirements.set(ingredient.stockItemId, {
      amount: previous ? previous.amount.plus(amount) : amount,
      baseUnit,
    });
  }

  // Resolve the entire recipe before writing any ingredients. An incomplete mapping leaves
  // one visible exception, rather than posting an incomplete consumption record.
  const plan = [];
  for (const [id, requirement] of requirements) {
    const stock = await inventory.item(id);
    if (!stock?.isActive || !stock.openedAt || stock.baseUnit !== requirement.baseUnit) {
      return 'Set up opening stock and compatible recipe units for ' + (stock?.name ?? line.name);
    }
    const balance = stock.currentStock.minus(requirement.amount);
    if (
      requirement.amount.lte(0) ||
      requirement.amount.gt(MAX_QUANTITY) ||
      balance.abs().gt(MAX_QUANTITY)
    ) {
      return 'Stock usage is outside the supported range for ' + stock.name;
    }
    plan.push({ stock, amount: requirement.amount, balance });
  }

  const reason = (kotNumber + ' · ' + line.name).slice(0, 500);
  for (const { stock, amount, balance } of plan) {
    const movement = {
      stockItemId: stock.id,
      kotItemId: line.id,
      actorId,
      reason,
      kind: 'USAGE' as const,
    };
    let remaining = amount;
    for (const batch of await inventory.onHandBatches(stock.id)) {
      if (remaining.isZero()) break;
      const used = Decimal.min(remaining, batch.quantityRemaining);
      await inventory.updateBatch(batch.id, batch.quantityRemaining.minus(used));
      await inventory.addMovement({
        ...movement,
        batchId: batch.id,
        quantity: used.negated(),
        unitCost: batch.unitCost,
      });
      remaining = remaining.minus(used);
    }
    if (remaining.gt(0)) {
      await inventory.addMovement({
        ...movement,
        quantity: remaining.negated(),
        unitCost: stock.averageUnitCost,
      });
    }
    await inventory.updateItem(stock.id, { currentStock: balance });
  }
}
