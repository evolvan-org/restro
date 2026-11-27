import {
  includedMenuRows,
  type OnboardingDraftData,
  type OnboardingMenuRow,
  type OnboardingRecipeDishDraft,
} from '@rms/api-contract';

/*
 * Ingredient bookkeeping for the onboarding recipes: names, the unit family each ingredient is
 * measured in, and renaming across every drafted recipe. No prices: food cost starts after setup,
 * from real supplier invoices.
 */

export const ingredientKey = (name: string): string => name.trim().toLowerCase();

/** How an ingredient is counted in stock: grams, millilitres or pieces. */
export type UnitBase = 'G' | 'ML' | 'UNIT';

export function unitBase(unit: string): UnitBase | null {
  const value = unit.trim().toUpperCase();
  if (value === 'G' || value === 'KG') return 'G';
  if (value === 'ML' || value === 'L') return 'ML';
  if (value === 'UNIT') return 'UNIT';
  return null;
}

export const UNIT_BASE_LABELS: Record<UnitBase, string> = { G: 'g', ML: 'ml', UNIT: 'pieces' };

/** Menu rows that recipes can attach to (the menu step's included rows). */
export function recipeMenuRows(
  data: OnboardingDraftData,
  menuSkipped: boolean,
): OnboardingMenuRow[] {
  if (menuSkipped || !data.menu || data.menu.mode === 'later') return [];
  return includedMenuRows(data.menu.rows).filter((row) => row.name.trim());
}

export type IngredientUse = {
  /** Name as written in the first recipe that uses it. */
  name: string;
  /** Menu row keys of the dishes that use it. */
  dishKeys: string[];
  /** The unit family most of its recipes use; null when no line has a known unit. */
  base: UnitBase | null;
  /** Dishes per unit family; more than one family means the recipes disagree. */
  bases: Partial<Record<UnitBase, number>>;
};

/** Every ingredient the recipes use (not "No recipe needed" dishes), keyed by `ingredientKey`. */
export function usedIngredients(
  dishes: readonly OnboardingRecipeDishDraft[],
): Map<string, IngredientUse> {
  const used = new Map<string, IngredientUse>();
  for (const dish of dishes) {
    if (dish.status === 'no-recipe') continue;
    const seen = new Set<string>();
    for (const line of dish.lines) {
      const name = line.ingredient.trim();
      const key = ingredientKey(name);
      if (!name || seen.has(key)) continue;
      seen.add(key);
      const entry = used.get(key) ?? { name, dishKeys: [], base: null, bases: {} };
      entry.dishKeys.push(dish.menuRowKey);
      const base = unitBase(line.unit);
      if (base) entry.bases[base] = (entry.bases[base] ?? 0) + 1;
      used.set(key, entry);
    }
  }
  for (const entry of used.values()) {
    const ranked = (Object.entries(entry.bases) as [UnitBase, number][]).sort(
      (a, b) => b[1] - a[1],
    );
    entry.base = ranked[0]?.[0] ?? null;
  }
  return used;
}

/** True when this line measures its ingredient differently from most other recipes. */
export function lineUnitConflicts(
  line: OnboardingRecipeDishDraft['lines'][number],
  used: ReadonlyMap<string, IngredientUse>,
): UnitBase | null {
  const entry = used.get(ingredientKey(line.ingredient));
  const base = unitBase(line.unit);
  if (!entry?.base || !base || Object.keys(entry.bases).length < 2) return null;
  return base === entry.base ? null : entry.base;
}

/**
 * Renames an ingredient in every recipe. When the new name is already used (a merge), a dish that
 * listed both keeps its first line, so no recipe lists the same ingredient twice.
 */
export function renameIngredient(
  dishes: readonly OnboardingRecipeDishDraft[],
  fromKey: string,
  toName: string,
): OnboardingRecipeDishDraft[] {
  const name = toName.trim();
  const toKey = ingredientKey(name);
  return dishes.map((dish) => {
    if (!dish.lines.some((line) => ingredientKey(line.ingredient) === fromKey)) return dish;
    const seen = new Set<string>();
    const lines = dish.lines.flatMap((line) => {
      const renamed =
        ingredientKey(line.ingredient) === fromKey ? { ...line, ingredient: name } : line;
      const key = ingredientKey(renamed.ingredient);
      if (key === toKey && seen.has(key)) return [];
      seen.add(key);
      return [renamed];
    });
    return { ...dish, lines };
  });
}
