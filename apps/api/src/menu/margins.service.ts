import { Injectable } from '@nestjs/common';
import {
  costBand,
  type CostTarget,
  foodCostPercent,
  marginDiff,
  marginPercent,
  type MarginPreviewRequest,
  type MarginPreviewResponse,
  type MarginReport,
  type MarginRow,
  toBaseQuantity,
} from '@rms/api-contract';

import type { Actor } from '../common/auth/authenticated-request';
import { PrismaService } from '../common/database/prisma.service';

/** A real ingredient cost per base unit, or null when there's none yet. */
type IngredientCost = number | null;

/**
 * Plate cost and food-cost % from live recipes. Each ingredient is costed at its latest purchase
 * (batch) cost, then its running average cost. No estimates: a dish with any ingredient lacking a
 * real cost shows what's missing instead of a misleadingly low partial cost.
 */
@Injectable()
export class MarginsService {
  constructor(private readonly prisma: PrismaService) {}

  async report(actor: Actor): Promise<MarginReport> {
    const { rows, target, missingRecipes } = await this.compute(actor.restaurantId, new Map());
    const priced = rows.filter((row) => row.foodCostPercent !== null);
    const average = priced.length
      ? priced.reduce((sum, row) => sum + (row.foodCostPercent ?? 0), 0) / priced.length
      : null;
    return {
      target,
      averageFoodCostPercent: average === null ? null : Math.round(average * 10) / 10,
      rows: rows.sort((a, b) => (a.marginPercent ?? 101) - (b.marginPercent ?? 101)),
      missingRecipes,
    };
  }

  async preview(actor: Actor, input: MarginPreviewRequest): Promise<MarginPreviewResponse> {
    const overrides = new Map(input.costs.map((cost) => [cost.stockItemId, Number(cost.unitCost)]));
    const before = await this.compute(actor.restaurantId, new Map());
    const after = await this.compute(actor.restaurantId, overrides);
    const keyOf = (row: MarginRow): string => `${row.menuItemId}:${row.variantId ?? ''}`;
    const snapshot = (rows: MarginRow[]) =>
      rows.map((row) => ({ key: keyOf(row), name: row.name, foodCostPct: row.foodCostPercent }));
    const changes = marginDiff(snapshot(before.rows), snapshot(after.rows));
    const byKey = new Map(after.rows.map((row) => [keyOf(row), row]));
    return {
      changes: changes.map((change) => {
        const row = byKey.get(change.key)!;
        return {
          menuItemId: row.menuItemId,
          variantId: row.variantId,
          name: change.name,
          before: Math.round(change.before * 10) / 10,
          after: Math.round(change.after * 10) / 10,
          delta: Math.round(change.delta * 10) / 10,
        };
      }),
      ingredientsUpdated: overrides.size,
      dishesAffected: new Set(changes.map((change) => byKey.get(change.key)?.menuItemId)).size,
    };
  }

  private async compute(
    restaurantId: string,
    overrides: ReadonlyMap<string, number>,
  ): Promise<{ rows: MarginRow[]; target: CostTarget; missingRecipes: number }> {
    const [restaurant, items, batches] = await Promise.all([
      this.prisma.restaurant.findUniqueOrThrow({
        where: { id: restaurantId },
        select: { targetFoodCostMin: true, targetFoodCostMax: true },
      }),
      this.prisma.menuItem.findMany({
        where: { restaurantId, isActive: true },
        select: {
          id: true,
          name: true,
          price: true,
          recipeRequired: true,
          recipeSource: true,
          recipeReviewedAt: true,
          category: { select: { name: true } },
          variants: {
            where: { isActive: true },
            select: { id: true, name: true, price: true, portionFactor: true },
            orderBy: { sortOrder: 'asc' },
          },
          recipeItems: {
            select: {
              quantity: true,
              unit: true,
              stockItem: {
                select: { id: true, averageUnitCost: true },
              },
            },
          },
        },
      }),
      this.prisma.stockBatch.findMany({
        where: { restaurantId },
        select: { stockItemId: true, unitCost: true },
        orderBy: { receivedAt: 'desc' },
      }),
    ]);
    const latest = new Map<string, number>();
    for (const batch of batches) {
      if (!latest.has(batch.stockItemId)) latest.set(batch.stockItemId, batch.unitCost.toNumber());
    }
    const costOf = (stockItem: {
      id: string;
      averageUnitCost: { toNumber(): number } | null;
    }): IngredientCost => {
      const override = overrides.get(stockItem.id);
      if (override !== undefined) return override;
      const real = latest.get(stockItem.id) ?? stockItem.averageUnitCost?.toNumber();
      return real !== undefined && real > 0 ? real : null;
    };

    const target = {
      min: restaurant.targetFoodCostMin.toNumber(),
      max: restaurant.targetFoodCostMax.toNumber(),
    };
    let missingRecipes = 0;
    const rows: MarginRow[] = [];
    for (const item of items) {
      if (!item.recipeItems.length) {
        if (item.recipeRequired) missingRecipes += 1;
        continue;
      }
      let cost = 0;
      let missingPrices = 0;
      for (const line of item.recipeItems) {
        const price = costOf(line.stockItem);
        if (price === null) {
          missingPrices += 1;
          continue;
        }
        cost += toBaseQuantity(line.quantity.toNumber(), line.unit) * price;
      }
      const costed = missingPrices === 0;
      const portions = item.variants.length
        ? item.variants.map((variant) => ({
            variantId: variant.id,
            name: `${item.name} (${variant.name})`,
            price: variant.price.toNumber(),
            factor: variant.portionFactor.toNumber(),
          }))
        : [{ variantId: null, name: item.name, price: item.price.toNumber(), factor: 1 }];
      for (const portion of portions) {
        const plateCost = cost * portion.factor;
        const pct = costed ? foodCostPercent(plateCost, portion.price) : null;
        rows.push({
          menuItemId: item.id,
          variantId: portion.variantId,
          name: portion.name,
          category: item.category.name,
          sellingPrice: portion.price,
          plateCost: costed ? Math.round(plateCost * 100) / 100 : null,
          foodCostPercent: pct === null ? null : Math.round(pct * 10) / 10,
          marginPercent:
            pct === null
              ? null
              : Math.round((marginPercent(plateCost, portion.price) ?? 0) * 10) / 10,
          band: pct === null ? null : costBand(pct, target),
          missingPrices,
          recipeUnreviewed: item.recipeSource === 'AI_DRAFT' && item.recipeReviewedAt === null,
        });
      }
    }
    return { rows, target, missingRecipes };
  }
}
