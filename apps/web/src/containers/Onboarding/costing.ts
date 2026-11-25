import {
  type CostBand,
  costBand,
  type CostBaseUnit,
  type CostTarget,
  DEFAULT_FOOD_COST_TARGET,
  effectiveMenuRowPrice,
  foodCostPercent,
  includedMenuRows,
  lineCost,
  type MarginSnapshot,
  type OnboardingDraftData,
  type OnboardingMenuRow,
  type OnboardingRecipeDishDraft,
  parseDecimal,
  portionFactorForVariant,
  type Unit,
  unitFitsBase,
} from '@rms/api-contract';

/*
 * Live food cost for the onboarding draft. Real invoice (or typed) costs from the inventory rows win
 * over estimated market prices from the ingredient list. The same arithmetic as the API
 * (`@rms/api-contract` costing), so numbers never jump after Finish.
 */

export type PriceSource = 'invoice' | 'manual' | 'estimated' | 'none';
export type IngredientPrice = {
  pricePerBase: number | null;
  source: PriceSource;
  baseUnit: CostBaseUnit | null;
};

export const ingredientKey = (name: string): string => name.trim().toLowerCase();
const UNITS = new Set(['G', 'KG', 'ML', 'L', 'UNIT']);
const asUnit = (value: string): Unit | null => {
  const unit = value.trim().toUpperCase();
  return UNITS.has(unit) ? (unit as Unit) : null;
};
const asBase = (value: string | undefined): CostBaseUnit | null => {
  const unit = value?.trim().toUpperCase();
  return unit === 'G' || unit === 'ML' || unit === 'UNIT' ? unit : null;
};

export function ingredientPrices(data: OnboardingDraftData): Map<string, IngredientPrice> {
  const prices = new Map<string, IngredientPrice>();
  for (const ingredient of data.recipes?.ingredients ?? []) {
    const price = parseDecimal(ingredient.estimatedPricePerBase);
    prices.set(ingredientKey(ingredient.name), {
      pricePerBase: price !== null && price > 0 ? price : null,
      source:
        price === null || price <= 0
          ? 'none'
          : ingredient.priceSource === 'manual'
            ? 'manual'
            : ingredient.priceSource === 'invoice'
              ? 'invoice'
              : 'estimated',
      baseUnit: asBase(ingredient.baseUnit),
    });
  }
  for (const row of data.inventory?.rows ?? []) {
    const key = ingredientKey(row.name);
    if (!key) continue;
    const real = parseDecimal(row.openingUnitCost);
    const known = prices.get(key);
    if (real !== null && real > 0 && row.costSource !== 'estimated') {
      prices.set(key, {
        pricePerBase: real,
        source: row.costSource === 'invoice' ? 'invoice' : 'manual',
        baseUnit: asBase(row.baseUnit) ?? known?.baseUnit ?? null,
      });
    } else if (!known) {
      const estimated = parseDecimal(row.estimatedUnitCost);
      prices.set(key, {
        pricePerBase: estimated !== null && estimated > 0 ? estimated : null,
        source: estimated !== null && estimated > 0 ? 'estimated' : 'none',
        baseUnit: asBase(row.baseUnit),
      });
    }
  }
  return prices;
}

export type LineCosting = {
  cost: number | null;
  price: IngredientPrice | null;
  unitMismatch: boolean;
};

export function costLine(
  line: OnboardingRecipeDishDraft['lines'][number],
  prices: ReadonlyMap<string, IngredientPrice>,
): LineCosting {
  const price = prices.get(ingredientKey(line.ingredient)) ?? null;
  const unit = asUnit(line.unit);
  const quantity = parseDecimal(line.quantity);
  const unitMismatch = Boolean(unit && price?.baseUnit && !unitFitsBase(unit, price.baseUnit));
  if (!unit || quantity === null || !price || unitMismatch)
    return { cost: null, price, unitMismatch };
  return {
    cost: lineCost({ quantity, unit, pricePerBase: price.pricePerBase }),
    price,
    unitMismatch,
  };
}

export type PortionCosting = {
  name: string;
  sellingPrice: number;
  cost: number;
  foodCostPct: number | null;
  band: CostBand | null;
};

