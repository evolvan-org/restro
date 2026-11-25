import {
  type AiJobItem,
  CONFIDENCE_MEDIUM,
  type OnboardingDraftData,
  type OnboardingIngredientDraft,
  type OnboardingInventoryRow,
  type OnboardingRecipeDishDraft,
  type OnboardingRecipesDraft,
  recipeDraftSchema,
} from '@rms/api-contract';

import { type DishCosting, ingredientKey } from '../../costing';
import { newKey } from '../../keys';

export const DEFAULT_RECIPES: OnboardingRecipesDraft = {
  targetMin: 30,
  targetMax: 35,
  portionStyle: 'STANDARD',
  dishes: [],
  ingredients: [],
};

/** Adds drafted dishes the draft doesn't have yet (one per menu row, idempotent). */
export function mergeRecipeItems(
  recipes: OnboardingRecipesDraft,
  items: readonly AiJobItem[],
): OnboardingRecipeDishDraft[] | null {
  const have = new Set(recipes.dishes.map((dish) => dish.menuRowKey));
  const fresh: OnboardingRecipeDishDraft[] = [];
  for (const item of items) {
    const draft = recipeDraftSchema.safeParse(item.data);
    if (!draft.success || have.has(draft.data.dishRef)) continue;
    have.add(draft.data.dishRef);
    fresh.push({
      menuRowKey: draft.data.dishRef,
      status: draft.data.noRecipeNeeded ? 'no-recipe' : 'draft',
      fromAi: true,
      confidence: draft.data.confidence,
      ...(draft.data.note && { note: draft.data.note }),
      lines: draft.data.lines.map((line) => ({
        key: newKey(),
        ingredient: line.ingredient,
        quantity: line.quantity,
        unit: line.unit,
        confidence: line.confidence,
      })),
    });
  }
  return fresh.length ? [...recipes.dishes, ...fresh] : null;
}

export function dishNeedsAttention(dish: OnboardingRecipeDishDraft, costing: DishCosting): boolean {
  if (dish.status !== 'draft') return false;
  return (
    dish.lines.length === 0 ||
    (dish.confidence ?? 100) < CONFIDENCE_MEDIUM ||
    dish.lines.some((line) => !line.edited && (line.confidence ?? 100) < CONFIDENCE_MEDIUM) ||
    costing.missingPrices > 0 ||
    costing.unitMismatches > 0
  );
}

/** Ingredient names used by recipes that still need a dish (not "No recipe needed"). */
export function usedIngredients(
  recipes: OnboardingRecipesDraft,
): Map<string, { name: string; dishes: number; base: 'G' | 'ML' | 'UNIT' | null }> {
  const used = new Map<
    string,
    { name: string; dishes: number; base: 'G' | 'ML' | 'UNIT' | null }
  >();
  for (const dish of recipes.dishes) {
    if (dish.status === 'no-recipe') continue;
    const seen = new Set<string>();
    for (const line of dish.lines) {
      const name = line.ingredient.trim();
      const key = ingredientKey(name);
      if (!name || seen.has(key)) continue;
      seen.add(key);
      const unit = line.unit.trim().toUpperCase();
      const base =
        unit === 'G' || unit === 'KG'
          ? 'G'
          : unit === 'ML' || unit === 'L'
            ? 'ML'
            : unit === 'UNIT'
              ? 'UNIT'
              : null;
      const entry = used.get(key) ?? { name, dishes: 0, base };
      entry.dishes += 1;
      used.set(key, entry);
    }
  }
  return used;
}

/**
 * Pre-fills Inventory with every ingredient the recipes use ("From your recipes"): base unit and
 * estimated cost, no opening stock yet. Rows the owner already has are left as they are.
 */
export function inventoryRowsFromRecipes(data: OnboardingDraftData): OnboardingInventoryRow[] {
  const recipes = data.recipes;
  const rows = data.inventory?.rows ?? [];
  if (!recipes) return rows;
  const existing = new Set(rows.map((row) => ingredientKey(row.name)));
  const registry = new Map(recipes.ingredients.map((entry) => [ingredientKey(entry.name), entry]));
  const added: OnboardingInventoryRow[] = [];
  for (const [key, { name, base }] of usedIngredients(recipes)) {
    if (existing.has(key)) continue;
    const known: OnboardingIngredientDraft | undefined = registry.get(key);
    // Stock the ingredient the way its recipes measure it when the price lookup hasn't said.
    added.push({
      key: newKey(),
      name: known?.name ?? name,
      sku: '',
      baseUnit: known?.baseUnit || base || 'G',
      reorderLevel: '0',
      openingQuantity: '',
      openingUnitCost: '',
      origin: 'recipe',
      costSource: 'estimated',
      estimatedUnitCost: known?.estimatedPricePerBase ?? '',
    });
  }
  return added.length ? [...rows, ...added] : rows;
}
