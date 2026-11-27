import {
  type AiJobItem,
  CONFIDENCE_MEDIUM,
  type OnboardingDraftData,
  type OnboardingInventoryRow,
  type OnboardingRecipeDishDraft,
  type OnboardingRecipesDraft,
  parseDecimal,
  recipeDraftSchema,
} from '@rms/api-contract';

import { newKey } from '../../keys';
import {
  ingredientKey,
  type IngredientUse,
  lineUnitConflicts,
  usedIngredients,
} from '../../recipe-ingredients';

export const DEFAULT_RECIPES: OnboardingRecipesDraft = {
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

/**
 * A draft needs a look when it has no lines, the AI was unsure, a quantity is missing, or a line
 * measures its ingredient differently from the other recipes (milk in g here, ml elsewhere).
 */
export function dishNeedsAttention(
  dish: OnboardingRecipeDishDraft,
  used: ReadonlyMap<string, IngredientUse>,
): boolean {
  if (dish.status !== 'draft') return false;
  return (
    dish.lines.length === 0 ||
    (dish.confidence ?? 100) < CONFIDENCE_MEDIUM ||
    dish.lines.some(
      (line) =>
        (!line.edited && (line.confidence ?? 100) < CONFIDENCE_MEDIUM) ||
        !((parseDecimal(line.quantity) ?? 0) > 0) ||
        lineUnitConflicts(line, used) !== null,
    )
  );
}

/**
 * Pre-fills Inventory with every ingredient the recipes use ("From your recipes"), stocked in the
 * unit most recipes measure it in. No opening stock or cost yet: real costs come from invoices.
 * Rows the owner already has are left as they are.
 */
export function inventoryRowsFromRecipes(data: OnboardingDraftData): OnboardingInventoryRow[] {
  const rows = data.inventory?.rows ?? [];
  if (!data.recipes) return rows;
  const existing = new Set(rows.map((row) => ingredientKey(row.name)));
  const added: OnboardingInventoryRow[] = [];
  for (const [key, entry] of usedIngredients(data.recipes.dishes)) {
    if (existing.has(key)) continue;
    added.push({
      key: newKey(),
      name: entry.name,
      sku: '',
      baseUnit: entry.base ?? 'G',
      reorderLevel: '0',
      openingQuantity: '',
      openingUnitCost: '',
      origin: 'recipe',
    });
  }
  return added.length ? [...rows, ...added] : rows;
}