export type DishCosting = {
  cost: number;
  missingPrices: number;
  estimatedLines: number;
  unitMismatches: number;
  /** One per portion (or one for the item itself). */
  portions: PortionCosting[];
  /** The full (or only) portion. */
  main: PortionCosting;
};

export function costDish(
  dish: OnboardingRecipeDishDraft,
  row: OnboardingMenuRow | undefined,
  prices: ReadonlyMap<string, IngredientPrice>,
  target: CostTarget,
): DishCosting {
  let cost = 0;
  let missingPrices = 0;
  let estimatedLines = 0;
  let unitMismatches = 0;
  for (const line of dish.lines) {
    const result = costLine(line, prices);
    if (result.unitMismatch) unitMismatches += 1;
    if (result.cost === null) missingPrices += 1;
    else cost += result.cost;
    if (result.price?.source === 'estimated') estimatedLines += 1;
  }
  const portion = (name: string, price: number, factor: number): PortionCosting => {
    const plate = cost * factor;
    // Nothing priced yet is "not costed", not a 0% food cost.
    const unpriced = dish.lines.length > 0 && missingPrices === dish.lines.length;
    const pct = dish.status === 'no-recipe' || unpriced ? null : foodCostPercent(plate, price);
    return {
      name,
      sellingPrice: price,
      cost: plate,
      foodCostPct: pct,
      band: pct === null ? null : costBand(pct, target),
    };
  };
  const variants = (row?.variants ?? []).filter((variant) => parseDecimal(variant.price) !== null);
  const portions = variants.length
    ? variants.map((variant) =>
        portion(
          variant.name,
          parseDecimal(variant.price) ?? 0,
          portionFactorForVariant(variant.name),
        ),
      )
    : [portion(row?.name ?? '', parseDecimal(row ? effectiveMenuRowPrice(row) : '') ?? 0, 1)];
  const main = portions.reduce(
    (best, entry) => (entry.sellingPrice > best.sellingPrice ? entry : best),
    portions[0]!,
  );
  return { cost, missingPrices, estimatedLines, unitMismatches, portions, main };
}

export function recipeTarget(data: OnboardingDraftData): CostTarget {
  return data.recipes
    ? { min: data.recipes.targetMin, max: data.recipes.targetMax }
    : DEFAULT_FOOD_COST_TARGET;
}

/** Menu rows that recipes can attach to (the menu step's included rows). */
export function recipeMenuRows(
  data: OnboardingDraftData,
  menuSkipped: boolean,
): OnboardingMenuRow[] {
  if (menuSkipped || !data.menu || data.menu.mode === 'later') return [];
  return includedMenuRows(data.menu.rows).filter((row) => row.name.trim());
}

/** Food cost of every costed dish's main portion: the basis of before → after diffs. */
export function marginSnapshot(data: OnboardingDraftData, menuSkipped = false): MarginSnapshot[] {
  const rows = new Map(recipeMenuRows(data, menuSkipped).map((row) => [row.key, row]));
  const prices = ingredientPrices(data);
  const target = recipeTarget(data);
  return (data.recipes?.dishes ?? []).flatMap((dish) => {
    const row = rows.get(dish.menuRowKey);
    if (!row || dish.status === 'no-recipe' || !dish.lines.length) return [];
    return [
      {
        key: dish.menuRowKey,
        name: row.name,
        foodCostPct: costDish(dish, row, prices, target).main.foodCostPct,
      },
    ];
  });
}

export function averageFoodCost(snapshot: readonly MarginSnapshot[]): number | null {
  const values = snapshot.flatMap((row) => (row.foodCostPct === null ? [] : [row.foodCostPct]));
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

/** "₹0.418 / g" → shown per kg / litre so owners recognise it. */
export function pricePerDisplayUnit(
  pricePerBase: number,
  baseUnit: CostBaseUnit | null,
): { value: number; unit: string } {
  if (baseUnit === 'G') return { value: pricePerBase * 1000, unit: 'kg' };
  if (baseUnit === 'ML') return { value: pricePerBase * 1000, unit: 'l' };
  return { value: pricePerBase, unit: 'unit' };
}
